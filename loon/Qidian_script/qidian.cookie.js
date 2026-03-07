/*
脚本功能: 获取 起点读书 广告信息 (仅支持 Loon)
操作步骤: 我 --> 福利中心 --> 手动观看一个广告

[rewrite local]
https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch url script-request-body your_script_url

[MITM]
hostname = h5.if.qidian.com
*/

const CONFIG = {
  NAME: "起点读书",
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
};

let doneCalled = false;
function safeDone(obj = {}) {
  if (!doneCalled) {
    doneCalled = true;
    $done(obj);
  }
}

function log(msg) {
  console.log(`[${CONFIG.NAME}] ${msg}`);
}

function notify(subtitle, message) {
  $notification.post(CONFIG.NAME, subtitle || "", message || "");
}

function readTrim(key) {
  const val = $persistentStore.read(key);
  return val ? String(val).trim() : "";
}

function sanitizeHeaders(headers) {
  const h = { ...(headers || {}) };
  // 回放请求时，这些头可能导致兼容问题，去掉更稳
  delete h["Content-Length"];
  delete h["content-length"];
  delete h["Host"];
  delete h["host"];
  delete h["Connection"];
  delete h["connection"];
  delete h["Proxy-Connection"];
  delete h["proxy-connection"];
  return h;
}

function buildSessionFromRequest(req) {
  return {
    url: req.url || "",
    body: req.body || "",
    headers: sanitizeHeaders(req.headers),
  };
}

(function main() {
  try {
    if (typeof $request === "undefined" || !$request) {
      log("当前非 request 上下文，跳过。");
      notify("⚠️执行环境不正确", "请确认使用 script-request-body 触发");
      return;
    }

    const taskId1 = readTrim(CONFIG.TASK_ID_KEY_1);
    const taskId2 = readTrim(CONFIG.TASK_ID_KEY_2);

    if (!taskId1 || !taskId2) {
      const missing = [];
      if (!taskId1) missing.push("qd_taskId");
      if (!taskId2) missing.push("qd_taskId_2");
      const msg = `缺少任务ID: ${missing.join(", ")}，请先获取 taskId 后再抓广告会话`;
      log(`🔴${msg}`);
      notify("⚠️信息不全", msg);
      return;
    }

    const session = buildSessionFromRequest($request);
    const body = session.body;

    if (!body) {
      log("🔴请求体为空，无法识别广告类型");
      notify("🔴抓取失败", "请求体为空");
      return;
    }

    let targetKey = "";
    let label = "";

    if (body.includes(taskId1)) {
      targetKey = CONFIG.SESSION_KEY_1;
      label = "广告1";
    } else if (body.includes(taskId2)) {
      targetKey = CONFIG.SESSION_KEY_2;
      label = "广告2";
    } else {
      log("🔴请求体中未匹配到 taskId1/taskId2");
      log(`url: ${session.url}`);
      notify("🔴抓取失败", "未匹配到任务ID，请先手动观看对应广告");
      return;
    }

    const ok = $persistentStore.write(JSON.stringify(session), targetKey);
    if (ok) {
      log(`🎉${label}信息获取成功 -> ${targetKey}`);
      notify("✅抓取成功", `${label}信息获取成功`);
    } else {
      log(`🔴${label}信息写入失败 -> ${targetKey}`);
      notify("🔴抓取失败", `${label}信息写入失败`);
    }
  } catch (e) {
    log(`🔴脚本异常: ${e && e.message ? e.message : e}`);
    notify("脚本异常", "请查看日志");
  } finally {
    safeDone();
  }
})();