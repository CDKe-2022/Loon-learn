/*
脚本名称：douyu_cookie_capture.js
脚本功能：
1. 从响应头抓取 acf_auth、acf_uid
2. 从请求头抓取 install_id、ttreq
3. 统一写入本地存储
脚本类型：http-response
*/

(function () {
  try {
    /* ========= 1️⃣ 读取请求头 ========= */
    const reqHeaders = $request && $request.headers;
    if (!reqHeaders) {
      console.log("❌ 未获取到 request.headers");
      return $done();
    }

    let reqCookie = reqHeaders["Cookie"] || reqHeaders["cookie"] || "";

    let installId = "";
    let ttreq = "";

    if (reqCookie) {
      const installMatch = reqCookie.match(/install_id=([^;]+)/);
      const ttreqMatch = reqCookie.match(/ttreq=([^;]+)/);

      if (installMatch) installId = installMatch[1];
      if (ttreqMatch) ttreq = ttreqMatch[1];
    }

    /* ========= 2️⃣ 读取响应头 ========= */
    const respHeaders = $response && $response.headers;
    if (!respHeaders) {
      console.log("❌ 未获取到 response.headers");
      return $done();
    }

    let setCookie = respHeaders["Set-Cookie"] || respHeaders["set-cookie"];
    if (!setCookie) {
      console.log("❌ 响应头中不存在 Set-Cookie");
      return $done();
    }

    if (typeof setCookie === "string") {
      setCookie = setCookie.split(/,(?=[^;]+?=)/);
    } else if (!Array.isArray(setCookie)) {
      console.log("❌ Set-Cookie 类型异常");
      return $done();
    }

    let acfAuth = "";
    let acfUid = "";

    for (const c of setCookie) {
      if (!acfAuth) {
        const m = c.match(/acf_auth=([^;]+)/);
        if (m) acfAuth = m[1];
      }
      if (!acfUid) {
        const m = c.match(/acf_uid=([^;]+)/);
        if (m) acfUid = m[1];
      }
    }

    /* ========= 3️⃣ 校验并存储 ========= */
    if (acfAuth) {
      $persistentStore.write(acfAuth, "douyu_acf_auth");
    }
    if (acfUid) {
      $persistentStore.write(acfUid, "douyu_acf_uid");
    }
    if (installId) {
      $persistentStore.write(installId, "douyu_install_id");
    }
    if (ttreq) {
      $persistentStore.write(ttreq, "douyu_ttreq");
    }

    /* ========= 4️⃣ 日志输出 ========= */
    console.log("✅ 斗鱼 Cookie 抓取成功：");
    if (acfAuth) console.log("acf_auth=" + acfAuth);
    if (acfUid) console.log("acf_uid=" + acfUid);
    if (installId) console.log("install_id=" + installId);
    if (ttreq) console.log("ttreq=" + ttreq);

    /* ========= 5️⃣ 通知 ========= */
    const notifyMsg =
      (acfAuth ? `acf_auth=${acfAuth}\n` : "") +
      (acfUid ? `acf_uid=${acfUid}\n` : "") +
      (installId ? `install_id=${installId}\n` : "") +
      (ttreq ? `ttreq=${ttreq}` : "");

    $notification.post(
      "斗鱼 Cookie 抓取成功",
      "已更新本地存储",
      notifyMsg
    );

  } catch (e) {
    console.log("❌ 脚本异常：" + e);
  } finally {
    $done();
  }
})();