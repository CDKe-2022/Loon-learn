/*
脚本名称：douyu_cookie_capture.js
脚本功能：
1. 从响应头抓取 acf_auth、acf_uid（修正 acf_uid=0 问题）
2. 从请求头抓取 install_id、ttreq
脚本类型：http-response
*/

(function () {
  try {
    /* ========= 1️⃣ 请求头 ========= */
    const reqHeaders = $request && $request.headers || {};
    const reqCookie = reqHeaders["Cookie"] || reqHeaders["cookie"] || "";

    let installId = "";
    let ttreq = "";

    if (reqCookie) {
      const m1 = reqCookie.match(/install_id=([^;]+)/);
      const m2 = reqCookie.match(/ttreq=([^;]+)/);
      if (m1) installId = m1[1];
      if (m2) ttreq = m2[1];
    }

    /* ========= 2️⃣ 响应头 ========= */
    const respHeaders = $response && $response.headers;
    if (!respHeaders) return $done();

    let setCookie = respHeaders["Set-Cookie"] || respHeaders["set-cookie"];
    if (!setCookie) return $done();

    if (typeof setCookie === "string") {
      setCookie = setCookie.split(/,(?=[^;]+?=)/);
    }

    let acfAuth = "";
    let acfUid = "";

    // ⚠️ 注意：这里不再用 if (!acfUid)
    for (const c of setCookie) {
      const authMatch = c.match(/acf_auth=([^;]+)/);
      if (authMatch) {
        acfAuth = authMatch[1];
      }

      const uidMatch = c.match(/acf_uid=([^;]+)/);
      if (uidMatch) {
        const uidVal = uidMatch[1];
        // 过滤 acf_uid=0
        if (uidVal !== "0") {
          acfUid = uidVal;
        }
      }
    }

    /* ========= 3️⃣ 存储 ========= */
    if (acfAuth) $persistentStore.write(acfAuth, "douyu_acf_auth");
    if (acfUid)  $persistentStore.write(acfUid,  "douyu_acf_uid");
    if (installId) $persistentStore.write(installId, "douyu_install_id");
    if (ttreq)     $persistentStore.write(ttreq,     "douyu_ttreq");

    /* ========= 4️⃣ 日志 ========= */
    console.log("✅ 斗鱼 Cookie 抓取成功：");
    if (acfAuth) console.log("acf_auth=" + acfAuth);
    if (acfUid)  console.log("acf_uid=" + acfUid);
    if (installId) console.log("install_id=" + installId);
    if (ttreq)     console.log("ttreq=" + ttreq);

    /* ========= 5️⃣ 通知 ========= */
    $notification.post(
      "斗鱼 Cookie 抓取成功",
      "已修正 acf_uid=0 问题",
      (acfAuth ? `acf_auth=${acfAuth}\n` : "") +
      (acfUid  ? `acf_uid=${acfUid}\n`  : "") +
      (installId ? `install_id=${installId}\n` : "") +
      (ttreq ? `ttreq=${ttreq}` : "")
    );

  } catch (e) {
    console.log("❌ 脚本异常：" + e);
  } finally {
    $done();
  }
})();