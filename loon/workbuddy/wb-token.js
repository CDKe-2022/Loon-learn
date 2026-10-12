/*
 * WorkBuddy 签到助手 · 长效令牌自动捕获（Loon http-response）
 * ==========================================================
 * 作用：被动扫描发往 workbuddy.cn / copilot.tencent.com 的 JSON 响应，
 *       一旦发现 refreshToken / accessToken 字段就存进本机存储。
 *
 * 为什么要它：网页会话 Cookie 只有几天寿命，而长效令牌（refresh token）
 *   不存在这个限制，且刷新接口不校验 User-Agent——是手机上最理想的凭据。
 *   本脚本用于「自动发现」该令牌，免去手动导出。
 *
 * 它不会主动修改任何响应；扫描不到就静默退出。
 *
 * 配置（Loon）：
 *   [MITM]
 *   hostname = www.workbuddy.cn, copilot.tencent.com
 *
 *   [Script]
 *   http-response ^https?:\/\/www\.workbuddy\.cn\/(console|v2|activity|api)
 *     script-path=<本文件URL>, tag=WorkBuddy令牌, enable=true
 */

const KEY_RT = "wb_refresh_token";
const KEY_AT = "wb_access_token";
const KEY_AT_EXP = "wb_access_token_exp";
const MAX_BODY = 2 * 1024 * 1024;   // 超过 2MB 不扫描
const MAX_NODES = 4000;             // 遍历节点上限，防超大 JSON
const MAX_DEPTH = 8;

function fmt(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => (n < 10 ? "0" : "") + n;
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes());
}

function saveIfChanged(key, value, subtitle, body) {
  const old = $persistentStore.read(key) || "";
  if (old === value) return false;
  $persistentStore.write(value, key);
  $notification.post("WorkBuddy 签到助手", subtitle, body);
  return true;
}

/* 在 JSON 里广度优先找出第一个 refreshToken / accessToken（字符串值） */
function findTokens(root) {
  const out = { rt: "", at: "", exp: 0 };
  if (!root || typeof root !== "object") return out;
  const queue = [{ node: root, depth: 0 }];
  let seen = 0;
  while (queue.length && seen < MAX_NODES) {
    const item = queue.shift();
    seen++;
    const node = item.node;
    if (!node || typeof node !== "object") continue;
    const keys = Object.keys(node);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i].toLowerCase();
      const v = node[keys[i]];
      if (typeof v === "string" && v.length > 8) {
        if (!out.rt && (k === "refreshtoken" || k === "refresh_token")) out.rt = v;
        else if (!out.at && (k === "accesstoken" || k === "access_token")) out.at = v;
      } else if (typeof v === "number") {
        if (!out.exp && (k === "expiresat" || k === "expires_at" || k === "expireat")) {
          out.exp = v > 1e12 ? Math.floor(v / 1000) : v;   // 兼容毫秒
        } else if (!out.exp && (k === "expiresin" || k === "expires_in")) {
          out.exp = Math.floor(Date.now() / 1000) + v;
        }
      } else if (v && typeof v === "object" && item.depth < MAX_DEPTH) {
        queue.push({ node: v, depth: item.depth + 1 });
      }
    }
  }
  return out;
}

(function () {
  try {
    if (typeof $response === "undefined" || !$response || !$response.body) {
      $done({});
      return;
    }
    const body = $response.body;
    let raw = "";
    if (typeof body === "string") raw = body;
    else return $done({});          // 二进制响应不处理

    if (!raw || raw.length > MAX_BODY) return $done({});
    if (raw.indexOf("oken") < 0) return $done({});   // 快速预筛，省电

    let root = null;
    try { root = JSON.parse(raw); } catch (e) { root = null; }

    let found = { rt: "", at: "", exp: 0 };
    if (root) {
      found = findTokens(root);
    } else {
      // 非标准 JSON 时退化为正则
      let m = /"refresh_?[Tt]oken"\s*:\s*"([^"\\]{16,})"/.exec(raw);
      if (m) found.rt = m[1];
      m = /"access_?[Tt]oken"\s*:\s*"([^"\\]{16,})"/.exec(raw);
      if (m) found.at = m[1];
    }

    if (found.rt) {
      saveIfChanged(KEY_RT, found.rt, "已捕获长效令牌",
        "签到已可脱离浏览器会话运行");
    }
    if (found.at) {
      saveIfChanged(KEY_AT, found.at, "已捕获接口令牌",
        found.exp ? ("有效期至 " + fmt(found.exp)) : "已存入本机");
      if (found.exp) $persistentStore.write(String(found.exp), KEY_AT_EXP);
    }
  } catch (e) {
    console.log("wb-token 异常: " + e);
  }
  $done({});
})();
