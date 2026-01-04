/*************************************
 * 小黑盒（HeyBox）每日签到（日志增强版）
 * 平台：Loon
 * 类型：generic / cron
 *************************************/

const SCRIPT_NAME = "小黑盒签到";
const STORE_KEY = "HEYBOX_COOKIE";
const SIGN_URL = "https://api.xiaoheihe.cn/task/sign_v3/get_sign_state";

log("脚本启动");

// 读取 Cookie
var cookie = $persistentStore.read(STORE_KEY);
log("读取 Cookie：" + (cookie ? "存在" : "不存在"));

// === 基础校验 ===
if (!isValidCookie(cookie)) {
  log("Cookie 校验失败");
  notify(
    SCRIPT_NAME,
    "签到失败 ❌",
    "Cookie 无效或未获取，请重新抓包"
  );
  log("脚本结束（Cookie 无效）");
  $done();
}

// === 发起签到请求 ===
log("发起签到请求");

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
      log("网络错误：" + error);
      notify(SCRIPT_NAME, "网络错误 ❌", error);
      log("脚本结束（网络错误）");
      return $done();
    }

    if (!response) {
      log("无 response 对象");
      notify(SCRIPT_NAME, "HTTP 异常 ❌", "无响应对象");
      log("脚本结束（无 response）");
      return $done();
    }

    log("HTTP 状态码：" + response.status);

    if (response.status !== 200) {
      notify(
        SCRIPT_NAME,
        "HTTP 异常 ❌",
        "Status: " + response.status
      );
      log("脚本结束（HTTP 非 200）");
      return $done();
    }

    log("原始响应体：" + data);

    var obj;
    try {
      obj = JSON.parse(data);
      log("JSON 解析成功");
    } catch (e) {
      log("JSON 解析失败：" + e);
      notify(SCRIPT_NAME, "解析失败 ❌", "非 JSON 响应");
      log("脚本结束（JSON 解析失败）");
      return $done();
    }

    handleResult(obj);
    log("脚本结束（正常完成）");
    $done();
  }
);

// ================= 工具函数 =================

function isValidCookie(cookieStr) {
  if (!cookieStr) return false;
  var valid =
    cookieStr.indexOf("x_xhh_tokenid=") !== -1 &&
    cookieStr.indexOf("pkey=") !== -1 &&
    cookieStr.indexOf("hkey=") !== -1;

  log("Cookie 结构校验：" + (valid ? "通过" : "失败"));
  return valid;
}

function handleResult(obj) {
  log("业务状态 status：" + obj.status);
  log("业务 msg：" + (obj.msg || "(空)"));

  if (obj.result) {
    log("result 内容：" + JSON.stringify(obj.result));
  }

  if (obj.status === "ok" && obj.result) {
    var r = obj.result;

    if (!obj.msg) {
      log("判断结果：已签到");
    } else {
      log("判断结果：首次签到成功");
    }

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
    log("判断结果：签到异常");
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

function log(msg) {
  console.log("[" + SCRIPT_NAME + "] " + msg);
}