/*
脚本名称：douyu_cookie_capture_optimized.js
脚本功能：
1) 从请求 Cookie 抓取 install_id、ttreq
2) 从响应 Set-Cookie 抓取 acf_auth、acf_uid（过滤 acf_uid=0）
3) 仅在值变化时写入并通知
脚本类型：http-response
*/

(function () {
  try {
    // ===== 工具函数 =====
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

        // 检测 Expires=
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

        // 仅在非 Expires 区间内，逗号作为 cookie 分隔符
        if (!inExpires && ch === ",") {
          // 逗号后面像“ key=...”才切分
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

    // ===== 1) 请求头抓取 =====
    const reqHeaders = ($request && $request.headers) || {};
    const reqCookie = getHeader(reqHeaders, "cookie") || "";

    const installId = getCookieValue(reqCookie, "install_id");
    const ttreq = getCookieValue(reqCookie, "ttreq");

    // ===== 2) 响应头抓取 =====
    const respHeaders = ($response && $response.headers) || {};
    const rawSetCookie = getHeader(respHeaders, "set-cookie");
    const setCookies = splitSetCookie(rawSetCookie);

    let acfAuth = "";
    let acfUid = "";

    for (const c of setCookies) {
      const a = getCookieValue(c, "acf_auth");
      if (a) acfAuth = a;

      const u = getCookieValue(c, "acf_uid");
      // 过滤 acf_uid=0
      if (u && u !== "0") acfUid = u;
    }

    // ===== 3) 仅变更写入 =====
    const changed = [];
    writeIfChanged("douyu_acf_auth", acfAuth, changed);
    writeIfChanged("douyu_acf_uid", acfUid, changed);
    writeIfChanged("douyu_install_id", installId, changed);
    writeIfChanged("douyu_ttreq", ttreq, changed);

    // ===== 4) 日志 =====
    if (changed.length) {
      console.log("✅ 斗鱼 Cookie 已更新: " + changed.join(", "));
      if (acfAuth) console.log("acf_auth=" + mask(acfAuth));
      if (acfUid) console.log("acf_uid=" + acfUid);
      if (installId) console.log("install_id=" + mask(installId));
      if (ttreq) console.log("ttreq=" + mask(ttreq));
    } else {
      console.log("ℹ️ 斗鱼 Cookie 无变化");
    }

    // ===== 5) 通知（有更新才通知）=====
    if (changed.length) {
      const lines = [];
      if (acfAuth) lines.push(`acf_auth=${mask(acfAuth)}`);
      if (acfUid) lines.push(`acf_uid=${acfUid}`);
      if (installId) lines.push(`install_id=${mask(installId)}`);
      if (ttreq) lines.push(`ttreq=${mask(ttreq)}`);

      $notification.post(
        "斗鱼 Cookie 已更新",
        changed.join(", "),
        lines.join("\n")
      );
    }
  } catch (e) {
    console.log("❌ 脚本异常: " + (e && e.stack ? e.stack : e));
  } finally {
    $done({});
  }
})();