/*************************************
 * 小黑盒（HeyBox）每日签到
 * 平台：Loon
 * 类型：generic / cron
 *************************************/

const SCRIPT_NAME = "小黑盒签到";
const STORE_KEY = "HEYBOX_COOKIE";
const SIGN_URL = "https://api.xiaoheihe.cn/task/sign_v3/get_sign_state";

// 读取 Cookie
var cookie = $persistentStore.read(STORE_KEY);

// === 基础校验 ===
if (!isValidCookie(cookie)) {
  notify(
    SCRIPT_NAME,
    "签到失败 ❌",
    "Cookie 无效或未获取，请重新抓包"
  );
  $done();
}

// === 发起签到请求 ===
$httpClient.get(
  {
    url: SIGN_URL,
    headers: {
      "Cookie": cookie,
      "User-Agent": "xiaoheihe/1.3.376 (iOS)",
      "Referer": "http://api.maxjia.com/",
      "Accept": "*/*"
    },
    timeout: 5000
  },
  function (error, response, data) {
    if (error) {
      notify(SCRIPT_NAME, "网络错误 ❌", error);
      return $done();
    }

    if (!response || response.status !== 200) {
      notify(
        SCRIPT_NAME,
        "HTTP 异常 ❌",
        "Status: " + (response ? response.status : "unknown")
      );
      return $done();
    }

    var obj;
    try {
      obj = JSON.parse(data);
    } catch (e) {
      notify(SCRIPT_NAME, "解析失败 ❌", "非 JSON 响应");
      return $done();
    }

    handleResult(obj);
    $done();
  }
);

// ================= 工具函数 =================

function isValidCookie(cookieStr) {
  if (!cookieStr) return false;
  return (
    cookieStr.indexOf("x_xhh_tokenid=") !== -1 &&
    cookieStr.indexOf("pkey=") !== -1 &&
    cookieStr.indexOf("hkey=") !== -1
  );
}

function handleResult(obj) {
  if (obj.status === "ok" && obj.result) {
    var r = obj.result;

    var title = SCRIPT_NAME + "成功 🎉";
    var subtitle = "连续签到 " + r.sign_in_streak + " 天";
    var content =
      "获得：" +
      r.sign_in_coin +
      " H币 + " +
      r.sign_in_exp +
      " 经验";

    $notification.post(title, subtitle, content);
  } else {
    $notification.post(
      SCRIPT_NAME,
      "签到异常 ⚠️",
      obj.msg || "未知状态"
    );
  }
}

function notify(title, subtitle, message) {
  $notification.post(title, subtitle, message);
}