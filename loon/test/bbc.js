(function () {
/*
 BBC News Translate v1.3 — Loon 响应改写脚本 (首页 + 文章)
 =====================================================================
 v1.3 (Google 稳定版) 核心目标:
   用户点进 BBC 文章后, 尽可能保证"当前这篇文章"完整翻译;
   翻不完的留到下一次补, 而不是让当前文章被历史队列或过短的
   deadline 提前掐断。

 v1.3 相对 v1.2 的改动 (共 9 处, AI 链路一行未动):
   [1] 新增文章专用参数 article_deadline / article_maxmsgs /
       article_concurrency, 缺省时自动回落到旧参数 —— 旧配置零改动可用
   [2] 超长字段(>article_maxlen)不再整个丢弃, 改为「标点优先切段」后分别翻译再拼回
   [3] 组装顺序反转: 当前响应优先, 队列补翻其次 (原先补翻插在前面)
   [4] maxcalls/deadline 按接口分轨, 文章默认不截断、兜底更长
   [5] Google 三 Host 由「串行轮询」改为「并行竞速」——
       并发发起, 首个成功即采用, 其余回调忽略。
       根治串行 3×timeout 拖垮 deadline 导致的"整篇不翻译"
   [6] 新增文章/首页翻译统计日志(仅 debug 输出)
   [7] bodyText 的 UTF-8 兜底由废弃的 escape/unescape 改为 TextDecoder
   [8] 去掉 $httpClient 选项中无效的 policy 字段(官方参数表无此项,
       node 传 "DIRECT" 即代表直连)
   [9] 通知策略收敛: 仅在"零改动且确实失败"时提示一次,
       因 deadline 未翻完的部分不再触发失败通知

 说明: 本脚本所有 Loon API 用法均已对照官方 Script API 文档
       (nsloon.app/docs/Script/script_api) 逐条核对:
       - $httpClient 支持并发调用、支持 node/timeout/headers/body 等字段
       - $persistentStore 读写均为同步字符串
       - $done() 每次执行只应调用一次, 异步回调未完成时不应提前调用
       - setTimeout/ setInterval 行为相同(仅执行一次), 故 deadline 只作
         最后保命, 请求超时由 timeout 参数主控

 历史:
 v1.2:
  - 支持文章详情接口(app-article-api): 递归遍历天然覆盖正文段落
  - 带 spans(链接/加粗/斜体偏移)的段落强制双语 —— 原文在前保证偏移不错位, 链接可点
  - 文章段落长度上限 article_maxlen(默认1200)取代之前硬编码的 220
 v1.1:
  - 不翻 attribution.name / metadata.name / location.name (name 移出白名单, attribution 子树跳过)
  - maxmsgs/maxcalls 默认 0=不限制, 靠 deadline 兜底
  - 补翻队列 BBCNTQueue:<lang>: 本轮没翻完入队, 下次任一 BBC 响应经过时优先补翻
*/

var ARG_ORDER = ["enabled","debug","target_lang","engine","provider","api_key","model",
                 "custom_base_url","custom_prompt","cache_on","maxmsgs","maxcalls",
                 "concurrency","bilingual","deadline","translate_article",
                 "queue_flush","article_maxlen",
                 /* ---- v1.3 新增 ---- */
                 "article_deadline","article_maxmsgs","article_concurrency",
                 "gg_request_timeout","article_total_maxlen"];

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
      /* v1.3: Uint8Array -> String, 优先用 TextDecoder(标准, 支持完整 UTF-8) */
      try {
        if (typeof TextDecoder !== "undefined") {
          var td = new TextDecoder("utf-8");
          return td.decode(b);
        }
      } catch (eTD) { }
      /* 兜底: 手工解码(TextDecoder 不可用时) */
      var s = "";
      for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i] & 0xff);
      try { return decodeURIComponent(escape(s)); } catch (e2) { return s; }
    }
  } catch (e3) { }
  try { return String(b); } catch (e4) { return null; }
}

/* ---------- 语言判断 ---------- */
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

/* ---------- 字段收集: 递归 + 白名单 ----------
   白名单不含 "name" —— attribution.name / metadata.name / topic.name 均不翻。
   link / trackers / attribution 子树整棵跳过。
   spanned: 该对象含 spans 数组(样式偏移), 回填时强制双语。 */
var FIELD_KEYS = ["text", "subtext", "caption", "altText", "summary", "headline",
                  "description", "subtitle", "title", "period"];

function pushField(obj, key, fields) {
  var v = obj[key];
  if (typeof v === "string" && v.length >= 2 && v.length <= 3000 &&
      !/^https?:\/\//i.test(v) && !/^[\d\s.:%\/-]+$/.test(v)) {
    var sp = obj.spans;
    fields.push({ obj: obj, key: key, text: v, spanned: !!(sp && sp.length) });
  }
}

function walk(node, fields) {
  if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) walk(node[i], fields); return; }
  if (!node || typeof node !== "object") return;
  for (var fi = 0; fi < FIELD_KEYS.length; fi++) pushField(node, FIELD_KEYS[fi], fields);
  for (var k in node) {
    if (k === "link" || k === "trackers" || k === "attribution") continue;
    var v = node[k];
    if (v && typeof v === "object") walk(v, fields);
  }
}

/* ---------- v1.3: 超长字段「标点优先切段」 ----------
   仅用于超过 article_maxlen 的单字段。切分优先级:
     ① 句末标点 . ! ? 。！？ ② 次级标点 ; : ；：
     ③ 逗号/顿号 , ， ④ 空格(就近) ⑤ 硬切
   硬约束: 绝不在 URL / @@SEG@@ 内部切开; 单字段总量超 article_total_maxlen
   则整体放弃(计入"跳过")。 */
var SEG_HARD = "@@SEG@@";
function findSplit(text, maxLen) {
  /* 在 (0, maxLen] 区间内, 从后往前找最佳切点; 找不到返回 -1 */
  var lo = Math.max(1, Math.floor(maxLen * 0.5)); /* 至少切掉一半, 避免碎片化 */
  var i, ch;
  /* ① 句末标点 */
  for (i = maxLen; i >= lo; i--) {
    ch = text.charAt(i - 1);
    if (ch === "." || ch === "!" || ch === "?" || ch === "\u3002" || ch === "\uff01" || ch === "\uff1f") return i;
  }
  /* ② 次级标点 */
  for (i = maxLen; i >= lo; i--) {
    ch = text.charAt(i - 1);
    if (ch === ";" || ch === ":" || ch === "\uff1b" || ch === "\uff1a") return i;
  }
  /* ③ 逗号 / 顿号 */
  for (i = maxLen; i >= lo; i--) {
    ch = text.charAt(i - 1);
    if (ch === "," || ch === "\uff0c" || ch === "\u3001") return i;
  }
  /* ④ 空格 */
  for (i = maxLen; i >= lo; i--) { if (text.charAt(i - 1) === " ") return i; }
  /* ⑤ 硬切在 maxLen */
  return maxLen;
}
function isSafeCut(text, pos) {
  /* 切点前后不能落在 URL 或 @@SEG@@ 内部 */
  var tail = text.slice(0, pos);
  var at = tail.lastIndexOf("http");
  if (at !== -1) {
    var seg = tail.slice(at);
    if (!/[\s\u3002\uff01\uff1f\uff0c\u3001;:!?,]/.test(seg)) return false; /* URL 尚未结束 */
  }
  var segAt = text.lastIndexOf(SEG_HARD, pos);
  if (segAt !== -1 && segAt + SEG_HARD.length > pos && text.indexOf(SEG_HARD, segAt + SEG_HARD.length) >= pos) {
    return false; /* 落在 @@SEG@@ 中间 */
  }
  return true;
}
function splitLong(text, maxLen) {
  /* 返回子段数组(每段 <= maxLen); 若无需切分返回 null */
  if (text.length <= maxLen) return null;
  var out = [], rest = text;
  var guard = 0;
  while (rest.length > maxLen && guard++ < 200) {
    var pos = findSplit(rest, maxLen);
    if (pos <= 0) pos = maxLen;
    /* 安全修正: 若切点不安全, 向前微调 */
    var safeTries = 0;
    while (!isSafeCut(rest, pos) && safeTries++ < 40 && pos > 1) pos--;
    if (pos <= 1) pos = maxLen; /* 实在找不到就硬切 */
    out.push(rest.slice(0, pos));
    rest = rest.slice(pos);
  }
  if (rest) out.push(rest);
  return out.length > 1 ? out : null;
}

/* ---------- 谷歌翻译 (v1.3: 三 Host 并行竞速) ----------
   v1.2 为串行轮换: 最坏 3 × timeout 串行累加, 常超过 deadline 导致整篇不翻。
   v1.3 改为并发发起三个 Host, 首个成功者采用, 其余回调丢弃。 */
var GG_HOSTS = [
  "https://translate.googleapis.com/translate_a/single?client=gtx",
  "https://clients5.google.com/translate_a/single?client=dict-chrome-ex",
  "https://translate.google.com/translate_a/single?client=gtx"
];
var GG_TIMEOUT = 0; /* 运行时按 CFG 赋值 */
function ggParse(respBody) {
  var out = JSON.parse(respBody);
  var src = out && out[0]; if (!src) return null;
  var text2 = "";
  for (var i = 0; i < src.length; i++) { if (src[i] && src[i][0]) text2 += src[i][0]; }
  var tr = text2.trim(); return tr || null;
}
/* 带缓存的 host 优先级排序: 上次成功的 host 排第一(不影响并行, 仅决定内存顺序) */
function orderedHosts() {
  var cachedHost = null;
  try { cachedHost = $persistentStore.read("BBCNTGGHost"); } catch (e) { }
  if (!cachedHost) return GG_HOSTS.slice();
  var head = [], tail = [];
  for (var h = 0; h < GG_HOSTS.length; h++) {
    if (GG_HOSTS[h].indexOf(cachedHost) !== -1) head.push(GG_HOSTS[h]); else tail.push(GG_HOSTS[h]);
  }
  return head.concat(tail);
}
/* v1.3: 谷歌三 Host 并行竞速, 但必须自限并发。
   纯"每单元都并发 3 个 Host"会让 Loon 层并发失控(单元并发 × 3),
   在高负载下反被 Google 限流。改为:
     - 同一文本内部最多 GG_INFLIGHT 个 Host 同时在飞(默认 2: 主 + 备)
     - 成功即 settled, 后续 host 不再发出; 已发出的回调被丢弃
     - 主 host 失败后再补发下一个, 直至全部试完
   这样既保留"竞速抗单点慢"的优点, 又把并发压回可控范围。 */
var GG_INFLIGHT = 2;
function translateGoogle(text, targetLang, done) {
  var q = "&sl=auto&tl=" + encodeURIComponent(targetLang) + "&dt=t&q=" + encodeURIComponent(text);
  var hosts = orderedHosts();
  var settled = false, sent = 0, answered = 0, lastErr = null, cursor = 0;

  function settle(tr, er) {
    if (settled) return;             /* 已有赢家, 忽略其余回调 */
    settled = true;
    done(tr, er);
  }
  function oneFail(tag, er) {
    if (settled) return;
    if (!lastErr) lastErr = er;
    answered++;
    if (cursor < hosts.length) { fire(); return; }   /* 还有备用 host, 补发 */
    if (answered >= hosts.length) settle(null, lastErr ? ("GG ALL FAILED (" + lastErr + ")") : "GG ALL FAILED");
  }
  function fire() {
    if (settled || cursor >= hosts.length) return;
    var base = hosts[cursor++];
    var hostTag = base.split("/")[2];
    sent++;
    $httpClient.get({ url: base + q, timeout: GG_TIMEOUT }, function (err, resp, data) {
      if (settled) return;
      if (err) { probeLog("谷歌", hostTag + " 异常"); oneFail(hostTag, String(err).slice(0, 60)); return; }
      try {
        var tr = ggParse(data);
        if (tr) { try { $persistentStore.write(hostTag, "BBCNTGGHost"); } catch (e) { } settle(tr, null); }
        else oneFail(hostTag, "GG EMPTY");
      } catch (pe) { probeLog("谷歌", hostTag + " 非JSON"); oneFail(hostTag, "GG NONJSON"); }
    });
  }
  /* 首次按 GG_INFLIGHT 并发发出, 失败时由 oneFail 继续补发 */
  var first = Math.min(GG_INFLIGHT, hosts.length);
  for (var i = 0; i < first; i++) fire();
}

/* ---------- AI 翻译 (v1.3: 未改动) ---------- */
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
  if (lanDirect(url)) { opts.node = "DIRECT"; }
  $httpClient.get(opts, function (err, resp, data) {
    if (err) { callback(null, "MODELS ERR"); return; }
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
    if (lanDirect(url)) { opts.node = "DIRECT"; }
    $httpClient.post(opts, function (err, resp, data) {
      if (err) { done(null, "AI ERR " + String(err).slice(0, 120)); return; }
      try {
        var out = JSON.parse(data);
        var c = out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content;
        if (typeof c === "string" && c.trim()) done(c.trim(), null);
        else done(null, "AI BAD " + (out.error && out.error.message || "").slice(0, 120));
      } catch (e) { done(null, "AI PARSE"); }
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

    var isArticle = /app-article-api/i.test(reqUrl);
    if (isArticle && !bool(CFG.translate_article, true)) { probeLog("文章接口", "放行"); doneOnce({}); return; }

    var body = bodyText($response ? $response.body : null);
    if (!body) { doneOnce({}); return; }
    var root = null;
    try { root = JSON.parse(body); } catch (e) { doneOnce({}); return; }
    if (!root || typeof root !== "object") { doneOnce({}); return; }

    /* ===== v1.3: 首页 / 文章 参数分轨 ===== */
    var ART_MAX = num(CFG.article_maxlen, 1200);
    var TOTAL_MAX = num(CFG.article_total_maxlen, 6000);        /* 单字段总量保底上限 */
    var DEADLINE = isArticle ? num(CFG.article_deadline, 30000)
                             : num(CFG.deadline, 12000);
    var MAXMSGS  = isArticle ? num(CFG.article_maxmsgs, 0)
                             : num(CFG.maxmsgs, 0);
    var CONC_CFG = isArticle ? num(CFG.article_concurrency, 6)
                             : num(CFG.concurrency, 0);
    GG_TIMEOUT = num(CFG.gg_request_timeout, isArticle ? 6000 : 5000);

    /* 1. 收集 + 去重 */
    var fields = [];
    walk(root, fields);

    /* v1.3 stats */
    var nFields = fields.length;
    var nSkipLong = 0;   /* 超总量上限被放弃 */
    var nSplit = 0;      /* 被切段的字段数 */

    var groups = {}, order = [];
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (groups[f.text]) { groups[f.text].push(f); continue; }
      if (isTargetLang(f.text, TL)) continue;
      if (f.text.length > TOTAL_MAX) { nSkipLong++; continue; }   /* v1.3: 仅极超长放弃 */
      groups[f.text] = [f]; order.push(f.text);
    }
    var nUniq = order.length;

    /* v1.3: 超长字段切段 —— 把待翻原文按段展开, 记录每段归属 */
    /* segMap: 每段文本 -> { parent: 原文本, idx: 段序, total: 段数 }
       重要: 被切段的父文本本身【不】作为独立翻译单元进入 expanded,
             它只能由子段全部翻完后拼接产生, 否则会出现
             "整段原文被重新翻译并覆盖拼接结果" 的竞态。 */
    var segMap = {};
    var pendingParents = {};  /* parent 文本 -> true, 表示其译文须由子段拼接 */
    var expanded = [];   /* 展平后的待翻单元文本(保持顺序) */
    for (var oi0 = 0; oi0 < order.length; oi0++) {
      var tx0 = order[oi0];
      var parts = splitLong(tx0, ART_MAX);
      if (parts) {
        nSplit++;
        pendingParents[tx0] = true;
        for (var sp = 0; sp < parts.length; sp++) {
          var pt = parts[sp];
          if (isTargetLang(pt, TL)) continue;      /* 子段已是目标语言则跳过 */
          if (pt.length < 2) continue;
          if (!segMap[pt]) { segMap[pt] = { parent: tx0, idx: sp, total: parts.length }; expanded.push(pt); }
        }
      } else {
        expanded.push(tx0);
      }
    }

    /* 2. 缓存 + 补翻队列 (首页与文章共享) */
    var cacheKey = "BBCNTCache:" + TL;
    var CACHE = {};
    if (bool(CFG.cache_on, true)) {
      try { CACHE = JSON.parse($persistentStore.read(cacheKey) || "{}") || {}; } catch (e) { }
    }
    var QUEUE_KEY = "BBCNTQueue:" + TL;
    var QUEUE = {};
    try { QUEUE = JSON.parse($persistentStore.read(QUEUE_KEY) || "{}") || {}; } catch (e) { }

    var changed = 0, firstErr = null;
    var nCacheHit = 0, nTransOK = 0, nTransFail = 0;
    var BI = bool(CFG.bilingual, true);
    function apply(refs, tr) {
      if (!refs) return;
      for (var j = 0; j < refs.length; j++) {
        /* 带 spans 的段落(链接/加粗/斜体偏移)强制双语: 原文在前,
           span 的 startIndex/length 相对原文依然有效, 链接可点 */
        var bi = refs[j].spanned ? true : BI;
        refs[j].obj[refs[j].key] = bi ? (refs[j].text + "\n" + tr) : tr;
      }
    }
    /* v1.3: 切段译文回填 —— 所有子段翻完后拼接, 再写回父字段。
       注意: 并发下不能用稀疏数组长度判断, 用 cnt 显式计数。 */
    var segResult = {};   /* parent -> { total, got:{idx:tr}, cnt } */
    function segStore(parent, idx, total, tr) {
      var sr = segResult[parent];
      if (!sr) { sr = segResult[parent] = { total: total, got: {}, cnt: 0 }; }
      if (sr.got[idx] === undefined) sr.cnt++;
      sr.got[idx] = tr;
      if (sr.cnt >= sr.total) {
        var arr = [];
        for (var z = 0; z < sr.total; z++) arr.push(sr.got[z] === undefined ? "" : sr.got[z]);
        var joined = arr.join("\n");
        CACHE[parent] = joined;
        delete QUEUE[parent];
        delete segMap[parent];
        apply(groups[parent], joined);
        changed++;
      }
    }
    /* v1.3: 判断某父字段是否仍有未完成的子段(供 safeFinish 入队) */
    function segIncomplete() {
      var out = [];
      for (var st in segMap) {
        var parent = segMap[st].parent;
        if (!CACHE[parent]) out.push(parent);
      }
      return out;
    }
    /* 3. 当前响应待翻文本; 缓存命中直接回填。
       v1.3: 被切段的父文本若已有"整段缓存", 直接回填整段并跳过分段拼接;
             否则只能由子段拼接产生(父文本本身不在 expanded 中)。 */
    var todo = [];
    var parentCached = {};
    for (var pp in pendingParents) {
      if (CACHE[pp]) {
        apply(groups[pp], CACHE[pp]);
        changed++; nCacheHit++;
        parentCached[pp] = true;
        /* 该父文本下的子段无需再翻 */
        for (var sk in segMap) { if (segMap[sk].parent === pp) delete segMap[sk]; }
      }
    }
    for (var ei = 0; ei < expanded.length; ei++) {
      var tx = expanded[ei];
      if (CACHE[tx]) {
        apply(groups[tx], CACHE[tx]);
        if (segMap[tx]) segStore(segMap[tx].parent, segMap[tx].idx, segMap[tx].total, CACHE[tx]);
        else changed++;
        nCacheHit++;
      } else todo.push(tx);
    }

    /* 4. 队列补翻 (v1.3: 排到当前响应之后, 见第 5 步) */
    var flushN = num(CFG.queue_flush, 15);
    var flushing = [];
    if (flushN > 0) {
      for (var qk in QUEUE) {
        if (groups[qk] !== undefined) continue;
        flushing.push(qk);
        if (flushing.length >= flushN) break;
      }
    }

    if (MAXMSGS > 0 && todo.length > MAXMSGS) { todo = todo.slice(0, MAXMSGS); probeLog("截断", "超出 maxmsgs=" + MAXMSGS); }

    /* 5. 组装翻译单元: v1.3 当前响应在前, 补翻在后(优先级反转) */
    var engine = str(CFG.engine, "auto");
    if (engine === "auto") engine = str(CFG.api_key, "") ? "ai" : "google";

    var cfgAI = null;
    if (engine === "ai") {
      cfgAI = {
        provider: str(CFG.provider, ""), apiKey: str(CFG.api_key, ""),
        model: str(CFG.model, ""), customBase: str(CFG.custom_base_url, ""),
        customPrompt: str(CFG.custom_prompt, "")
      };
      cfgAI.base = providerBase(cfgAI.provider, cfgAI.customBase);
    }

    var units = [];
    function pushUnits(texts, isFlush) {
      if (engine === "ai") {
        for (var b = 0; b < texts.length; b += 8) units.push({ kind: "a", texts: texts.slice(b, b + 8), cfg: cfgAI, flush: !!isFlush });
      } else {
        for (var g = 0; g < texts.length; g++) units.push({ kind: "g", text: texts[g], flush: !!isFlush });
      }
    }
    pushUnits(todo, false);      /* v1.3: 当前响应优先 */
    pushUnits(flushing, true);   /* 补翻其次 */

    var maxcalls = num(CFG.maxcalls, 0);
    if (maxcalls > 0 && units.length > maxcalls) units = units.slice(0, maxcalls);  /* 截断时天然保当前响应 */

    var T0 = Date.now();
    var FINISHED = false;

    /* v1.3: 统计日志 */
    function logStats() {
      if (!DEBUG) return;
      probeLog("统计", (isArticle ? "文章" : "首页") +
        " 字段=" + nFields + " 去重=" + nUniq + " 缓存命中=" + nCacheHit);
      probeLog("统计", "本次翻译=" + nTransOK + " 失败=" + nTransFail +
        " 超长切段=" + nSplit + " 跳过(超总量)=" + nSkipLong);
      probeLog("统计", "最终修改=" + changed + "/" + nFields +
        " 耗时=" + (Date.now() - T0) + "ms 队列余=" + Object.keys(QUEUE).length);
    }

    function safeFinish() {
      if (FINISHED) return; FINISHED = true;
      var q2 = {};
      for (var fk in QUEUE) q2[fk] = true;              /* 成功的在回调里已 delete */
      for (var ti = 0; ti < todo.length; ti++) {
        if (!CACHE[todo[ti]]) q2[todo[ti]] = true;      /* 本响应没翻成的入队 */
      }
      /* v1.3: 切段未完成的父文本也入队(按父字段去重) */
      var pend = segIncomplete();
      for (var pi = 0; pi < pend.length; pi++) q2[pend[pi]] = true;
      var ks = Object.keys(q2);
      if (ks.length > 300) { q2 = {}; for (var k2 = ks.length - 300; k2 < ks.length; k2++) q2[ks[k2]] = true; }
      try { $persistentStore.write(JSON.stringify(q2), QUEUE_KEY); } catch (e) { }

      if (bool(CFG.cache_on, true)) {
        try {
          var cks = Object.keys(CACHE);
          if (cks.length > 800) { for (var d = 0; d < cks.length - 600; d++) delete CACHE[cks[d]]; }
          $persistentStore.write(JSON.stringify(CACHE), cacheKey);
        } catch (e) { }
      }
      /* v1.3: 仅"零改动且确有失败"时提示一次; 因 deadline 未翻完不再打扰 */
      if (changed === 0 && firstErr && (nTransFail > 0)) {
        try { $notification.post("BBC Translate", "", "翻译失败: " + firstErr); } catch (ne) { }
      }
      logStats();
      doneOnce(changed ? { body: JSON.stringify(root) } : {});
    }

    /* v1.3: deadline 仅作最后保命, 请求超时由 timeout 主控。
       官方: 异步任务未回调时不应提前 $done(), 故此处兜底设得远大于请求耗时。 */
    try { setTimeout(safeFinish, DEADLINE); } catch (e) { }

    function startUnit(u, onDone) {
      if (u.kind === "g") {
        translateGoogle(u.text, TL, function (tr, er) {
          if (er && !firstErr) firstErr = er;
          if (tr) {
            CACHE[u.text] = tr; delete QUEUE[u.text];
            /* v1.3: 若该文本是长字段的子段, 走拼接逻辑 */
            if (segMap[u.text]) {
              var sm = segMap[u.text];
              segStore(sm.parent, sm.idx, sm.total, tr);
            } else {
              apply(groups[u.text], tr); changed++;
            }
            nTransOK++;
          } else { nTransFail++; }
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
                if (t2) {
                  CACHE[u.texts[p]] = t2; delete QUEUE[u.texts[p]];
                  if (segMap[u.texts[p]]) {
                    var sm2 = segMap[u.texts[p]];
                    segStore(sm2.parent, sm2.idx, sm2.total, t2);
                  } else { apply(groups[u.texts[p]], t2); changed++; }
                  nTransOK++;
                } else { nTransFail++; }
              }
            } else { probeLog("AI分段失配", "期望 " + u.texts.length + " 实得 " + parts.length); nTransFail++; }
          } else if (er) { nTransFail++; }
          onDone();
        });
      }
    }

    var CONC = Math.max(1, num(CONC_CFG, engine === "ai" ? 3 : 6));
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
    probeLog("开始", (isArticle ? "文章" : "首页") + " 字段=" + nFields + " 去重=" + nUniq +
      " 待翻=" + todo.length + " 补翻=" + flushing.length + " deadline=" + DEADLINE + "ms");
    if (!total) safeFinish(); else pump();

  } catch (fatal) {
    probeLog("异常", String(fatal));
    doneOnce({});
  }
})();
})();
