/**
 * Loon 资源解析器 V2
 *
 * 全局变量（Loon 注入）
 *   $resourceType  资源类型 0:config 1:nodes 2:rules 3:rewrites 4:scripts 5:plugin
 *   $resource      资源内容
 *   $resourceUrl   资源 URL
 *   $argument      解析器插件参数
 *
 * ---------------------------------------------------------------------------
 * 参数一览（均为可选，旧参数名全部保持兼容）
 *
 * 【改名】
 *   pre            统一前缀，支持模板 {index} {name} {type} {server} {flag}
 *   suf            统一后缀，同上
 *   emoji          true=清除全部 emoji；flag=只保留国旗；false=不处理（默认）
 *   rename         替换规则，逗号分隔。支持三种写法：
 *                    普通：  香港:HK,美国:US
 *                    精确：  exact:节点A:节点B   （整名匹配才替换）
 *                    正则：  regex:/^\d+[.].+/:  （to 留空时保留结尾冒号，表示删除）
 *                  支持 \: \, 转义；to 中可用 {name} {type} {server} {flag}
 *
 * 【过滤】
 *   filter         关键词白名单，逗号分隔，只保留命中节点
 *   exclude        关键词黑名单，逗号分隔，剔除命中节点
 *   filterRegex    正则白名单
 *   excludeRegex   正则黑名单
 *   includeType    协议白名单，逗号分隔
 *   excludeType    协议黑名单，逗号分隔
 *                  协议别名：ss ssr vmess vless trojan hy2 anytls http socks5 wireguard
 *                            tuic snell mieru juicity ssh direct reject
 *
 * 【去重 / 排序 / 截断】
 *   dedup          off(默认) | name | server | strict
 *                  name=按节点名；server=按 协议+地址+端口；strict=按完整配置
 *   sort           关键词排序，逗号分隔。-关键词 表示强制排到最后，* 表示其余
 *   sortBy         keyword(默认) | name | type | area | random | none
 *   sortOrder      asc(默认) | desc
 *   typeOrder      sortBy=type 时的协议顺序，逗号分隔
 *   limit          最多保留多少个节点（排序后截取）
 *   indexStart     {index} 起始值，默认 1
 *
 * 【远程拉取】
 *   ua             true 时用自定义 UA 重新拉取原始订阅
 *   userAgent      自定义 UA 字符串
 *   headers        附加请求头，K:V|K:V 或 JSON 对象
 *   noCache        true 时带 Cache-Control: no-cache
 *   retry          拉取失败重试次数，默认 1
 *   timeout        拉取超时，单位毫秒（与 $httpClient 一致），默认 8000
 *
 * 【其它】
 *   debug          true 输出详细日志
 *   fallback       true(默认) 处理结果为空时回退原文，避免订阅被清空
 *   text           true 时对 rules/rewrites/scripts 等非节点资源也做 rename 替换
 * ---------------------------------------------------------------------------
 *
 * 改进点（相对 V1）
 *   1. Clash→Loon 由 3 种协议扩展到 10 种（ss/ssr/vmess/vless/trojan/hy2/anytls/
 *      http(s)/socks5/wireguard），Loon 不支持的协议自动跳过并计数
 *   2. 重写 YAML flow 解析器，支持 {嵌套: {map}} / [seq]，修好 ws-opts、reality-opts
 *   3. 统一节点模型 + 统一处理管道，过滤/去重/改名/排序对三种输入格式一致生效
 *   4. 修掉 V1 若干致命问题：转换全失败返回空串、base64 解出 YAML 被当节点、
 *      Loon 行格式丢序、$argument 为字符串时参数静默失效
 *   5. base64 支持 URL-safe 与无 padding，并做解码后二次格式识别
 *   6. 新增过滤、去重、协议过滤、正则、模板变量、多种排序与日志开关
 */

/* ============================== 基础工具 ============================== */

function str(v) {
  return v == null ? "" : String(v);
}

function bool(v) {
  if (v === true) return true;
  if (v === false) return false;
  var s = str(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on" || s === "开";
}

/**
 * 逗号分隔列表，同时兼容竖线分隔。
 * 原因是 Loon 的 argument=[{x}] 占位符替换时，值里若含逗号可能破坏 JSON 结构，
 * 此时用竖线分隔更稳妥（例如 exclude=剩余流量|过期|官网）。
 */
function list(v) {
  var out = [];
  var parts = str(v).replace(/\|/g, ",").split(",");
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    if (p) out.push(p);
  }
  return out;
}

function normalizeText(s) {
  s = str(s);
  if (s && s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function q(v) {
  return '"' + str(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
}

/* ============================== Emoji 处理 ============================== */

var RE_EMOJI = null;
var RE_FLAG = null;

(function buildEmojiRegex() {
  var uPattern =
    "[\u{1F000}-\u{1FAFF}\u{1FB00}-\u{1FBFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]" +
    "|[\u{FE00}-\u{FE0F}\u{2190}-\u{21FF}\u{3297}\u{3299}\u{00A9}\u{00AE}\u{2122}\u{2139}\u{24C2}]" +
    "|\u200D|\u20E3|\u3030|\u303D|\u2049|\u203C";
  try {
    RE_EMOJI = new RegExp(uPattern, "gu");
  } catch (e) {
    // 引擎不支持 u 标志时退化为代理对写法
    RE_EMOJI = /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[\u2190-\u21FF\u2600-\u27BF\u2B00-\u2BFF\u3297\u3299\u00A9\u00AE\u2122\u2139\u24C2]|\u200D|\u20E3|\uFE0F/g;
  }
  RE_FLAG = /(\uD83C[\uDDE6-\uDDFF])(\uD83C[\uDDE6-\uDDFF])/g;
})();

function stripEmoji(text) {
  RE_EMOJI.lastIndex = 0;
  return str(text).replace(RE_EMOJI, "");
}

/** 只保留国旗（地区指示符），其余 emoji 全部清除，国旗保持原位 */
function keepFlagOnly(text) {
  var s = str(text);
  RE_FLAG.lastIndex = 0;
  if (!RE_FLAG.test(s)) return stripEmoji(s);
  var flags = [];
  RE_FLAG.lastIndex = 0;
  s = s.replace(RE_FLAG, function (m) {
    flags.push(m);
    return "\u0001" + (flags.length - 1) + "\u0002";
  });
  s = stripEmoji(s);
  return s.replace(/\u0001(\d+)\u0002/g, function (m, d) {
    return flags[parseInt(d, 10)] || "";
  });
}

function tidyName(s) {
  return str(s).replace(/\s+/g, " ").trim();
}

function extractFlag(name) {
  RE_FLAG.lastIndex = 0;
  var m = str(name).match(RE_FLAG);
  return m && m.length ? m[0] : "";
}

/* ============================== 协议归一化 ============================== */

var PROTO_ALIAS = {
  ss: "ss", shadowsocks: "ss",
  ssr: "ssr", shadowsocksr: "ssr",
  vmess: "vmess",
  vless: "vless",
  trojan: "trojan",
  hysteria2: "hy2", hy2: "hy2", hysteria: "hy2",
  anytls: "anytls",
  tuic: "tuic",
  http: "http", https: "http",
  socks: "socks5", socks5: "socks5", socks4: "socks5",
  wireguard: "wireguard", wg: "wireguard",
  snell: "snell",
  mieru: "mieru",
  juicity: "juicity",
  ssh: "ssh",
  direct: "direct", reject: "reject", relay: "relay", custom: "custom"
};

var DEFAULT_TYPE_ORDER = ["anytls", "hy2", "vless", "trojan", "vmess", "ss", "ssr", "socks5", "http", "wireguard", "direct"];

/**
 * 内置地区顺序。两个用途：
 * 1) sortBy=keyword 但没填 sort 时的默认顺序——否则 keyword 模式不填词就完全不排序，
 *    而它又是插件的默认值，用户一上手就会觉得"排序没用"。
 * 2) sortBy=area 但节点名没有国旗时的回退依据。
 * 用户一旦填了 sort / typeOrder，就完全以用户的为准，本表不再参与。
 */
var DEFAULT_AREA_ORDER = [
  "香港", "澳门", "台湾", "日本", "韩国", "新加坡", "马来西亚", "泰国", "越南",
  "菲律宾", "印度尼西亚", "印度", "美国", "加拿大", "墨西哥", "巴西", "阿根廷",
  "英国", "德国", "法国", "荷兰", "瑞士", "瑞典", "挪威", "丹麦", "芬兰",
  "意大利", "西班牙", "波兰", "俄罗斯", "土耳其", "乌克兰",
  "澳大利亚", "新西兰", "南非", "埃及", "阿联酋", "沙特", "伊朗", "以色列",
];

function normProto(p) {
  var k = str(p).trim().toLowerCase();
  return PROTO_ALIAS[k] || k;
}

/* ============================== YAML 解析 ============================== */
/* V1 的问题：ws-opts: {path: /x, headers: {Host: y}} 会被当成一整个字符串，
   path / host / reality 参数全部丢失。这里用递归下降重写 flow 解析。      */

function yamlScalar(v) {
  v = str(v).trim();
  if (!v) return "";
  var c = v.charAt(0);
  if (v.length > 1) {
    var last = v.charAt(v.length - 1);
    if ((c === '"' && last === '"') || (c === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  if (v === "true" || v === "yes") return true;
  if (v === "false" || v === "no") return false;
  if (v === "null" || v === "~") return null;
  if (/^-?\d+$/.test(v)) return parseInt(v, 10);
  if (/^-?\d*\.\d+$/.test(v)) return parseFloat(v);
  return v;
}

function FlowParser(s) {
  this.s = str(s);
  this.i = 0;
}

FlowParser.prototype.ws = function () {
  while (this.i < this.s.length && /\s/.test(this.s.charAt(this.i))) this.i++;
};

FlowParser.prototype.parse = function () {
  this.ws();
  return this.value();
};

FlowParser.prototype.value = function () {
  this.ws();
  var c = this.s.charAt(this.i);
  if (c === "{") return this.map();
  if (c === "[") return this.seq();
  return this.scalar();
};

FlowParser.prototype.quoted = function () {
  var quote = this.s.charAt(this.i);
  this.i++;
  var out = "";
  while (this.i < this.s.length) {
    var ch = this.s.charAt(this.i);
    if (ch === "\\" && this.i + 1 < this.s.length) {
      out += this.s.charAt(this.i + 1);
      this.i += 2;
      continue;
    }
    if (ch === quote) {
      this.i++;
      return out;
    }
    out += ch;
    this.i++;
  }
  return out;
};

FlowParser.prototype.map = function () {
  var o = {};
  this.i++; // 跳过 {
  while (this.i < this.s.length) {
    this.ws();
    var c = this.s.charAt(this.i);
    if (c === "}") { this.i++; return o; }
    var key = this.key();
    this.ws();
    if (this.s.charAt(this.i) === ":") this.i++;
    o[key] = this.value();
    this.ws();
    if (this.s.charAt(this.i) === ",") { this.i++; continue; }
    if (this.s.charAt(this.i) === "}") { this.i++; return o; }
    if (this.i >= this.s.length) return o;
    this.i++; // 容错：跳过无法识别的字符
  }
  return o;
};

FlowParser.prototype.key = function () {
  this.ws();
  var c = this.s.charAt(this.i);
  if (c === '"' || c === "'") return this.quoted();
  var start = this.i;
  while (this.i < this.s.length && !/[:,}\[]/.test(this.s.charAt(this.i))) this.i++;
  return this.s.slice(start, this.i).trim();
};

FlowParser.prototype.seq = function () {
  var a = [];
  this.i++; // 跳过 [
  while (this.i < this.s.length) {
    this.ws();
    var c = this.s.charAt(this.i);
    if (c === "]") { this.i++; return a; }
    a.push(this.value());
    this.ws();
    if (this.s.charAt(this.i) === ",") { this.i++; continue; }
    if (this.s.charAt(this.i) === "]") { this.i++; return a; }
    if (this.i >= this.s.length) return a;
    this.i++;
  }
  return a;
};

FlowParser.prototype.scalar = function () {
  this.ws();
  var c = this.s.charAt(this.i);
  if (c === '"' || c === "'") return this.quoted();
  var start = this.i;
  while (this.i < this.s.length && !/[,}\]]/.test(this.s.charAt(this.i))) this.i++;
  return yamlScalar(this.s.slice(start, this.i));
};

/** 解析 {a: 1, b: {c: 2}} / [1, 2] 这类 flow 结构，失败返回 null */
function parseFlow(text) {
  var s = str(text).trim();
  if (!s) return null;
  var c = s.charAt(0);
  if (c !== "{" && c !== "[") return null;
  try {
    return new FlowParser(s).parse();
  } catch (e) {
    return null;
  }
}

/** 剥离行尾注释（仅在引号外且前面有空格时才认） */
function stripInlineComment(s) {
  var quote = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (quote) {
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "#" && i > 0 && /\s/.test(s.charAt(i - 1))) return s.slice(0, i);
  }
  return s;
}

/**
 * 从 Clash YAML 中提取 proxies 数组（同时支持 proxy-groups 供后续扩展）
 * 支持：嵌套缩进、flow map/seq、块序列、行尾注释
 */
function parseClashProxies(text) {
  var lines = normalizeText(text).split("\n");
  var inProxies = false;
  var baseIndent = -1;
  var current = null;
  var stack = [];
  var nodes = [];
  var inGroupSection = false;
  var groupBaseIndent = -1;

  function pathOf() {
    var out = [];
    for (var i = 0; i < stack.length; i++) out.push(stack[i].key);
    return out;
  }

  function container() {
    var obj = current;
    for (var i = 0; i < stack.length; i++) {
      var k = stack[i].key;
      // 类型纠正：栈里标记为序列但目标不是数组时（例如该 key 先被初始化成了 {}），
      // 必须强制换回 []，否则后续 Array.isArray 判断失败，alpn / peers 等数组字段会静默丢失
      if (!obj[k] || typeof obj[k] !== "object" || (stack[i].isSeq && !Array.isArray(obj[k]))) {
        obj[k] = stack[i].isSeq ? [] : {};
      }
      obj = obj[k];
    }
    return obj;
  }

  function finishNode() {
    if (current && current.name) nodes.push(current);
    current = null;
    stack = [];
  }

  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    if (!raw.trim()) continue;
    if (raw.trim().charAt(0) === "#") continue;
    var line = stripInlineComment(raw);
    var trimmed = line.trim();
    if (!trimmed) continue;

    var mIndent = line.match(/^\s*/);
    var indent = mIndent ? mIndent[0].length : 0;

    if (!inProxies) {
      // 先跳过 proxy-groups 段：它内部也有一个 proxies 字段，不能当成节点列表
      if (inGroupSection) {
        if (indent <= groupBaseIndent && /^[A-Za-z0-9_"'.-]+\s*:/.test(trimmed)) inGroupSection = false;
        else continue;
      }
      if (/^proxy-groups\s*:/.test(trimmed)) {
        inGroupSection = true;
        groupBaseIndent = indent;
        continue;
      }
      if (/^proxies\s*:\s*(\[\s*\])?\s*$/.test(trimmed)) {
        inProxies = true;
        baseIndent = indent;
      }
      continue;
    }

    // 回到与 proxies 平级的新键 → proxies 段结束
    if (indent <= baseIndent && /^[A-Za-z0-9_"'.-]+\s*:/.test(trimmed)) {
      break;
    }

    // 新的列表项
    var item = line.match(/^\s*-\s+(.*)$/);
    if (item) {
      var rest = item[1].trim();

      // 情况一：属于上层 key 的块序列（peers: / alpn: / 其它数组字段）
      if (stack.length) {
        var top = stack[stack.length - 1];
        if (top.pending && indent > top.indent) {
          // 上一行 "key:" 为空，这里出现 "- "，说明该 key 是序列而非 map
          top.isSeq = true;
          top.pending = false;
          var seqParent = current;
          for (var q = 0; q < stack.length - 1; q++) seqParent = seqParent[stack[q].key];
          seqParent[top.key] = [];
        }
        if (top.isSeq) {
          var arr = container();
          if (Array.isArray(arr)) {
            if (rest.charAt(0) === "{") {
              var fm = parseFlow(rest);
              arr.push(fm === null ? rest : fm);
            } else if (rest.indexOf(":") > -1) {
              var seqItem = parseFlow("{" + rest + "}");
              arr.push(seqItem && typeof seqItem === "object" ? seqItem : {});
            } else {
              arr.push(yamlScalar(rest));
            }
          }
          continue;
        }
      }

      // 情况二：新的 proxy 列表项
      finishNode();
      current = {};
      stack = [];
      if (rest.charAt(0) === "{") {
        var flow = parseFlow(rest);
        current = flow && typeof flow === "object" ? flow : {};
        finishNode();
        continue;
      }
      var mm = rest.match(/^([^:]+):\s*(.*)$/);
      if (mm) {
        var k = mm[1].trim();
        var v = mm[2].trim();
        if (v.charAt(0) === "{" || v.charAt(0) === "[") {
          var pv = parseFlow(v);
          if (pv !== null) { current[k] = pv; continue; }
        }
        current[k] = yamlScalar(v);
      }
      continue;
    }

    if (!current) continue;

    var kv = trimmed.match(/^([^:]+):\s*(.*)$/);
    if (!kv) continue;
    var key = kv[1].trim();
    var value = kv[2].trim();

    while (stack.length && indent <= stack[stack.length - 1].indent) stack.pop();

    var holder = container();

    // 当前容器是数组 → 说明这是块序列元素的后续字段（peers 的常见写法）
    if (Array.isArray(holder)) {
      if (holder.length) {
        var lastItem = holder[holder.length - 1];
        if (!lastItem || typeof lastItem !== "object") {
          lastItem = {};
          holder[holder.length - 1] = lastItem;
        }
        if (value.charAt(0) === "{" || value.charAt(0) === "[") {
          var pv2 = parseFlow(value);
          if (pv2 !== null) { lastItem[key] = pv2; continue; }
        }
        lastItem[key] = yamlScalar(value);
      }
      continue;
    }

    if (!value) {
      // 可能是嵌套 map，也可能是块序列，由后续行是否以 "- " 开头决定
      holder[key] = {};
      stack.push({ indent: indent, key: key, isSeq: false, pending: true });
      continue;
    }

    if (stack.length) stack[stack.length - 1].pending = false;

    if (value.charAt(0) === "{" || value.charAt(0) === "[") {
      var parsed = parseFlow(value);
      if (parsed !== null) { holder[key] = parsed; continue; }
    }
    holder[key] = yamlScalar(value);
  }

  finishNode();
  return nodes;
}

/** 判断文本是否像 Clash YAML */
/**
 * 只认 proxies 段。proxy-providers 是另一套机制（订阅里只有它时解析不出任何节点），
 * 原先一并匹配会让这类文件先做一次注定失败的 YAML 解析，再回退别的格式。
 */
function looksLikeClashYaml(text) {
  return /^\s*proxies\s*:/m.test(str(text));
}

/* ============================== Clash → Loon 转换 ============================== */

function optBool(key, value) {
  if (value === undefined || value === null || value === "") return null;
  if (value === true || value === "true") return key + "=true";
  if (value === false || value === "false") return key + "=false";
  return null;
}

function optStr(key, value) {
  if (value === undefined || value === null || value === "") return null;
  return key + "=" + value;
}

function optQuote(key, value) {
  if (value === undefined || value === null || value === "") return null;
  return key + "=" + q(value);
}

/** 取第一个非空值 */
function pick() {
  for (var i = 0; i < arguments.length; i++) {
    var v = arguments[i];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return "";
}

function alpnValue(v) {
  if (Array.isArray(v)) v = v.join(",");
  v = str(v).trim();
  return v ? v.split(",")[0].trim() : "";
}

function getNested(obj, path) {
  var o = obj;
  for (var i = 0; i < path.length; i++) {
    if (!o || typeof o !== "object") return undefined;
    o = o[path[i]];
  }
  return o;
}

/**
 * 把单个 Clash 代理对象转成 Loon 节点 body（不含名字）
 * 返回 null 表示该协议 Loon 不支持或参数不完整，调用方计入 skipped
 */
function clashToLoonBody(n) {
  var type = normProto(n.type);
  var server = pick(n.server, n.hostname);
  var port = pick(n.port);
  var udp = optBool("udp", n.udp);
  var skip = optBool("skip-cert-verify", n["skip-cert-verify"]);
  var sni = pick(n.sni, n.servername);
  var opts = [];

  // WireGuard 的 server/port 藏在 peers 里，单独校验
  if (type !== "wireguard" && (!server || !port)) return null;

  /* ---------- Shadowsocks ---------- */
  if (type === "ss") {
    var cipher = pick(n.cipher, n.method, "none");
    var pw = pick(n.password);
    var base = "Shadowsocks," + server + "," + port + "," + cipher + "," + q(pw);
    var plugin = str(n.plugin).toLowerCase();
    var popts = n["plugin-opts"] && typeof n["plugin-opts"] === "object" ? n["plugin-opts"] : {};
    if (plugin === "obfs") {
      // Simple Obfs：Loon 只支持 http / tls
      var mode = str(popts.mode).toLowerCase();
      if (mode === "http" || mode === "tls") {
        opts.push("obfs-name=" + mode);
        var obfsHost = pick(popts.host, n["obfs-host"]);
        if (obfsHost) opts.push("obfs-host=" + obfsHost);
        if (popts.path) opts.push("obfs-uri=" + popts.path);
      }
    } else if (plugin === "shadow-tls") {
      opts.push("shadow-tls-password=" + q(pick(popts.password)));
      opts.push("shadow-tls-sni=" + pick(popts.host, sni));
      opts.push("shadow-tls-version=" + pick(popts.version, 2));
    } else if (plugin === "v2ray-plugin") {
      return null; // Loon 的 Shadowsocks 不支持 v2ray-plugin，转换后必然连不上
    }
    if (udp) opts.push(udp);
    var fastOpen = optBool("fast-open", n["fast-open"]);
    if (fastOpen) opts.push(fastOpen);
    return base + (opts.length ? "," + opts.join(",") : "");
  }

  /* ---------- ShadowsocksR ---------- */
  if (type === "ssr") {
    var ssrBase = "ShadowsocksR," + server + "," + port + "," +
      pick(n.cipher) + "," + q(pick(n.password)) + "," +
      "protocol=" + pick(n.protocol, "origin") + "," +
      "obfs=" + pick(n.obfs, "plain");
    var pp = pick(n["protocol-param"], n.protocolparam, n["protocol_param"]);
    if (pp) opts.push("protocol-param=" + pp);
    var op = pick(n["obfs-param"], n.obfsparam, n["obfs_param"]);
    if (op) opts.push("obfs-param=" + op);
    if (udp) opts.push(udp);
    return ssrBase + (opts.length ? "," + opts.join(",") : "");
  }

  /* ---------- VMess ---------- */
  if (type === "vmess") {
    var network = str(pick(n.network, n.type2, "tcp")).toLowerCase();
    if (network === "grpc" || network === "h2" || network === "httpupgrade" || network === "quic") {
      return null; // Loon VMess 仅支持 tcp / ws / http
    }
    var vCipher = pick(n.cipher, "auto");
    var body = "vmess," + server + "," + port + "," + vCipher + "," + q(pick(n.uuid));
    opts.push("transport=" + (network === "ws" || network === "http" ? network : "tcp"));
    opts.push("alterId=" + pick(n.alterId, 0));
    var vPath = "", vHost = "";
    if (network === "ws") {
      var ws = n["ws-opts"] && typeof n["ws-opts"] === "object" ? n["ws-opts"] : {};
      var wsHeaders = ws.headers && typeof ws.headers === "object" ? ws.headers : {};
      vPath = pick(ws.path, n["ws-path"]);
      vHost = pick(wsHeaders.Host, wsHeaders.host, n.host);
    } else if (network === "http") {
      var httpOpts = n["http-opts"] && typeof n["http-opts"] === "object" ? n["http-opts"] : {};
      var hHeaders = httpOpts.headers && typeof httpOpts.headers === "object" ? httpOpts.headers : {};
      vPath = pick(httpOpts.path, n.path);
      vHost = pick(hHeaders.Host, hHeaders.host, n.host);
    } else {
      vHost = pick(n.host);
    }
    if (vPath) opts.push("path=" + vPath);
    if (vHost) opts.push("host=" + vHost);
    opts.push("over-tls=" + (n.tls === true || n.tls === "true" ? "true" : "false"));
    if (sni) opts.push("sni=" + sni);
    if (skip) opts.push(skip);
    if (udp) opts.push(udp);
    return body + "," + opts.join(",");
  }

  /* ---------- VLESS ---------- */
  if (type === "vless") {
    var lNetwork = str(pick(n.network, "tcp")).toLowerCase();
    if (lNetwork === "grpc" || lNetwork === "h2" || lNetwork === "quic" || lNetwork === "httpupgrade") {
      return null;
    }
    var lBody = "VLESS," + server + "," + port + "," + q(pick(n.uuid));
    opts.push("transport=" + (lNetwork === "ws" || lNetwork === "http" ? lNetwork : "tcp"));
    var lPath = "", lHost = "";
    if (lNetwork === "ws") {
      var lWs = n["ws-opts"] && typeof n["ws-opts"] === "object" ? n["ws-opts"] : {};
      var lWsHeaders = lWs.headers && typeof lWs.headers === "object" ? lWs.headers : {};
      lPath = pick(lWs.path, n["ws-path"]);
      lHost = pick(lWsHeaders.Host, lWsHeaders.host, n.host);
    } else if (lNetwork === "http") {
      var lHttp = n["http-opts"] && typeof n["http-opts"] === "object" ? n["http-opts"] : {};
      lPath = pick(lHttp.path, n.path);
      lHost = pick(n.host);
    }
    if (lPath) opts.push("path=" + lPath);
    if (lHost) opts.push("host=" + lHost);

    var reality = n["reality-opts"] && typeof n["reality-opts"] === "object" ? n["reality-opts"] : {};
    var flow = pick(n.flow);
    if (flow && flow !== "null") opts.push("flow=" + flow);
    if (reality["public-key"]) opts.push("public-key=" + q(reality["public-key"]));
    if (reality["short-id"]) opts.push("short-id=" + reality["short-id"]);

    var tlsOn = n.tls === true || n.tls === "true" || !!reality["public-key"];
    opts.push("over-tls=" + (tlsOn ? "true" : "false"));
    if (sni) opts.push("sni=" + sni);
    if (skip) opts.push(skip);
    if (n["client-fingerprint"]) opts.push("tls-profile=" + n["client-fingerprint"]);
    if (udp) opts.push(udp);
    return lBody + "," + opts.join(",");
  }

  /* ---------- Trojan ---------- */
  if (type === "trojan") {
    var tNetwork = str(pick(n.network, "tcp")).toLowerCase();
    if (tNetwork === "grpc") return null;
    var tBody = "trojan," + server + "," + port + "," + q(pick(n.password));
    if (tNetwork === "ws" || tNetwork === "http") {
      opts.push("transport=" + tNetwork);
      var tOpts = n[tNetwork === "ws" ? "ws-opts" : "http-opts"];
      if (tOpts && typeof tOpts === "object") {
        var tHeaders = tOpts.headers && typeof tOpts.headers === "object" ? tOpts.headers : {};
        if (tOpts.path) opts.push("path=" + tOpts.path);
        var tHost = pick(tHeaders.Host, tHeaders.host, n.host);
        if (tHost) opts.push("host=" + tHost);
      }
    }
    var alpn = alpnValue(n.alpn);
    if (alpn) opts.push("alpn=" + alpn);
    if (sni) opts.push("sni=" + sni);
    if (skip) opts.push(skip);
    if (udp) opts.push(udp);
    return tBody + (opts.length ? "," + opts.join(",") : "");
  }

  /* ---------- Hysteria 2 ---------- */
  if (type === "hy2") {
    var hyPw = pick(n.auth, n.password, n.auth_str, n["auth-str"]);
    var hyBody = "Hysteria2," + server + "," + port + "," + q(hyPw);
    if (sni) opts.push("sni=" + sni);
    if (skip) opts.push(skip);
    var obfsMode = str(n.obfs).toLowerCase();
    if (obfsMode === "salamander" && n["obfs-password"]) {
      opts.push("salamander-password=" + q(n["obfs-password"]));
    }
    var hyAlpn = alpnValue(n.alpn);
    if (hyAlpn) opts.push("alpn=" + hyAlpn);
    if (udp) opts.push(udp);
    return hyBody + (opts.length ? "," + opts.join(",") : "");
  }

  /* ---------- AnyTLS ---------- */
  if (type === "anytls") {
    var aBody = "AnyTLS," + server + "," + port + "," + q(pick(n.password));
    if (sni) opts.push("sni=" + sni);
    if (skip) opts.push(skip);
    if (udp) opts.push(udp);
    opts.push("block-quic=false");
    return aBody + "," + opts.join(",");
  }

  /* ---------- HTTP / HTTPS ---------- */
  if (type === "http") {
    var isTls = n.tls === true || n.tls === "true" || str(n.scheme).toLowerCase() === "https";
    var hBody = (isTls ? "https" : "http") + "," + server + "," + port;
    var user = pick(n.username, n.user);
    var pass = pick(n.password);
    if (user) hBody += "," + user + "," + q(pass);
    if (isTls) {
      if (sni) opts.push("sni=" + sni);
      if (skip) opts.push(skip);
    }
    return hBody + (opts.length ? "," + opts.join(",") : "");
  }

  /* ---------- SOCKS5 ---------- */
  if (type === "socks5") {
    var sBody = "socks5," + server + "," + port;
    var sUser = pick(n.username, n.user);
    var sPass = pick(n.password);
    if (sUser) sBody += "," + sUser + "," + q(sPass);
    if (n.tls === true || n.tls === "true") {
      opts.push("over-tls=true");
      if (sni) opts.push("sni=" + sni);
    }
    if (skip) opts.push(skip);
    if (udp) opts.push(udp);
    return sBody + (opts.length ? "," + opts.join(",") : "");
  }

  /* ---------- WireGuard ---------- */
  if (type === "wireguard") {
    var peers = n.peers;
    // 兼容平铺写法：部分 Clash 配置把 peer 参数直接放在节点外层，而不是 peers 数组里
    if (!Array.isArray(peers) || !peers.length) {
      if (n.server && n.port && (n["public-key"] || n.publicKey)) {
        peers = [{
          server: n.server,
          port: n.port,
          "public-key": pick(n["public-key"], n.publicKey),
          "preshared-key": pick(n["preshared-key"], n.presharedKey),
          "allowed-ips": pick(n["allowed-ips"], n.allowedIps, "0.0.0.0/0"),
          reserved: n.reserved
        }];
      } else {
        return null;
      }
    }
    var p0 = peers[0] && typeof peers[0] === "object" ? peers[0] : {};
    var peerServer = pick(p0.server, p0.endpoint ? str(p0.endpoint).split(":")[0] : "");
    var peerPort = pick(p0.port, p0.endpoint && str(p0.endpoint).indexOf(":") > -1 ? str(p0.endpoint).split(":")[1] : "");
    if (!peerServer || !peerPort) return null;
    var wParts = ["wireguard"];
    if (n.ip) wParts.push("interface-ip=" + n.ip);
    if (n.ipv6 || n.ip6) wParts.push("interface-ipV6=" + pick(n.ipv6, n.ip6));
    wParts.push("private-key=" + q(pick(n["private-key"], n.privateKey)));
    if (n.mtu) wParts.push("mtu=" + n.mtu);
    var dns = pick(n.dns);
    if (dns) wParts.push("dns=" + (Array.isArray(dns) ? dns[0] : dns));
    if (n.keepalive) wParts.push("keepalive=" + n.keepalive);
    var peerSeg = [];
    peerSeg.push("public-key=" + q(pick(p0["public-key"], p0.publicKey)));
    if (p0["preshared-key"]) peerSeg.push("preshared-key=" + q(p0["preshared-key"]));
    if (p0.reserved) {
      var reserved = Array.isArray(p0.reserved) ? p0.reserved : str(p0.reserved).split(",");
      peerSeg.push("reserved=[" + reserved.join(",") + "]");
    }
    peerSeg.push("allowed-ips=" + q(pick(p0["allowed-ips"], "0.0.0.0/0")));
    peerSeg.push("endpoint=" + peerServer + ":" + peerPort);
    wParts.push("peers=[{" + peerSeg.join(",") + "}]");
    if (udp) wParts.push(udp);
    return wParts.join(",");
  }

  // tuic / snell / mieru / juicity / ssh / hysteria(1) 等 Loon 不支持
  return null;
}

/* ============================== 统一节点模型 ============================== */

/**
 * node = {
 *   index, name, protocol,
 *   body   : Loon 行格式中 " = " 右侧内容，如 "Shadowsocks,a.com,443,..."
 *   prefix : URI 格式中 fragment 之前的部分，如 "ss://xxx#"
 *   slot   : 回填位置（用于保序）
 * }
 */

function makeNode(opts) {
  return {
    index: opts.index || 0,
    name: opts.name || "",
    protocol: opts.protocol || "",
    body: opts.body || "",
    prefix: opts.prefix || "",
    raw: opts.raw || "",
    encode: opts.encode || null,
    slot: opts.slot == null ? -1 : opts.slot
  };
}

/* ============================== 解析：Loon 行格式 ============================== */

function splitLoonLine(line) {
  var s = str(line);
  var idx = s.indexOf(" = ");
  if (idx > 0) return { name: s.slice(0, idx).trim(), body: s.slice(idx + 3).trim() };
  // 兼容无空格写法（name=shadowsocks,host,port）。
  // 必须要求 body 含逗号：否则整段 base64 会因为末尾的 padding "=" 被切开，
  // 变成一条名字是一长串乱码的假节点，真正的节点反而全丢了。
  idx = s.indexOf("=");
  if (idx > 0) {
    var name = s.slice(0, idx).trim();
    var body = s.slice(idx + 1).trim();
    if (body.indexOf(",") > 0) return { name: name, body: body };
  }
  return null;
}

function parseLoonStyle(text) {
  var lines = normalizeText(text).split("\n");
  var slots = [];
  var nodes = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) { slots.push({ kind: "keep", text: "" }); continue; }
    if (line.charAt(0) === "#" || line.charAt(0) === "[" || line.charAt(0) === ";") {
      slots.push({ kind: "keep", text: line });
      continue;
    }
    var kv = splitLoonLine(line);
    if (!kv || !kv.body) { slots.push({ kind: "keep", text: line }); continue; }
    var proto = normProto(kv.body.split(",")[0]);
    slots.push({ kind: "node", node: makeNode({ index: nodes.length, name: kv.name, protocol: proto, body: kv.body, slot: slots.length }) });
    nodes.push(slots[slots.length - 1].node);
  }
  return { slots: slots, nodes: nodes };
}

/* ============================== 解析：URI 列表 ============================== */

function uriProto(uri) {
  var m = str(uri).match(/^([a-zA-Z0-9+-]+):\/\//);
  return m ? normProto(m[1]) : "";
}

function decodeFragment(frag) {
  try { return decodeURIComponent(frag); } catch (e) { return frag; }
}

function extractRemarkName(line) {
  var m = str(line).match(/[?&]remark=([^&#]*)/);
  if (!m) return null;
  return decodeFragment(m[1]);
}

/* --- vmess:// ：名字在 base64 JSON 的 ps 字段里，通常没有 #片段 --- */

function parseVmessUri(line) {
  if (str(line).toLowerCase().indexOf("vmess://") !== 0) return null;
  var rest = line.slice(8);
  var hashPos = rest.indexOf("#");
  var payload = hashPos > -1 ? rest.slice(0, hashPos) : rest;
  var decoded = base64DecodeUnicode(payload);
  if (!decoded) return null;
  var obj = null;
  try { obj = JSON.parse(decoded); } catch (e) { return null; }
  if (!obj || typeof obj !== "object") return null;
  return {
    obj: obj,
    name: pick(obj.ps, obj.remarks, obj.name, ""),
    suffix: hashPos > -1 ? rest.slice(hashPos) : ""
  };
}

function vmessEncoder(obj, suffix) {
  return function (newName) {
    obj.ps = newName;
    if (obj.remarks !== undefined) obj.remarks = newName;
    var encoded = base64EncodeUnicode(JSON.stringify(obj));
    if (encoded === null) return null;
    return "vmess://" + encoded + suffix;
  };
}

/* --- ssr:// ：名字在 base64 明文串的 remarks 参数里（值通常再做一次 base64） --- */

function parseSsrUri(line) {
  if (str(line).toLowerCase().indexOf("ssr://") !== 0) return null;
  var rest = line.slice(6);
  var hashPos = rest.indexOf("#");
  var payload = hashPos > -1 ? rest.slice(0, hashPos) : rest;
  var decoded = base64DecodeUnicode(payload);
  if (!decoded) return null;
  var m = decoded.match(/[?&]remarks=([^&]*)/);
  if (!m) return null;
  var name = decodeFragment(m[1]);
  var inner = base64DecodeUnicode(name);
  if (inner && !/[\u0000-\u0008\u000E-\u001F]/.test(inner)) name = inner;
  return {
    decoded: decoded,
    name: name,
    urlSafe: /[-_]/.test(payload),
    suffix: hashPos > -1 ? rest.slice(hashPos) : ""
  };
}

function ssrEncoder(decoded, urlSafe, suffix) {
  return function (newName) {
    var encodedName = base64EncodeUnicode(newName);
    if (encodedName === null) return null;
    var remarksValue = encodedName.replace(/=+$/, "");
    var next = decoded.replace(/([?&]remarks=)[^&]*/, "$1" + remarksValue);
    var out = base64EncodeUnicode(next);
    if (out === null) return null;
    out = out.replace(/=+$/, "");
    if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_");
    return "ssr://" + out + suffix;
  };
}

function parseUriList(text) {
  var lines = normalizeText(text).split("\n");
  var slots = [];
  var nodes = [];
  var protoHits = 0;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) { slots.push({ kind: "keep", text: "" }); continue; }
    if (line.charAt(0) === "#") { slots.push({ kind: "keep", text: line }); continue; }

    var proto = uriProto(line);
    if (proto) protoHits++;

    var hashPos = line.lastIndexOf("#");
    if (hashPos > -1 && hashPos < line.length - 1) {
      var left = line.slice(0, hashPos + 1);
      var name = decodeFragment(line.slice(hashPos + 1));
      slots.push({ kind: "node", node: makeNode({ index: nodes.length, name: name, protocol: proto, prefix: left, slot: slots.length }) });
      nodes.push(slots[slots.length - 1].node);
      continue;
    }

    // vmess:// 的名字在 base64 JSON 的 ps 字段里
    if (proto === "vmess") {
      var vm = parseVmessUri(line);
      if (vm) {
        slots.push({
          kind: "node",
          node: makeNode({
            index: nodes.length, name: vm.name, protocol: proto, slot: slots.length,
            raw: line, encode: vmessEncoder(vm.obj, vm.suffix)
          })
        });
        nodes.push(slots[slots.length - 1].node);
        continue;
      }
    }

    // ssr:// 的名字在 base64 明文的 remarks 参数里
    if (proto === "ssr") {
      var sm = parseSsrUri(line);
      if (sm) {
        slots.push({
          kind: "node",
          node: makeNode({
            index: nodes.length, name: sm.name, protocol: proto, slot: slots.length,
            raw: line, encode: ssrEncoder(sm.decoded, sm.urlSafe, sm.suffix)
          })
        });
        nodes.push(slots[slots.length - 1].node);
        continue;
      }
    }

    var remark = extractRemarkName(line);
    if (remark) {
      slots.push({ kind: "node", node: makeNode({ index: nodes.length, name: remark, protocol: proto, prefix: line + "#", slot: slots.length }) });
      nodes.push(slots[slots.length - 1].node);
      continue;
    }

    slots.push({ kind: "keep", text: line });
  }
  // 一条都不像 URI 时不认为解析成功
  if (!protoHits) return null;
  return { slots: slots, nodes: nodes };
}

/* ============================== 解析：Clash YAML ============================== */

function parseClashToLoon(text) {
  var proxies = parseClashProxies(text);
  if (!proxies.length) return null;
  var nodes = [];
  var skipped = {};
  for (var i = 0; i < proxies.length; i++) {
    var p = proxies[i];
    var type = normProto(p.type);
    var body = clashToLoonBody(p);
    if (!body) {
      skipped[type] = (skipped[type] || 0) + 1;
      continue;
    }
    nodes.push(makeNode({
      index: nodes.length,
      name: pick(p.name, "node-" + (i + 1)),
      protocol: type,
      body: body,
      slot: -1
    }));
  }
  if (!nodes.length) {
    debug("[解析器] Clash 转换全部失败: " + JSON.stringify(skipped));
    return null;
  }
  var skipInfo = [];
  for (var k in skipped) {
    if (Object.prototype.hasOwnProperty.call(skipped, k)) skipInfo.push(k + "×" + skipped[k]);
  }
  if (skipInfo.length) debug("[解析器] 不支持/无法转换已跳过: " + skipInfo.join(", "));
  return { slots: null, nodes: nodes, converted: nodes.length, skipped: skipped };
}

/* ============================== 解析：SIP008 JSON ============================== */

function parseSip008(text) {
  var trimmed = str(text).trim();
  if (trimmed.charAt(0) !== "{") return null;
  var data = null;
  try { data = JSON.parse(trimmed); } catch (e) { return null; }
  if (!data || !Array.isArray(data.servers) || !data.servers.length) return null;
  var nodes = [];
  for (var i = 0; i < data.servers.length; i++) {
    var s = data.servers[i];
    if (!s.server || !s.server_port) continue;
    var body = "Shadowsocks," + s.server + "," + s.server_port + "," + pick(s.method, "none") + "," + q(pick(s.password));
    if (s.plugin === "simple-obfs" && s.plugin_opts) {
      var po = {};
      var parts = str(s.plugin_opts).split(";");
      for (var j = 0; j < parts.length; j++) {
        var kv = parts[j].split("=");
        if (kv.length === 2) po[kv[0].trim()] = kv[1].trim();
      }
      if (po.obfs) {
        body += ",obfs-name=" + po.obfs;
        if (po["obfs-host"]) body += ",obfs-host=" + po["obfs-host"];
      }
    }
    nodes.push(makeNode({ index: nodes.length, name: pick(s.remarks, s.name, "node-" + (i + 1)), protocol: "ss", body: body, slot: -1 }));
  }
  if (!nodes.length) return null;
  return { slots: null, nodes: nodes };
}

/* ============================== base64 ============================== */

function base64DecodeUnicode(s) {
  try {
    var t = str(s).replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    while (t.length % 4 !== 0) t += "=";
    var binary = atob(t);
    var bytes = [];
    for (var i = 0; i < binary.length; i++) {
      bytes.push("%" + ("00" + binary.charCodeAt(i).toString(16)).slice(-2));
    }
    return decodeURIComponent(bytes.join(""));
  } catch (e) {
    return null;
  }
}

/** base64 编码（UTF-8 安全）；环境不支持 btoa 时返回 null，调用方回退原行 */
function base64EncodeUnicode(s) {
  try {
    if (typeof btoa === "undefined") return null;
    var enc = encodeURIComponent(str(s));
    var bin = "";
    for (var i = 0; i < enc.length; i++) {
      if (enc.charAt(i) === "%") {
        bin += String.fromCharCode(parseInt(enc.substr(i + 1, 2), 16));
        i += 2;
      } else {
        bin += enc.charAt(i);
      }
    }
    return btoa(bin);
  } catch (e) {
    return null;
  }
}

function looksLikeBase64(text) {
  var s = str(text).replace(/\s+/g, "");
  if (s.length < 16) return false;
  if (/^[A-Za-z0-9+/\-_]+={0,2}$/.test(s)) return true;
  return false;
}

/* ============================== 改名 ============================== */

var renameRules = [];

function splitEscaped(s, sep) {
  var out = [];
  var cur = "";
  var esc = false;
  s = str(s);
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (esc) { cur += "\\" + ch; esc = false; continue; }
    if (ch === "\\") { esc = true; continue; }
    if (ch === sep) { out.push(cur); cur = ""; } else { cur += ch; }
  }
  if (esc) cur += "\\";
  out.push(cur);
  return out;
}

function indexOfUnescaped(s, ch) {
  var esc = false;
  s = str(s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === ch) return i;
  }
  return -1;
}

function unescapeText(s) {
  return str(s)
    .replace(/\\\\/g, "\u0000")
    .replace(/\\:/g, ":")
    .replace(/\\,/g, ",")
    .replace(/\\\//g, "/")
    .replace(/\u0000/g, "\\");
}

function lastIndexOfUnescaped(s, ch) {
  var esc = false;
  var found = -1;
  s = str(s);
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i);
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === ch) found = i;
  }
  return found;
}

/**
 * 语法：
 *   香港:HK                    子串替换
 *   exact:原名:新名            整名精确匹配
 *   regex:/pattern/flags:新串  正则替换（to 留空即删除）
 *   regex:pattern:新串         不带斜杠时按正则处理
 */
function parseRenameRules(raw) {
  renameRules = [];
  if (!raw) return;
  var items = splitEscaped(raw, ",");
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    if (!item) continue;

    // 正则模式：自己解析 pattern / flags / to，避免标记冒号被当成分隔符
    if (item.indexOf("regex:") === 0) {
      var rest = item.slice(6);
      var pattern = rest;
      var to = "";
      var flags = "g";
      if (rest.charAt(0) === "/") {
        // 非贪婪 + 回溯：既能正确处理转义斜杠 \/，也兼容 pattern 里出现裸 /
        var m = rest.match(/^\/(.*?)\/([gimsu]*)(?::([\s\S]*))?$/);
        if (m) { pattern = m[1]; to = m[3]; if (m[2]) flags = m[2]; }
        else log("[解析器] rename 规则写法有误，已跳过：" + item +
          "（正确写法 regex:/匹配内容/标志:替换为，例如 regex:/^\\d+\\.\\s+/:）");
      } else {
        var li = lastIndexOfUnescaped(rest, ":");
        if (li > -1) { pattern = rest.slice(0, li); to = rest.slice(li + 1); }
      }
      pattern = unescapeText(pattern).trim();
      if (!pattern) continue;
      var re = null;
      try { re = new RegExp(pattern, flags); }
      catch (e2) {
        log("[解析器] rename 的正则表达式非法，已跳过：" + pattern + "（" + e2.message + "）");
        re = null;
      }
      if (re) renameRules.push({ mode: "regex", re: re, to: unescapeText(to) });
      continue;
    }

    var isExact = item.indexOf("exact:") === 0;
    var body = isExact ? item.slice(6) : item;
    var idx = indexOfUnescaped(body, ":");
    if (idx === -1) continue;
    var from = unescapeText(body.slice(0, idx)).trim();
    var to2 = unescapeText(body.slice(idx + 1)).trim();
    if (!from) continue;

    if (isExact) renameRules.push({ mode: "exact", from: from, to: to2 });
    else renameRules.push({ mode: "substr", from: from, to: to2 });
  }
}

/* ============================== 模板 ============================== */

function renderTemplate(tpl, ctx) {
  return str(tpl)
    .replace(/\{name\}/g, str(ctx.name))
    .replace(/\{type\}/g, str(ctx.proto))
    .replace(/\{server\}/g, str(ctx.server))
    .replace(/\{flag\}/g, str(ctx.flag));
}

function renderIndex(tpl, index) {
  return str(tpl).replace(/\{index\}/g, String(index));
}

/* ============================== 过滤 / 去重 / 排序 ============================== */

function nodeServer(node) {
  if (node.body) {
    var parts = node.body.split(",");
    return parts.length > 2 ? parts[1] + ":" + parts[2] : "";
  }
  var s = str(node.prefix).replace(/^[a-zA-Z0-9+-]+:\/\//, "").replace(/#$/, "");
  var m = s.match(/@([^\/\?#]+)/);
  if (m) return m[1];
  if (node.protocol === "vmess") {
    var payload = s.replace(/#$/, "");
    var decoded = base64DecodeUnicode(payload);
    if (decoded) {
      try {
        var o = JSON.parse(decoded);
        return str(o.add) + ":" + str(o.port);
      } catch (e) {}
    }
  }
  return "";
}

function fingerprint(node, mode) {
  if (mode === "name") return "n:" + node.name;
  if (mode === "server") return "s:" + node.protocol + "|" + nodeServer(node);
  if (mode === "strict") return "x:" + node.protocol + "|" + node.body + "|" + node.prefix;
  return "";
}

function dedupNodes(nodes, mode) {
  if (!mode || mode === "off") return { list: nodes, removed: 0 };
  var seen = {};
  var out = [];
  for (var i = 0; i < nodes.length; i++) {
    var fp = fingerprint(nodes[i], mode);
    if (fp && seen[fp]) continue;
    seen[fp] = 1;
    out.push(nodes[i]);
  }
  return { list: out, removed: nodes.length - out.length };
}

function matchKeyword(name, keyword) {
  return str(name).indexOf(keyword) !== -1;
}

function filterNodes(nodes, cfg) {
  var out = [];
  var dropFilter = 0, dropExclude = 0, dropType = 0;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var name = n.name;

    if (cfg.filter.length) {
      var hit = false;
      for (var a = 0; a < cfg.filter.length; a++) {
        if (matchKeyword(name, cfg.filter[a])) { hit = true; break; }
      }
      if (!hit) { dropFilter++; continue; }
    }

    if (cfg.exclude.length) {
      var dropped = false;
      for (var b = 0; b < cfg.exclude.length; b++) {
        if (matchKeyword(name, cfg.exclude[b])) { dropped = true; break; }
      }
      if (dropped) { dropExclude++; continue; }
    }

    if (cfg.filterRegex) {
      try { if (!new RegExp(cfg.filterRegex).test(name)) { dropFilter++; continue; } } catch (e) {}
    }
    if (cfg.excludeRegex) {
      try { if (new RegExp(cfg.excludeRegex).test(name)) { dropExclude++; continue; } } catch (e) {}
    }

    if (cfg.includeType.length && cfg.includeType.indexOf(n.protocol) === -1) { dropType++; continue; }
    if (cfg.excludeType.length && cfg.excludeType.indexOf(n.protocol) !== -1) { dropType++; continue; }

    out.push(n);
  }
  return { list: out, dropFilter: dropFilter, dropExclude: dropExclude, dropType: dropType };
}

var KEYWORD_HEAD = 0;
var KEYWORD_MID = 500;
var KEYWORD_TAIL = 1000;

function buildKeywordIndex(name, cfg, words) {
  var list = words || cfg.sort;
  if (!list.length) return 0;
  for (var i = 0; i < list.length; i++) {
    var kw = list[i];
    if (kw === "*") continue;
    var tail = kw.charAt(0) === "-";
    var real = tail ? kw.slice(1) : kw;
    if (!real) continue;
    if (matchKeyword(name, real)) return (tail ? KEYWORD_TAIL : KEYWORD_HEAD) + i;
  }
  return KEYWORD_MID;
}

/** 按内置地区表给节点名算排序权重，用于 area 模式无国旗时的回退 */
function areaIndex(name) {
  for (var i = 0; i < DEFAULT_AREA_ORDER.length; i++) {
    if (matchKeyword(name, DEFAULT_AREA_ORDER[i])) return i;
  }
  return DEFAULT_AREA_ORDER.length;
}

function compareText(a, b) {
  var x = str(a), y = str(b);
  if (x === y) return 0;
  return x < y ? -1 : 1;
}

function sortNodes(nodes, cfg) {
  var list = nodes.slice();
  if (cfg.sortBy === "none") return list;

  var typeOrder = cfg.typeOrder.length ? cfg.typeOrder : DEFAULT_TYPE_ORDER;
  // keyword 没填词时退回到内置地区顺序，避免"选了排序却毫无变化"
  var sortWords = cfg.sort.length ? cfg.sort : DEFAULT_AREA_ORDER;
  var usingDefaultArea = !cfg.sort.length;

  list.sort(function (a, b) {
    var r = 0;
    if (cfg.sortBy === "keyword") {
      r = buildKeywordIndex(a.name, cfg, sortWords) - buildKeywordIndex(b.name, cfg, sortWords);
    } else if (cfg.sortBy === "name") {
      r = compareText(a.name, b.name);
    } else if (cfg.sortBy === "type") {
      r = typeIndex(a.protocol, typeOrder) - typeIndex(b.protocol, typeOrder);
    } else if (cfg.sortBy === "area") {
      var fa = extractFlag(a.name), fb = extractFlag(b.name);
      // 有国旗就按国旗排；都没有国旗时退回按名称里的地区词排
      if (fa || fb) r = compareText(fa, fb);
      else r = areaIndex(a.name) - areaIndex(b.name);
    } else if (cfg.sortBy === "random") {
      r = (a.__rand || 0) - (b.__rand || 0);
    }
    if (r !== 0) return cfg.sortOrder === "desc" ? -r : r;
    return cfg.sortOrder === "desc" ? b.index - a.index : a.index - b.index;
  });

  reportSortState(nodes, list, cfg, typeOrder, usingDefaultArea);
  return list;
}

/** 无条件输出排序结果说明——"选了排序却没反应"时，这一行能说清原因 */
function reportSortState(before, after, cfg, typeOrder, usingDefaultArea) {
  if (cfg.sortBy === "none") { log("[解析器] 排序：sortBy=none，保持订阅原顺序"); return; }

  var changed = false;
  for (var i = 0; i < before.length && i < after.length; i++) {
    if (before[i] !== after[i]) { changed = true; break; }
  }

  if (cfg.sortBy === "keyword") {
    if (usingDefaultArea) {
      log("[解析器] 排序：按内置默认地区顺序（未填 sort，如需自定义请填写「地区排序关键词」，" +
        "例如 香港,日本,美国）");
    } else {
      log("[解析器] 排序：按自定义关键词顺序（" + cfg.sort.join(" ") + "）");
    }
  } else if (cfg.sortBy === "name") {
    log("[解析器] 排序：按节点名称");
  } else if (cfg.sortBy === "type") {
    var order = cfg.typeOrder.length ? "自定义" : "内置默认";
    log("[解析器] 排序：按协议（" + order + "顺序 " + typeOrder.join(" > ") + "）");
  } else if (cfg.sortBy === "area") {
    var hasFlag = false;
    for (var j = 0; j < before.length; j++) { if (extractFlag(before[j].name)) { hasFlag = true; break; } }
    log("[解析器] 排序：按地区（" + (hasFlag ? "依据节点名中的国旗" : "节点名无国旗，已改用地区关键词") +
      "）。注意 emoji=true 会清除国旗，此时也走关键词");
  } else if (cfg.sortBy === "random") {
    log("[解析器] 排序：随机打乱（每次拉取订阅顺序都会变）");
  }

  if (!changed) {
    log("[解析器] 排序：结果与原顺序相同——可能所有节点的排序依据都一样" +
      "（例如全是同一地区、同一协议、或名称里没有匹配的关键词）");
  }
}

function typeIndex(proto, order) {
  var i = order.indexOf(proto);
  return i === -1 ? order.length : i;
}

/* ============================== 主处理 ============================== */

var CFG = {};
var DEBUG = false;
var ARG_EMPTY = false; // 是否没收到任何插件参数，用于给出可操作的排查提示

function log(msg) { console.log(msg); }
function debug(msg) { if (DEBUG) console.log(msg); }

function applyNameRules(nodes, cfg) {
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    var name = n.name;

    // 1) emoji
    if (cfg.emoji === "true") name = stripEmoji(name);
    else if (cfg.emoji === "flag") name = keepFlagOnly(name);
    name = tidyName(name);

    // 2) rename
    for (var r = 0; r < renameRules.length; r++) {
      var rule = renameRules[r];
      if (rule.mode === "regex") {
        rule.re.lastIndex = 0;
        name = name.replace(rule.re, rule.to);
      } else if (rule.mode === "exact") {
        if (name === rule.from) name = rule.to;
      } else {
        name = name.split(rule.from).join(rule.to);
      }
    }

    // 3) 模板变量（{index} 留到序列化时替换）
    if (cfg.pre.indexOf("{") > -1 || cfg.suf.indexOf("{") > -1 || name.indexOf("{") > -1) {
      var ctx = {
        name: n.name,
        proto: n.protocol,
        server: nodeServer(n),
        flag: extractFlag(name)
      };
      name = renderTemplate(name, ctx);
    }

    name = tidyName(name);
    if (!name) name = "node-" + (n.index + 1);
    n.name = name;
  }
  return nodes;
}

function serialize(parsed, nodes) {
  // 无法回填到原槽位时（Clash / SIP008 转换）直接顺序输出
  if (!parsed.slots) {
    var lines = [];
    for (var i = 0; i < nodes.length; i++) lines.push(renderLine(nodes[i], i));
    return lines.join("\n");
  }
  // 保序：非节点行留在原处，节点按新顺序填回原节点槽位
  var ordered = [];
  var k = 0;
  for (var s = 0; s < parsed.slots.length; s++) {
    var slot = parsed.slots[s];
    if (slot.kind === "keep") ordered.push(slot.text);
    else if (k < nodes.length) ordered.push(renderLine(nodes[k++], k - 1));
  }
  for (; k < nodes.length; k++) ordered.push(renderLine(nodes[k], k));
  return ordered.join("\n");
}

function renderLine(node, order) {
  var idx = CFG.indexStart + order;
  var name = renderIndex(node.name, idx);
  var pre = renderIndex(renderTemplate(CFG.pre, {
    name: name, proto: node.protocol, server: nodeServer(node), flag: extractFlag(name)
  }), idx);
  var suf = renderIndex(renderTemplate(CFG.suf, {
    name: name, proto: node.protocol, server: nodeServer(node), flag: extractFlag(name)
  }), idx);
  name = pre + name + suf;
  if (node.encode) {
    var encoded = node.encode(name);
    if (encoded !== null && encoded !== undefined) return encoded;
    return node.raw || (node.prefix + encodeURIComponent(name));
  }
  if (node.prefix) return node.prefix + encodeURIComponent(name);
  return name + " = " + node.body;
}

/** 识别输入格式并解析 */
/**
 * 逐层识别订阅格式。
 * depth 用于 base64 嵌套：解出来还是未知格式时递归再认一次，最多 2 层。
 * 关键点：base64 解出来的内容必须走完整的识别流程（YAML / JSON / URI / 行格式），
 * 早期版本只认了前三种，导致「base64 包裹的 Loon 行格式」被当成一个乱码节点，
 * 表现为插件里填任何参数都不生效。
 */
function parseAny(text, depth) {
  depth = depth || 0;
  var raw = normalizeText(text);
  var trimmed = raw.trim();
  if (!trimmed) return null;
  var tag = depth > 0 ? "[解析器] (第 " + depth + " 层) " : "[解析器] ";

  // 1) SIP008 JSON
  var json = parseSip008(trimmed);
  if (json) { log(tag + "识别为 SIP008 JSON"); return json; }

  // 2) Clash YAML（明文）
  if (looksLikeClashYaml(trimmed)) {
    var yaml = parseClashToLoon(trimmed);
    if (yaml) { log(tag + "识别为 Clash YAML"); return yaml; }
  }

  // 3) base64：递归识别解码后的内容，覆盖全部内层格式
  if (depth < 2 && looksLikeBase64(trimmed)) {
    var decoded = base64DecodeUnicode(trimmed);
    if (decoded && decoded !== trimmed) {
      var inner = parseAny(decoded, depth + 1);
      if (inner && inner.nodes.length) {
        log(tag + "识别为 base64 包裹的订阅内容");
        return inner;
      }
    }
  }

  // 4) 明文 URI 列表
  var plainUri = parseUriList(trimmed);
  if (plainUri && plainUri.nodes.length) { log(tag + "识别为 URI 列表"); return plainUri; }

  // 5) Loon / Surge 行格式
  var loon = parseLoonStyle(trimmed);
  if (loon && loon.nodes.length) { log(tag + "识别为 Loon 行格式"); return loon; }

  return null;
}

function processResource(content) {
  var raw = normalizeText(content);
  if (!raw.trim()) return "";

  var parsed = parseAny(raw);
  if (!parsed || !parsed.nodes.length) {
    log("[解析器] 未识别资源格式，原样返回");
    return raw;
  }

  var nodes = parsed.nodes;
  var total = nodes.length;
  log("[解析器] 解析到节点: " + total);

  // 改名
  applyNameRules(nodes, CFG);

  // 去重
  var d = dedupNodes(nodes, CFG.dedup);
  nodes = d.list;

  // 过滤
  var f = filterNodes(nodes, CFG);
  nodes = f.list;

  // 排序
  if (CFG.sortBy === "random") {
    for (var i = 0; i < nodes.length; i++) nodes[i].__rand = Math.random();
  }
  nodes = sortNodes(nodes, CFG);

  // 截断
  if (CFG.limit > 0 && nodes.length > CFG.limit) nodes = nodes.slice(0, CFG.limit);

  // 安全兜底：处理后一个不剩就还原文，避免订阅被清空
  if (!nodes.length) {
    log("[解析器] 过滤后无节点，已回退原文（检查 filter / exclude / includeType 配置）");
    return CFG.fallback ? raw : "";
  }

  var result = serialize(parsed, nodes);
  if (!result.trim() && CFG.fallback) {
    log("[解析器] 序列化结果为空，已回退原文");
    return raw;
  }

  var stats = ["总计 " + total, "保留 " + nodes.length];
  if (d.removed) stats.push("去重 -" + d.removed);
  if (f.dropFilter) stats.push("未命中白名单 -" + f.dropFilter);
  if (f.dropExclude) stats.push("命中黑名单 -" + f.dropExclude);
  if (f.dropType) stats.push("协议过滤 -" + f.dropType);
  log("[解析器] " + stats.join(" / "));

  return result;
}

/* ============================== 远程拉取 ============================== */

function parseHeaders(raw) {
  var out = {};
  if (!raw) return out;
  var s = str(raw).trim();
  if (s.charAt(0) === "{") {
    try {
      var o = JSON.parse(s);
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = str(o[k]);
      return out;
    } catch (e) {}
  }
  var parts = s.split("|");
  for (var i = 0; i < parts.length; i++) {
    var idx = parts[i].indexOf(":");
    if (idx > 0) out[parts[i].slice(0, idx).trim()] = parts[i].slice(idx + 1).trim();
  }
  return out;
}

function refetch(attempt) {
  if (typeof $httpClient === "undefined" || !$httpClient) {
    log("[解析器] 当前环境不支持自定义 UA 拉取，已回退默认内容");
    finish(typeof $resource !== "undefined" ? $resource : "");
    return;
  }
  if (typeof $resourceUrl === "undefined" || !$resourceUrl) {
    log("[解析器] 缺少资源地址，已回退默认内容");
    finish(typeof $resource !== "undefined" ? $resource : "");
    return;
  }

  var headers = parseHeaders(CFG.headers);
  if (CFG.userAgent) headers["User-Agent"] = CFG.userAgent;
  if (CFG.noCache) headers["Cache-Control"] = "no-cache";

  var req = { url: String($resourceUrl), headers: headers };
  if (CFG.timeout > 0) req.timeout = CFG.timeout;

  debug("[解析器] 开始拉取(第 " + (attempt + 1) + " 次): " + req.url);
  $httpClient.get(req, function (error, response, data) {
    if (error || !data) {
      if (attempt < CFG.retry) {
        debug("[解析器] 拉取失败，准备重试");
        refetch(attempt + 1);
        return;
      }
      log("[解析器] 自定义 UA 拉取失败，已回退默认内容");
      finish(typeof $resource !== "undefined" ? $resource : "");
      return;
    }
    debug("[解析器] 自定义 UA 拉取成功，长度 " + str(data).length);
    finish(data);
  });
}

/* ============================== 入口 ============================== */

var typeName = { 0: "config", 1: "nodes", 2: "rules", 3: "rewrites", 4: "scripts", 5: "plugin" };

function processTextResource(content) {
  // rules / rewrites / scripts：可选做 rename 替换 + 去重行
  var raw = normalizeText(content);
  if (!CFG.text) return raw;
  var lines = raw.split("\n");
  var out = [];
  var seen = {};
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (!line.trim()) { out.push(line); continue; }
    var replaced = line;
    for (var r = 0; r < renameRules.length; r++) {
      var rule = renameRules[r];
      if (rule.mode === "regex") { rule.re.lastIndex = 0; replaced = replaced.replace(rule.re, rule.to); }
      else if (rule.mode === "exact") { if (replaced === rule.from) replaced = rule.to; }
      else replaced = replaced.split(rule.from).join(rule.to);
    }
    if (CFG.dedup !== "off") {
      var key = replaced.trim();
      if (key && seen[key]) continue;
      seen[key] = 1;
    }
    out.push(replaced);
  }
  return out.join("\n");
}

function finish(content) {
  var type = typeof $resourceType !== "undefined" ? $resourceType : 1;
  log("[解析器] 资源类型: " + (typeName[type] || type));
  var result = type === 1 ? processResource(content) : processTextResource(content);
  $done(result);
}

/* 参数读取：$argument 可能是对象，也可能是 JSON 字符串或 k=v 串 */
function readArgument() {
  var arg = typeof $argument !== "undefined" ? $argument : null;
  var obj = null;

  if (arg && typeof arg === "object") {
    obj = arg;
  } else if (arg && typeof arg === "string") {
    var s = arg.trim();
    if (s.charAt(0) === "{" || s.charAt(0) === "[") {
      try { obj = JSON.parse(s); } catch (e) { obj = null; }
    }
    if (!obj) {
      obj = {};
      var pairs = splitEscaped(s, "&");
      for (var i = 0; i < pairs.length; i++) {
        var p = pairs[i];
        if (!p) continue;
        var idx = p.indexOf("=");
        if (idx > 0) obj[p.slice(0, idx).trim()] = decodeFragment(p.slice(idx + 1));
      }
    }
  }

  var g = function (k) { return obj && obj[k] !== undefined ? obj[k] : undefined; };

  CFG.pre = str(g("pre"));
  CFG.suf = str(g("suf"));
  var emojiRaw = str(g("emoji")).trim().toLowerCase();
  if (emojiRaw === "flag" || emojiRaw === "keep-flag" || emojiRaw === "keepflag") CFG.emoji = "flag";
  else if (emojiRaw === "true" || emojiRaw === "1" || emojiRaw === "yes" || emojiRaw === "on") CFG.emoji = "true";
  else CFG.emoji = "false";

  CFG.sort = list(g("sort"));
  CFG.sortBy = str(g("sortBy")).trim().toLowerCase() || "keyword";
  CFG.sortOrder = str(g("sortOrder")).trim().toLowerCase() === "desc" ? "desc" : "asc";
  CFG.typeOrder = list(g("typeOrder"));

  CFG.filter = list(g("filter"));
  CFG.exclude = list(g("exclude"));
  CFG.filterRegex = str(g("filterRegex"));
  CFG.excludeRegex = str(g("excludeRegex"));
  CFG.includeType = normalizeTypes(g("includeType"));
  CFG.excludeType = normalizeTypes(g("excludeType"));

  CFG.dedup = str(g("dedup")).trim().toLowerCase() || "off";
  CFG.limit = parseInt(g("limit"), 10);
  if (isNaN(CFG.limit) || CFG.limit < 0) CFG.limit = 0;
  CFG.indexStart = parseInt(g("indexStart"), 10);
  if (isNaN(CFG.indexStart)) CFG.indexStart = 1;

  CFG.ua = bool(g("ua"));
  CFG.userAgent = str(g("userAgent"));
  CFG.headers = str(g("headers"));
  CFG.noCache = bool(g("noCache"));
  CFG.retry = parseInt(g("retry"), 10);
  if (isNaN(CFG.retry) || CFG.retry < 0) CFG.retry = 1;
  // 与 $httpClient 保持一致，单位是毫秒
  CFG.timeout = parseInt(g("timeout"), 10);
  if (isNaN(CFG.timeout) || CFG.timeout <= 0) CFG.timeout = 8000;

  DEBUG = bool(g("debug"));
  CFG.fallback = g("fallback") === undefined ? true : bool(g("fallback"));
  CFG.text = bool(g("text"));

  parseRenameRules(str(g("rename")));

  ARG_EMPTY = !obj;
}

/** 无条件输出参数接收状态——"填了参数却没效果"时，这一行能直接定位问题 */
function reportArgumentState() {
  if (ARG_EMPTY) {
    log("[解析器] 参数状态：没有收到插件参数，本次仅做格式转换。" +
      "如果你在插件里填了参数却看到这条，说明参数没传进脚本，请检查 .plugin 里 " +
      "[Argument] 的参数名与 script(...) 中的占位符是否一一对应（旧语法是 {x}，新语法是 ${x}）。");
    return;
  }
  var on = [];
  if (CFG.pre) on.push("pre");
  if (CFG.suf) on.push("suf");
  if (CFG.emoji !== "false") on.push("emoji=" + CFG.emoji);
  if (CFG.exclude.length) on.push("exclude");
  if (CFG.filter.length) on.push("filter");
  if (CFG.includeType.length) on.push("includeType");
  if (CFG.excludeType.length) on.push("excludeType");
  if (CFG.filterRegex) on.push("filterRegex");
  if (CFG.excludeRegex) on.push("excludeRegex");
  if (renameRules.length) on.push("rename×" + renameRules.length);
  if (CFG.dedup !== "off") on.push("dedup=" + CFG.dedup);
  if (CFG.sort.length) on.push("sort");
  if (CFG.sortBy !== "keyword") on.push("sortBy=" + CFG.sortBy);
  if (CFG.limit > 0) on.push("limit=" + CFG.limit);
  if (CFG.ua) on.push("自定义UA拉取");
  log("[解析器] 参数状态：" + (on.length
    ? "已收到 " + on.join(" ")
    : "已收到参数，但全部为默认值（未填写）"));
}

function normalizeTypes(v) {
  var out = [];
  var arr = list(v);
  for (var i = 0; i < arr.length; i++) out.push(normProto(arr[i]));
  return out;
}

(function init() {
  readArgument();
  reportArgumentState();
  debug("[解析器] 已读取插件参数明细: " + JSON.stringify({
    pre: CFG.pre, suf: CFG.suf, emoji: CFG.emoji, sort: CFG.sort,
    sortBy: CFG.sortBy, sortOrder: CFG.sortOrder, filter: CFG.filter,
    exclude: CFG.exclude, includeType: CFG.includeType, excludeType: CFG.excludeType,
    dedup: CFG.dedup, limit: CFG.limit, rename: renameRules.length
  }));
  var type = typeof $resourceType !== "undefined" ? $resourceType : 1;
  if (CFG.ua && type === 1) refetch(0);
  else finish(typeof $resource !== "undefined" ? $resource : "");
})();
