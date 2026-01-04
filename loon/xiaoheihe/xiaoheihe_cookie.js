/*************************************
 * 小黑盒（HeyBox）Cookie 获取脚本
 * 平台：Loon
 * 类型：http-request
 * 用途：抓取并保存登录 Cookie
 *************************************/

const STORE_KEY = "HEYBOX_COOKIE";

(function () {
  if (!$request || !$request.headers) {
    return $done({});
  }

  var cookie = $request.headers["Cookie"] || $request.headers["cookie"];

  if (!cookie) {
    return $done({});
  }

  // 只在包含关键字段时才写入，防止污染
  if (
    cookie.indexOf("x_xhh_tokenid=") !== -1 &&
    cookie.indexOf("pkey=") !== -1 &&
    cookie.indexOf("hkey=") !== -1
  ) {
    $persistentStore.write(cookie, STORE_KEY);
    $notification.post(
      "小黑盒 Cookie",
      "获取成功 ✅",
      "已保存，可关闭重写规则"
    );
  }

  $done({});
})();