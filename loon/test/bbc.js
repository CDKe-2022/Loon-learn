(function () {
/*
 BBC News Translate v1.0 — Loon / Shadowrocket 响应改写脚本
 改写 news-app.api.bbc.co.uk/fd/app-topic-api | app-article-api | app-front-page 的 JSON。

 与 Discord 版的差异:
  - BBC 响应是嵌套树, 用「递归遍历 + 字段白名单」收集文本 (不碰 link/trackers/url)
  - 相同原文跨位置去重, 只翻译一次 (首页 "Most Read" 与头条区大量重复)
  - 缓存键带目标语言, 切换语言不会串缓存
  - AI 引擎把多条文本用 @@SEG@@ 合并成一次调用 (每组最多 8 条)
*/
var ARG_ORDER = ["enabled","debug","target_lang","engine","provider","api_key","model",
                 "custom_base_url","custom_prompt","cache_on","maxmsgs","maxcalls","concurrency","bilingual"];

function bool(v, dflt) {
  if (v === true || v === false) return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return dflt;
}
function num(v, dflt) { var n = parseInt(v, 10); return isNaN(n) ? dflt : n; }
function str(v, dflt) { return (v === null || v === undefined) ? dflt : String(v); }

function parseArgString(s) {
  var o = {}, parts = String(s).split("&");
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i]; if (!p) continue;
    var eq = p.indexOf("="); if (eq < 0) continue;
    var k = p.slice(0, eq), v = p.slice(eq + 1);
    try { k = decodeURIComponent(k); } catch (e) { }
    try { v = decodeURIComponent(v); } catch (e) { }
    if (v === "true") v = true; else if (v === "false") v = false;
    o[k] = v;
  }
  return o;
}
var __ARG = (typeof $argument === "undefined") ? null : $argument;
if (typeof __ARG === "string") {
  var __s = __ARG.replace(/^\s+|\s+$/g, "");
  if (__s.charAt(0) === "{" || __s.charAt(0) === "[") { try { __ARG = JSON.parse(__s); } catch (e) { __ARG = null; } }
  else if (__s.indexOf("=") !== -1) { __ARG = parseArgString(__s); } else { __ARG = null; }
}
if (Array.isArray(__ARG)) {
  var __pos = {};
  for (var __i = 0; __i < ARG_ORDER.length; __i++) { __pos[ARG_ORDER[__i]] = __ARG[__i]; }
  __ARG = __pos;
}
if (__ARG && typeof __ARG !== "object") __ARG = null;

var CFG = {};
for (var ai = 0; ai < ARG_ORDER.length; ai++) { CFG[ARG_ORDER[ai]] = __ARG ? __ARG[ARG_ORDER[ai]] : null; }

var DEBUG = bool(CFG.debug, false);
var TL = str(CFG.target_lang, "zh-CN");

function probeLog(stage, detail) {
  if (!DEBUG) return;
  try { console.log("[BBC-T] " + stage + " " + detail); } catch (e) { }
}

var DONE_CALLED = false;
function doneOnce(arg) { if (DONE_CALLED) return; DONE_CALLED = true; try { $done(arg); } catch (e) { } }

function bodyText(b) {
  if (b === null || b === undefined) return null;
  if (typeof b === "string") return b;
  try {
    if (b && typeof b.length === "number" && typeof b.byteLength === "number" && typeof b.charCodeAt !== "function") {
      var s = "";
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] & 0xff);
      try { return decodeURIComponent(escape(s)); } catch (e2) { return s; }
    }
  } catch (e3) { }
  try { return String(b); } catch (e4) { return null; }
}

/* ---------- 语言判断 (同 Discord 版): 已是目标语言就不送翻 ---------- */
var _KANA = /[\u3040-\u30FF]/;
var _HANGUL = /[\uAC00-\uD7AF\u1100-\u11FF]/;
function isTargetLang(s, tl) {
  if (!s) return false;
  var han = (s.match(/[\u4E00-\u9FFF\u3400-\u4DBF]/g) || []).length;
  if (tl === "zh-CN" || tl === "zh-TW" || tl === "zh") {
    if (_KANA.test(s) || _HANGUL.test(s)) return false;
    if (han < 3) return false;
    var words = (s.match(/[A-Za-z]{2,}/g) || []).length;
    return words < 6;
  }
  if (tl === "ja") return _KANA.test(s);
  if (tl === "ko") return _HANGUL.test(s);
  return false;
}

/* ---------- 字段收集: 递归 + 白名单 ---------- */
var FIELD_KEYS = ["text", "subtext", "caption", "altText", "summary", "headline",
                  "description", "subtitle", "title", "period", "name"];

function pushField(obj, key, fields) {
  var v = obj[key];
  if (typeof v === "string" && v.length >= 2 && v.length <= 3000 &&
      !/^https?:\/\//i.test(v) && !/^[\d\s.:%\/-]+$/.test(v)) {
    fields.push({ obj: obj, key: key, text: v });
  }
}

function walk(node, fields) {
  if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], fields); return; }
  if (!node || typeof node !== "object") return;
  for (var fi = 0; fi < FIELD_KEYS.length; fi++) pushField(node, FIELD_KEYS[fi], fields);
  for (var k in node) {
    if (k === "link" || k === "trackers") continue;   /* 跳过链接与埋点 */
    var v = node[k];
    if (v && typeof v === "object") walk(v, fields);
  }
}

/* ---------- 谷歌翻译 (3 个免费端点轮换, 与 Discord 版同款) ---------- */
var GG_HOSTS = [
  "https://translate.googleapis.com/translate_a/single?client=gtx",
  "https://clients5.google.com/translate_a/single?client=dict-chrome-ex",
  "https://translate.google.com/translate_a/single?client=gtx"
];
function ggParse(respBody) {
  var out = JSON.parse(respBody);
  var src = out && out[0]; if (!src) return null;
  var text2 = "";
  for (var i = 0; i < src.length; i++) { if (src[i] && src[i][0]) text2 += src[i][0]; }
  var tr = text2.trim(); return tr || null;
}
function translateGoogle(text, targetLang, done) {
  var cachedHost = null;
  try { cachedHost = $persistentStore.read("BBCNTGGHost"); } catch (e) { }
  var order = [];
  if (cachedHost) { for (var h = 0; h < GG_HOSTS.length; h++) if (GG_HOSTS[h].indexOf(cachedHost) !== -1) order.push(GG_HOSTS[h]); }
  for (var h2 = 0; h2 < GG_HOSTS.length; h2++) if (order.indexOf(GG_HOSTS[h2]) === -1) order.push(GG_HOSTS[h2]);
  var q = "&sl=auto&tl=" + encodeURIComponent(targetLang) + "&dt=t&q=" + encodeURIComponent(text);
  var idx = 0;
  var tryNext = function () {
    if (idx >= order.length) { done(null, "GG ALL FAILED"); return; }
    var base = order[idx++];
    var hostTag = base.split("/")[2];
    $httpClient.get({ url: base + q, timeout: 6000 }, function (err, resp, data) {
      if (err) { probeLog("谷歌", hostTag + " 异常, 换下一个"); tryNext(); return; }
      try {
        var tr = ggParse(data);
        if (tr) { try { $persistentStore.write(hostTag, "BBCNTGGHost"); } catch (e) { } done(tr, null); }
        else done(null, "GG EMPTY");
      } catch (pe) { probeLog("谷歌", hostTag + " 非JSON"); tryNext(); }
    });
  };
  tryNext();
}

/* ---------- AI 翻译 (OpenAI 兼容) ---------- */
function lanDirect(url) {
  var mh = url.match(/^https?:\/\/([^\/:]+)/i);
  return !!(mh && /^(localhost$|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(mh[1]));
}
function providerBase(provider, customBase) {
  if (provider === "openrouter") return "https://openrouter.ai/api";
  if (provider === "自定义端点") return customBase;
  return "https://api.openai.com";
}
function buildAIPrompt() {
  return "你是 BBC 新闻翻译器。检测源语言, 翻译成 " + TL + "。" +
    "保留人名、地名、机构名原文, 可在括号附原文; 用地道、简洁的新闻语言, 避免直译。" +
    "\n如果文本包含 @@SEG@@ 分隔符, 请按相同顺序、相同数量分割译文, 保留 @@SEG@@ 原样。" +
    "\n只输出译文, 不要解释、不要引号。如果原文已是目标语言, 原样输出。";
}
function fetchAIModel(cfg, callback) {
  var url = cfg.base.replace(/\/+$/, "") + "/v1/models";
  var opts = { url: url, headers: { "Authorization": "Bearer " + cfg.apiKey, "Accept": "application/json" }, timeout: 10000 };
  if (lanDirect(url)) { opts.node = "DIRECT"; opts.policy = "DIRECT"; }
  $httpClient.get(opts, function (err, resp, data) {
    if (err) { callback(null, "MODELS ERR " + String(err).slice(0, 120)); return; }
    try {
      var out = JSON.parse(data);
      if (out.error && out.error.message) { callback(null, String(out.error.message).slice(0, 140)); return; }
      var ids = (out.data || []).map(function (x) { return x.id; });
      if (!ids || !ids.length) { callback(null, "MODELS EMPTY"); return; }
      var prefer = ids.filter(function (id) { return /gpt-4o-mini|gpt-4\.1-mini|gemini|flash|mini|claude/i.test(id); });
      callback(prefer.length ? prefer[0] : ids[0], null);
    } catch (e) { callback(null, "MODELS PARSE"); }
  });
}
function translateAI(text, targetLang, cfg, done) {
  var finish = function () {
    var headers = { "Content-Type": "application/json", "Authorization": "Bearer " + cfg.apiKey };
    if (cfg.provider === "openrouter") headers["HTTP-Referer"] = "https://github.com/";
    var payload = {
      model: cfg.model,
      messages: [
        { role: "system", content: buildAIPrompt() },
        { role: "user", content: text }
      ],
      temperature: 0, max_tokens: 2000, reasoning_effort: "minimal"
    };
    var url = cfg.base.replace(/\/+$/, "") + "/v1/chat/completions";
    var opts = { url: url, headers: headers, body: JSON.stringify(payload), timeout: 20000 };
    if (lanDirect(url)) { opts.node = "DIRECT"; opts.policy = "DIRECT"; }
    $httpClient.post(opts, function (err, resp, data) {
      if (err) { done(null, "AI ERR " + String(err).slice(0, 120)); return; }
      try {
        var out = JSON.parse(data);
        var c = out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
        if (typeof c === "string" && c.trim()) done(c.trim(), null);
        else done(null, "AI BAD " + (out.error && out.error.message || "").slice(0, 120));
      } catch (e) { done(null, "AI PARSE " + String(data || "").slice(0, 120)); }
    });
  };
  if (cfg.model) { finish(); return; }
  var cached = null;
  try { cached = $persistentStore.read("BBCNTAIModel:" + cfg.provider + ":" + cfg.base); } catch (e) { }
  if (cached) { cfg.model = cached; finish(); return; }
  fetchAIModel(cfg, function (model, er) {
    if (!model) { done(null, er); return; }
    cfg.model = model;
    try { $persistentStore.write(model, "BBCNTAIModel:" + cfg.provider + ":" + cfg.base); } catch (e) { }
    finish();
  });
}

/* ---------- 主流程 ---------- */
(function main() {
  try {
    if (bool(CFG.enabled, true) === false) { doneOnce({}); return; }
    var reqUrl = $request ? $request.url : "";
    if (!/news-app\.api\.bbc\.co\.uk\/fd\//i.test(reqUrl)) { doneOnce({}); return; }

    /* 文章详情接口默认直接放行 —— 它是"点进新闻"的第二个请求,
       文本量大、翻译慢会卡住文章打开。想翻文章把 translate_article=true */
    var isArticle = /app-article-api/i.test(reqUrl);
    if (isArticle && !bool(CFG.translate_article, false)) {
      probeLog("文章接口", "直接放行");
      doneOnce({}); return;
    }

    var body = bodyText($response ? $response.body : null);
    if (!body) { doneOnce({}); return; }

    var root = null;
    try { root = JSON.parse(body); } catch (e) { doneOnce({}); return; }
    if (!root || typeof root !== "object") { doneOnce({}); return; }

    /* 1. 递归收集白名单字段 */
    var fields = [];
    walk(root, fields);

    /* 2. 去重 + 语言过滤; 文章页只翻短文本(标题/摘要), 长正文不动 */
    var groups = {}, order = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (groups[f.text]) { groups[f.text].push(f); continue; }
      if (isTargetLang(f.text, TL)) continue;
      if (isArticle && f.text.length > 220) continue;
      groups[f.text] = [f]; order.push(f.text);
    }

    /* 3. 查缓存 */
    var cacheKey = "BBCNTCache:" + TL;
    var CACHE = {};
    if (bool(CFG.cache_on, true)) {
      try { CACHE = JSON.parse($persistentStore.read(cacheKey) || "{}") || {}; } catch (e) { }
    }

    var changed = 0, firstErr = null;
    var BI = bool(CFG.bilingual, true);
    function apply(refs, tr) {
      if (!refs) return;
      for (var j = 0; j < refs.length; j++) {
        refs[j].obj[refs[j].key] = BI ? (refs[j].text + "\n" + tr) : tr;
      }
    }

    var todo = [];
    for (var oi = 0; oi < order.length; oi++) {
      var tx = order[oi];
      if (CACHE[tx]) { apply(groups[tx], CACHE[tx]); changed++; }
      else todo.push(tx);
    }

    var maxmsgs = num(CFG.maxmsgs, 40);
    if (maxmsgs > 0 && todo.length > maxmsgs) { todo = todo.slice(0, maxmsgs); probeLog("截断", "超出 maxmsgs"); }

    /* 4. 组装翻译单元 */
    var engine = str(CFG.engine, "auto");
    if (engine === "auto") engine = str(CFG.api_key, "") ? "ai" : "google";

    var units = [];
    if (engine === "ai") {
      var cfgAI = {
        provider: str(CFG.provider, ""), apiKey: str(CFG.api_key, ""),
        model: str(CFG.model, ""), customBase: str(CFG.custom_base_url, ""),
        customPrompt: str(CFG.custom_prompt, "")
      };
      cfgAI.base = providerBase(cfgAI.provider, cfgAI.customBase);
      for (var b = 0; b < todo.length; b += 8) units.push({ kind: "a", texts: todo.slice(b, b + 8), cfg: cfgAI });
    } else {
      for (var g = 0; g < todo.length; g++) units.push({ kind: "g", text: todo[g] });
    }
    var maxcalls = num(CFG.maxcalls, 30);
    if (units.length > maxcalls) units = units.slice(0, maxcalls);

    var T0 = Date.now();
    var FINISHED = false;
    function safeFinish() {
      if (FINISHED) return; FINISHED = true;
      if (bool(CFG.cache_on, true)) {
        try {
          var ks = Object.keys(CACHE);
          if (ks.length > 800) { for (var d = 0; d < ks.length - 600; d++) delete CACHE[ks[d]]; }
          $persistentStore.write(JSON.stringify(CACHE), cacheKey);
        } catch (e) { }
      }
      if (changed === 0 && firstErr) {
        probeLog("失败", firstErr);
        try { $notification.post("BBC Translate", "", "翻译失败: " + firstErr); } catch (ne) { }
      }
      probeLog("完成", "new=" + changed + " 耗时=" + (Date.now() - T0) + "ms");
      doneOnce(changed ? { body: JSON.stringify(root) } : {});
    }

    /* 硬性 deadline: 到点立刻返回已完成部分, 不让 App 干等 */
    try { setTimeout(safeFinish, num(CFG.deadline, 9000)); } catch (e) { }

    function startUnit(u, onDone) {
      if (u.kind === "g") {
        translateGoogle(u.text, TL, function (tr, er) {
          if (er && !firstErr) firstErr = er;
          if (tr) { CACHE[u.text] = tr; apply(groups[u.text], tr); changed++; }
          onDone();
        });
      } else {
        var joined = u.texts.join("\n\n@@SEG@@\n\n");
        translateAI(joined, TL, u.cfg, function (tr, er) {
          if (er && !firstErr) firstErr = er;
          if (tr) {
            var parts = tr.split("@@SEG@@");
            if (parts.length === u.texts.length) {
              for (var p = 0; p < u.texts.length; p++) {
                var t2 = parts[p].trim();
                if (t2) { CACHE[u.texts[p]] = t2; apply(groups[u.texts[p]], t2); changed++; }
              }
            } else probeLog("AI分段失配", "期望 " + u.texts.length + " 实得 " + parts.length);
          }
          onDone();
        });
      }
    }

    /* 5. 有界并发 */
    var CONC = Math.max(1, num(CFG.concurrency, engine === "ai" ? 3 : 6));
    var nextIdx = 0, running = 0, doneN = 0;
    var total = units.length;
    function pump() {
      if (FINISHED) return;
      while (running < CONC && nextIdx < total) {
        var u = units[nextIdx++];
        running++;
        startUnit(u, function () {
          running--; doneN++;
          if (doneN >= total) safeFinish(); else pump();
        });
      }
    }
    if (!total) safeFinish(); else pump();

  } catch (fatal) {
    probeLog("异常", String(fatal));
    doneOnce({});
  }
})();
})();
