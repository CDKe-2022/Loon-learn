/*
 * WorkBuddy 签到助手 · 凭据抓取脚本（Loon http-request）
 * =====================================================
 * 作用：当你在 iPhone 上访问 www.workbuddy.cn 时，自动把该会话的
 *       session Cookie 与 User-Agent 存进 Loon 的持久化存储，供签到脚本使用。
 *
 * 为什么连 User-Agent 一起存：WorkBuddy 网关把会话与 UA 绑定，
 * 回放请求时必须用同一个 UA，否则会 401。
 *
 * ------------------------------------------------------------------
 * v3 修复（重要，解决「通知轰炸」）：
 *   根因：旧版把**整个 Cookie 头**当凭据存。但 Cookie 头里含
 *        `tgw_l7_route`（网关路由，服务端几乎每个响应都会重新下发）
 *        和 sensorsdata 等易变项，导致字符串几乎每次都不同，
 *        于是「内容变化 → 通知」被反复触发，打开一个页面能弹上百条。
 *   修复：
 *     1) 只抽取 `session=` 这一条作为凭据（实测四个接口只带 session 即全部正常）。
 *        其余 cookie 一律丢弃 → 存储值稳定。
 *     2) 通知去重按「会话身份（id + 到期时间）」判断，同一会话永不重复通知。
 *     3) 通知冷却期：任意两次通知至少间隔 60 秒。
 *     4) 忽略明显无效的会话：空值（服务端删除指令）、超短值、已过期。
 *     5) 有效期单调保护：新会话到期时间不早于已存的才覆盖。
 * ------------------------------------------------------------------
 *
 * 配置（Loon）：
 *   [MITM]
 *   hostname = www.workbuddy.cn, copilot.tencent.com
 *
 *   [Script]
 *   http-request ^https?:\/\/www\.workbuddy\.cn\/(console|v2|activity|api)
 *     script-path=<本文件URL>, tag=WorkBuddy凭据, enable=true
 *
 * 说明：本脚本只读取请求头、只写本机存储，不修改任何请求内容。
 */

const KEY_COOKIE = "wb_checkin_cookie";
const KEY_UA = "wb_checkin_ua";
const KEY_EXP = "wb_checkin_cookie_exp";
const KEY_RT = "wb_refresh_token";
const KEY_AT = "wb_access_token";
const NS = "wb_capture";                 // 通知去重/冷却用的键前缀

/* 抓取成功时是否发通知。若觉得打扰，改成 false 即可完全静默 */
const ENABLE_CAPTURE_NOTIFY = true;

/* 任意两次通知的最小间隔（秒） */
const NOTIFY_MIN_INTERVAL = 60;

/* session 值的最小长度：正常登录会话约 3100 字符，过短的视为垃圾/未登录 */
const MIN_SESSION_LEN = 100;

function headerValue(headers, name) {
  if (!headers) return "";
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === name) return headers[keys[i]];
  }
  return "";
}

/* 只抽取 session 这一条 cookie（抛弃 tgw_l7_route 等易变项） */
function extractSession(cookie) {
  const m = /(?:^|;\s*)(session=[^;]*)/i.exec(cookie || "");
  return m ? m[1].trim() : "";
}

/* session=<id>|<到期时间戳>|<签名> */
function sessionParts(sess) {
  const val = sess.slice(sess.indexOf("=") + 1);
  const bits = val.split("|");
  return {
    id: bits.length > 0 ? bits[0] : "",
    exp: (bits.length > 1) ? parseInt(bits[1], 10) : 0,
    len: val.length,
  };
}

function fmt(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => (n < 10 ? "0" : "") + n;
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes());
}

/* 按「身份」去重 + 冷却期 的通知 */
function notifyOnce(id, subtitle, body) {
  if (!ENABLE_CAPTURE_NOTIFY) return false;
  const now = Math.floor(Date.now() / 1000);
  const lastId = $persistentStore.read(NS + "_nid") || "";
  const lastAt = parseInt($persistentStore.read(NS + "_nat"), 10) || 0;
  if (id && id === lastId) return false;                       // 同一目标，永不重复
  if (now - lastAt < NOTIFY_MIN_INTERVAL) {                    // 冷却期
    console.log("wb-cookie: 通知处于冷却期，已抑制（距上次 " + (now - lastAt) + "s）");
    return false;
  }
  $notification.post("WorkBuddy 签到助手", subtitle, body);
  if (id) $persistentStore.write(id, NS + "_nid");
  $persistentStore.write(String(now), NS + "_nat");
  return true;
}

/* 仅当值变化时写盘 */
function saveIfChanged(key, value) {
  const old = $persistentStore.read(key) || "";
  if (old === value) return false;
  $persistentStore.write(value, key);
  return true;
}

(function () {
  try {
    if (typeof $request === "undefined" || !$request || !$request.headers) {
      $done({});
      return;
    }

    /* ---------- 1. 令牌（若该站点确实在用） ---------- */
    const rtHdr = headerValue($request.headers, "x-refresh-token");
    if (rtHdr) {
      saveIfChanged(KEY_RT, rtHdr);
      notifyOnce("rt:" + rtHdr.slice(0, 12) + ":" + rtHdr.length,
        "已捕获长效令牌", "之后签到将不再依赖浏览器会话");
    }
    const auth = headerValue($request.headers, "authorization");
    if (/^Bearer\s+\S+/i.test(auth)) {
      const at = auth.replace(/^Bearer\s+/i, "");
      saveIfChanged(KEY_AT, at);
      notifyOnce("at:" + at.slice(0, 12) + ":" + at.length,
        "已捕获接口令牌", "已存入本机，供签到脚本使用");
    }

    /* ---------- 2. session Cookie ---------- */
    const sess = extractSession(headerValue($request.headers, "cookie"));
    if (!sess) { $done({}); return; }

    const p = sessionParts(sess);
    const nowSec = Math.floor(Date.now() / 1000);

    if (p.len < MIN_SESSION_LEN) {
      console.log("wb-cookie: 忽略过短的 session（" + p.len + " 字符，疑似未登录）");
      $done({}); return;
    }
    if (p.exp && p.exp <= nowSec) {
      console.log("wb-cookie: 忽略已过期的 session（" + fmt(p.exp) + "）");
      $done({}); return;
    }

    const old = $persistentStore.read(KEY_COOKIE) || "";
    const oldExp = parseInt($persistentStore.read(KEY_EXP), 10) || 0;
    const oldStillValid = oldExp > nowSec;

    if (oldStillValid && p.exp && p.exp < oldExp) {
      console.log("wb-cookie: 忽略到期更早的会话（旧凭据 " + fmt(oldExp) +
        " 仍有效，新 " + fmt(p.exp) + "）");
      $done({}); return;
    }

    const changed = (old !== sess);
    if (changed) {
      $persistentStore.write(sess, KEY_COOKIE);
      const ua = headerValue($request.headers, "user-agent");
      if (ua) $persistentStore.write(ua, KEY_UA);
      if (p.exp) $persistentStore.write(String(p.exp), KEY_EXP);
      notifyOnce(p.id + "@" + p.exp, "凭据已捕获",
        p.exp ? ("网页会话已保存，有效至 " + fmt(p.exp))
              : "网页会话已保存，之后每天会自动签到");
    }
  } catch (e) {
    console.log("wb-cookie 异常: " + e);
  }
  $done({});
})();
