/*
 * WorkBuddy 签到助手 · 凭据抓取脚本（Loon http-request）
 * =====================================================
 * 作用：当你在 iPhone 上访问 www.workbuddy.cn 时，自动把该会话的
 *       Cookie 与 User-Agent 存进 Loon 的持久化存储，供签到脚本使用。
 *
 * 为什么连 User-Agent 一起存：WorkBuddy 网关把会话与 UA 绑定，
 * 回放请求时必须用同一个 UA，否则会 401。
 *
 * v2 改进（重要）：
 *   1) 有效期单调保护——会话 Cookie 里带到期时间戳（session=id|ts|sig）。
 *      只有当新抓到的会话「到期时间不早于」已存的那条时才覆盖，
 *      避免浏览器里残留的旧标签页会话把有效凭据冲掉。
 *   2) 已存凭据其实已过期时，无条件接受新凭据（不会把自己锁死）。
 *   3) 只在内容真的变化时才写盘、才发通知，避免无谓写入与通知轰炸。
 *   4) 顺带捕获 authorization / x-refresh-token 请求头里的令牌（若有）。
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

function headerValue(headers, name) {
  if (!headers) return "";
  const keys = Object.keys(headers);
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].toLowerCase() === name) return headers[keys[i]];
  }
  return "";
}

/* 从 cookie 串里取出会话到期时间戳（秒）；取不到返回 0 */
function sessionExpiry(cookie) {
  const m = /(?:^|;\s*)session=([^;]*)/.exec(cookie || "");
  if (!m) return 0;
  const parts = m[1].split("|");
  if (parts.length < 2) return 0;
  const ts = parseInt(parts[1], 10);
  // 合理的 Unix 秒级时间戳区间（2001 ~ 2065），防止把签名段误当时间
  return (ts > 1000000000 && ts < 3000000000) ? ts : 0;
}

function fmt(ts) {
  const d = new Date(ts * 1000);
  const p = (n) => (n < 10 ? "0" : "") + n;
  return (d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
    p(d.getHours()) + ":" + p(d.getMinutes());
}

/* 仅当值变化时写盘并通知 */
function saveIfChanged(key, value, subtitle, body) {
  const old = $persistentStore.read(key) || "";
  if (old === value) return false;
  $persistentStore.write(value, key);
  $notification.post("WorkBuddy 签到助手", subtitle, body);
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
      saveIfChanged(KEY_RT, rtHdr, "已捕获长效令牌",
        "之后签到将不再依赖浏览器会话");
    }
    const auth = headerValue($request.headers, "authorization");
    if (/^Bearer\s+\S+/i.test(auth)) {
      saveIfChanged(KEY_AT, auth.replace(/^Bearer\s+/i, ""), "已捕获接口令牌",
        "已存入本机，供签到脚本使用");
    }

    /* ---------- 2. 会话 Cookie ---------- */
    const cookie = headerValue($request.headers, "cookie");
    const ua = headerValue($request.headers, "user-agent");

    if (cookie && cookie.indexOf("session=") >= 0) {
      const old = $persistentStore.read(KEY_COOKIE) || "";
      const newExp = sessionExpiry(cookie);
      const oldExp = parseInt($persistentStore.read(KEY_EXP), 10) || 0;
      const nowSec = Math.floor(Date.now() / 1000);

      // 旧凭据已过期 → 必须接受新的；否则要求新的不早于旧的到期
      const oldStillValid = oldExp > nowSec;
      const newerOrEqual = (newExp === 0) || (newExp >= oldExp);
      const accept = !oldStillValid || newerOrEqual;

      if (!accept) {
        console.log("wb-cookie: 忽略一条到期更早的会话（旧凭据尚有效，" +
          fmt(oldExp) + " > 新 " + fmt(newExp) + "）");
      } else {
        const changed = (old !== cookie);
        $persistentStore.write(cookie, KEY_COOKIE);
        if (ua) $persistentStore.write(ua, KEY_UA);
        if (newExp) $persistentStore.write(String(newExp), KEY_EXP);

        if (changed) {
          $notification.post("WorkBuddy 签到助手", "凭据已捕获",
            newExp ? ("网页会话已保存，有效至 " + fmt(newExp))
                   : "网页会话已保存，之后每天会自动签到");
        }
      }
    }
  } catch (e) {
    console.log("wb-cookie 异常: " + e);
  }
  $done({});
})();
