const NAME = "起点读书";

// 读取任务ID
const taskId = $persistentStore.read("qd_taskId");
const taskId2 = $persistentStore.read("qd_taskId_2");

(async () => {
  // 从请求中提取 session 信息
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers,
  };

  log("捕获到请求:");
  log(JSON.stringify(session));

  // 判断是广告1还是广告2
  if (taskId && session.body.includes(taskId)) {
    saveSession("qd_session", "广告1", session);
  } else if (taskId2 && session.body.includes(taskId2)) {
    saveSession("qd_session_2", "广告2", session);
  } else {
    $notification.post(NAME, "🔴广告信息获取失败!", "");
  }

  $done();
})();

// 保存 session
function saveSession(key, tag, session) {
  if ($persistentStore.write(JSON.stringify(session), key)) {
    $notification.post(NAME, `🎉${tag}信息获取成功!`, "");
    log(`${tag}保存成功`);
  } else {
    $notification.post(NAME, `🔴${tag}信息保存失败!`, "");
    log(`${tag}保存失败`);
  }
}

// 工具函数
function log(msg) {
  console.log(`[${NAME}] ${msg}`);
}