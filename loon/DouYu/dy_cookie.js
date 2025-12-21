/*
脚本名称：douyu_acf_auth.js
脚本功能：抓取斗鱼 acf_auth Cookie（完整显示在日志和通知中）
脚本类型：http-response
*/

(function () {
  try {
    const headers = $response && $response.headers;
    if (!headers) {
      console.log("❌ 未获取到 response.headers");
      return $done();
    }

    let setCookie = headers["Set-Cookie"] || headers["set-cookie"];
    if (!setCookie) {
      console.log("❌ 响应头中不存在 Set-Cookie");
      return $done();
    }

    // 统一处理 Set-Cookie 类型
    if (typeof setCookie === "string") {
      setCookie = setCookie.split(/,(?=[^;]+?=)/);
    } else if (!Array.isArray(setCookie)) {
      console.log("❌ Set-Cookie 类型异常");
      return $done();
    }

    let acfAuth = null;

    for (let i = 0; i < setCookie.length; i++) {
      const match = setCookie[i].match(/acf_auth=([^;]+)/);
      if (match) {
        acfAuth = match[1];
        break;
      }
    }

    if (!acfAuth) {
      console.log("❌ 未在 Set-Cookie 中找到 acf_auth");
      return $done();
    }

    const fullCookie = "acf_auth=" + acfAuth;

    // 写入本地存储
    const success = $persistentStore.write(acfAuth, "douyu_acf_auth");

    // ===== 日志完整输出 =====
    console.log("✅ 成功获取 acf_auth：");
    console.log(fullCookie);

    // ===== 通知完整输出 =====
    $notification.post(
      "斗鱼 Cookie 获取成功",
      "acf_auth 已抓取",
      fullCookie
    );

    if (!success) {
      console.log("⚠️ acf_auth 写入本地存储失败");
    }

  } catch (e) {
    console.log("❌ 脚本执行异常：" + e);
  } finally {
    $done();
  }
})();