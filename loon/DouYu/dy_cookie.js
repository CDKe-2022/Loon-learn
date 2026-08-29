/*
 * 脚本名称：douyu_cookie_capture.js
 * 脚本类型：http-response
 * 匹配 URL：^https?:\/\/apiv2\.douyucdn\.cn\/H5nc\/welcome\/to
 * 功能：
 *   1) 从请求 Cookie 抓取 install_id、ttreq
 *   2) 从请求 URL 参数抓取 token（作为 USER_TOKEN）、auth
 *   3) 从请求头抓取 jwt-token（Base64 解码出 DEVICE_ID）
 *   4) 从响应 Set-Cookie 抓取 acf_auth、acf_uid（过滤 acf_uid=0）
 *   5) 仅在值变化时写入 persistentStore 并通知
 */

(() => {
  "use strict";

  // ========== 工具函数 ==========
  const getHeader = (headers, name) => {
    if (!headers) return "";
    const target = String(name).toLowerCase();
    for (const k in headers) {
      if (String(k).toLowerCase() === target) return headers[k];
    }
    return "";
  };

  const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const getCookieValue = (cookieStr, key) => {
    if (!cookieStr) return "";
    const re = new RegExp(`(?:^|;\\s*)${escapeRegExp(key)}=([^;]*)`);
    const m = cookieStr.match(re);
    return m ? m[1] : "";
  };

  // 从 URL 中获取 query 参数
  const getQueryParam = (url, key) => {
    if (!url) return "";
    const re = new RegExp(`[?&]${escapeRegExp(key)}=([^&]*)`);
    const m = url.match(re);
    return m ? m[1] : "";
  };

  // 纯 JS Base64 解码（Loon 的 JS 环境没有 Buffer 对象）
  const base64Decode = (input) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const clean = String(input).replace(/[^A-Za-z0-9+/]/g, "");
    let bits = 0, value = 0, output = "";
    for (let i = 0; i < clean.length; i++) {
      const idx = chars.indexOf(clean[i]);
      if (idx < 0) continue;
      value = (value << 6) | idx;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((value >>> bits) & 0xFF);
        value &= (1 << bits) - 1;
      }
    }
    return output;
  };

  // 解码 jwt-token 提取 device_id（格式: 设备ID|App版本）
  const decodeJwtToken = (jwtToken) => {
    if (!jwtToken) return "";
    const id = (base64Decode(jwtToken).split("|")[0] || "").trim();
    if (!id) console.log("⚠️ jwt-token 解码结果为空: " + jwtToken);
    return id;
  };

  // 更稳健地切分 Set-Cookie（避免 Expires 里的逗号被误切）
  const splitSetCookie = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;

    const s = String(input);
    const out = [];
    let buf = "";
    let inExpires = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (!inExpires && s.slice(i, i + 8).toLowerCase() === "expires=") {
        inExpires = true;
        buf += ch;
        continue;
      }

      if (inExpires && ch === ";") {
        inExpires = false;
        buf += ch;
        continue;
      }

      if (!inExpires && ch === ",") {
        const rest = s.slice(i + 1);
        if (/^\s*[^=;, \t]+=/.test(rest)) {
          if (buf.trim()) out.push(buf.trim());
          buf = "";
          continue;
        }
      }

      buf += ch;
    }

    if (buf.trim()) out.push(buf.trim());
    return out;
  };

  const mask = (v) => {
    if (!v) return "";
    if (v.length <= 8) return "***";
    return `${v.slice(0, 4)}***${v.slice(-4)}`;
  };

  const writeIfChanged = (storeKey, newVal, changedList) => {
    if (!newVal) return;
    const oldVal = $persistentStore.read(storeKey) || "";
    if (oldVal !== newVal) {
      $persistentStore.write(newVal, storeKey);
      changedList.push(storeKey);
    }
  };

  // ========== 1) 请求头抓取 ==========
  const reqHeaders = ($request && $request.headers) || {};
  const reqUrl = ($request && $request.url) || "";
  const reqCookie = getHeader(reqHeaders, "cookie") || "";

  const installId = getCookieValue(reqCookie, "install_id");
  const ttreq = getCookieValue(reqCookie, "ttreq");

  // ========== 2) 请求 URL 参数抓取 ==========
  const userToken = getQueryParam(reqUrl, "token");
  const authParam = getQueryParam(reqUrl, "auth");

  // ========== 3) 请求头 jwt-token 抓取（解码出 device_id） ==========
  const jwtToken = getHeader(reqHeaders, "jwt-token") || getHeader(reqHeaders, "user-device") || "";
  const deviceId = decodeJwtToken(jwtToken);

  // ========== 4) 响应头抓取 ==========
  const respHeaders = ($response && $response.headers) || {};
  const rawSetCookie = getHeader(respHeaders, "set-cookie");
  const setCookies = splitSetCookie(rawSetCookie);

  let acfAuth = "";
  let acfUid = "";

  for (const c of setCookies) {
    const a = getCookieValue(c, "acf_auth");
    if (a) acfAuth = a;

    const u = getCookieValue(c, "acf_uid");
    // 过滤 acf_uid=0（未登录状态）
    if (u && u !== "0") acfUid = u;
  }

  // ========== 5) 仅变更写入 ==========
  const changed = [];
  writeIfChanged("douyu_acf_auth", acfAuth, changed);
  writeIfChanged("douyu_acf_uid", acfUid, changed);
  writeIfChanged("douyu_install_id", installId, changed);
  writeIfChanged("douyu_ttreq", ttreq, changed);
  writeIfChanged("douyu_user_token", userToken, changed);
  writeIfChanged("douyu_auth", authParam, changed);
  writeIfChanged("douyu_device_id", deviceId, changed);
  writeIfChanged("douyu_jwt_token", jwtToken, changed);

  // ========== 6) 日志与通知 ==========
  if (changed.length) {
    console.log("✅ 斗鱼 Cookie 已更新: " + changed.join(", "));
    if (acfAuth) console.log("acf_auth=" + mask(acfAuth));
    if (acfUid) console.log("acf_uid=" + acfUid);
    if (installId) console.log("install_id=" + mask(installId));
    if (ttreq) console.log("ttreq=" + mask(ttreq));
    if (userToken) console.log("user_token=" + mask(userToken));
    if (deviceId) console.log("device_id=" + deviceId);

    const lines = [];
    if (acfAuth) lines.push(`acf_auth=${mask(acfAuth)}`);
    if (acfUid) lines.push(`acf_uid=${acfUid}`);
    if (userToken) lines.push(`user_token=${mask(userToken)}`);
    if (deviceId) lines.push(`device_id=${deviceId}`);

    $notification.post(
      "斗鱼 Cookie 已更新",
      changed.join(", "),
      lines.join("\n")
    );
  } else {
    console.log("ℹ️ 斗鱼 Cookie 无变化");
  }

  $done({});
})();
