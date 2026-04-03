/*
脚本名称：douyu_cookie_capture.js
脚本作用：
1. 从请求 Cookie 抓取：install_id、ttreq
2. 从响应 Set-Cookie 抓取：acf_auth、acf_uid（过滤 acf_uid=0）
3. 仅在值变化时写入持久化并发送通知
脚本类型：http-response
*/

// 可选：只处理斗鱼域名（如果规则本身已经限定，可删除此段）
const url = $request && $request.url;
if (!url || !/\/\/(.+\.)?douyu\.com\//i.test(url)) {
  $done({});
} else {
  (function () {
    try {
      // ===== 工具函数 =====

      // 从 headers 中按名字取值（不区分大小写）
      const getHeader = (headers, name) => {
        if (!headers) return "";
        const target = String(name).toLowerCase();
        for (const k in headers) {
          if (String(k).toLowerCase() === target) return headers[k];
        }
        return "";
      };

      // 转义字符串，用于构造安全正则
      const escapeRegExp = (s) =>
        String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // 从 Cookie / Set-Cookie 字符串中提取某个 key 的值
      const getCookieValue = (cookieStr, key) => {
        if (!cookieStr) return "";
        const re = new RegExp(
          "(?:^|;\\s*)" + escapeRegExp(key) + "=([^;]*)"
        );
        const m = cookieStr.match(re);
        return m ? m[1] : "";
      };

      // 安全解码（如果不是编码过的字符串，原样返回）
      const safeDecode = (v) => {
        if (!v) return v;
        try {
          return decodeURIComponent(v);
        } catch {
          return v;
        }
      };

      // 将可能包含多个 cookie 的 Set-Cookie 字符串拆成数组
      // 重点：避免把 Expires=xxx, yyy 里的逗号误当作分隔符
      const splitSetCookie = (input) => {
        if (!input) return [];
        if (Array.isArray(input)) return input;

        const s = String(input);
        const out = [];
        let buf = "";
        let inExpires = false;

        for (let i = 0; i < s.length; i++) {
          const ch = s[i];

          // 检测 "expires="
          if (!inExpires && (ch === "E" || ch === "e")) {
            const sub = s.slice(i, i + 8).toLowerCase();
            if (sub === "expires=") {
              inExpires = true;
            }
          }

          // Expires 字段在遇到分号时结束
          if (inExpires && ch === ";") {
            inExpires = false;
          }

          // 非 Expires 区间内，逗号可能是多个 cookie 的分隔符
          if (!inExpires && ch === ",") {
            const rest = s.slice(i + 1);
            // 判断逗号后是否是 " key=..."
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

      // 打码，用于日志/通知中显示部分内容
      const mask = (v) => {
        if (!v) return "";
        const s = String(v);
        if (s.length <= 4) return "​***​";
        if (s.length <= 8) return s[0] + "​***​" + s.slice(-1);
        return s.slice(0, 4) + "​***​" + s.slice(-4);
      };

      // 只有在新值非空且与旧值不同的时候才写入，并记录变更字段名
      // 注意：如果 newVal 为空，不会覆盖旧值（防止一次无 Cookie 的请求清空存储）
      const writeIfChanged = (storeKey, newVal, changedList) => {
        if (!newVal) return;
        const oldVal = $persistentStore.read(storeKey) || "";
        if (oldVal !== newVal) {
          $persistentStore.write(newVal, storeKey);
          changedList.push(storeKey);
        }
      };

      // ===== 1) 从请求头抓取 install_id、ttreq =====
      const reqHeaders = ($request && $request.headers) || {};
      const reqCookie = getHeader(reqHeaders, "cookie") || "";

      const installId = safeDecode(
        getCookieValue(reqCookie, "install_id")
      );
      const ttreq = safeDecode(getCookieValue(reqCookie, "ttreq"));

      // ===== 2) 从响应 Set-Cookie 抓取 acf_auth、acf_uid =====
      const respHeaders = ($response && $response.headers) || {};
      const rawSetCookie = getHeader(respHeaders, "set-cookie");
      const setCookies = splitSetCookie(rawSetCookie);

      let acfAuth = "";
      let acfUid = "";

      for (const c of setCookies) {
        const a = safeDecode(getCookieValue(c, "acf_auth"));
        if (a) acfAuth = a;

        const u = safeDecode(getCookieValue(c, "acf_uid"));
        // 过滤 acf_uid=0
        if (u && u !== "0") acfUid = u;
      }

      // ===== 3) 仅在值变化时写入持久化 =====
      const changed = [];
      writeIfChanged("douyu_acf_auth", acfAuth, changed);
      writeIfChanged("douyu_acf_uid", acfUid, changed);
      writeIfChanged("douyu_install_id", installId, changed);
      writeIfChanged("douyu_ttreq", ttreq, changed);

      // ===== 4) 日志输出 =====
      if (changed.length) {
        console.log("✅ 斗鱼 Cookie 已更新: " + changed.join(", "));
        if (acfAuth) console.log("acf_auth=" + mask(acfAuth));
        if (acfUid) console.log("acf_uid=" + acfUid);
        if (installId) console.log("install_id=" + mask(installId));
        if (ttreq) console.log("ttreq=" + mask(ttreq));
      } else {
        console.log("ℹ️ 斗鱼 Cookie 无变化");
      }

      // ===== 5) 有更新时发送通知 =====
      if (changed.length) {
        const lines = [];
        if (acfAuth) lines.push("acf_auth=" + mask(acfAuth));
        if (acfUid) lines.push("acf_uid=" + acfUid);
        if (installId) lines.push("install_id=" + mask(installId));
        if (ttreq) lines.push("ttreq=" + mask(ttreq));

        $notification.post(
          "斗鱼 Cookie 已更新",
          changed.join(", "),
          lines.join("\n")
        );
      }
    } catch (e) {
      console.log(
        "❌ 脚本异常: " + (e && e.stack ? e.stack : String(e))
      );
    } finally {
      $done({});
    }
  })();
}