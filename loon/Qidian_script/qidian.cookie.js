/* 脚本功能: 获取 起点读书 广告信息 (完美适配单Session策略)
   [Script]
   http-request ^https?:\/\/(h5|magev6)\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch script-path=qidian.cookie.js, requires-body=true
   [MITM]
   hostname = %APPEND% h5.if.qidian.com, magev6.if.qidian.com */

const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  SESSION_KEY_1: "qd_session",
  TASK_ID_KEY_2: "qd_taskId_2",
  SESSION_KEY_2: "qd_session_2",
  
  READING_TASK_IDS_KEY: "qd_reading_task_subids",
  READING_SESSION_QUEUE_KEY: "qd_reading_session_queue", // 核心改变：单键队列

  NOTIFICATION_TITLE: "起点读书",
};

function saveSession(session, key, msg) {
  try {
    const result = $persistentStore.write(JSON.stringify(session), key);
    if (result) {
      console.log(msg);
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", msg);
      return true;
    } else {
      throw new Error("Write failed");
    }
  } catch (e) {
    console.log("🔴信息写入失败:", e.message);
    return false;
  }
}

// 将新 Session 追加到队列中
function appendToQueue(session, taskId) {
  try {
    let queueStr = $persistentStore.read(CONFIG.READING_SESSION_QUEUE_KEY) || "[]";
    let queue = JSON.parse(queueStr);
    if (!Array.isArray(queue)) queue = [];
    
    // 防重复：如果该 TaskId 的 session 已经在队列里了，就不重复加
    const exists = queue.some(item => item.taskId === taskId);
    if (!exists) {
        queue.push({ taskId: taskId, session: session });
        $persistentStore.write(JSON.stringify(queue), CONFIG.READING_SESSION_QUEUE_KEY);
        console.log(`✅阅读Session已加入队列，当前排队: ${queue.length} 个`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", `🎉阅读广告(Session)获取成功! 当前队列: ${queue.length}个`);
    } else {
        console.log("⚪该TaskId的Session已在队列中，未重复添加");
    }
    return true;
  } catch (e) {
    console.log("🔴更新Session队列失败:", e.message);
    return false;
  }
}

!(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers,
  };

  // 1. 任务一
  const taskId1 = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
  if (taskId1 && session.body && session.body.includes(taskId1)) {
    if (saveSession(session, CONFIG.SESSION_KEY_1, "🎉任务一(Session)获取成功!")) return; 
  }

  // 2. 任务二
  const taskId2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
  if (taskId2 && session.body && session.body.includes(taskId2)) {
    if (saveSession(session, CONFIG.SESSION_KEY_2, "🎉任务二(Session)获取成功!")) return;
  }

  // 3. 任务三 (匹配动态ID，存入队列)
  const readingTaskIdsStr = $persistentStore.read(CONFIG.READING_TASK_IDS_KEY);
  if (readingTaskIdsStr) {
    const readingTaskIds = readingTaskIdsStr.split(',');
    for (const taskId of readingTaskIds) {
      if (taskId && session.body && session.body.includes(taskId)) {
        if (appendToQueue(session, taskId)) return;
      }
    }
  }

  console.log("⚪未匹配到已知任务ID，已忽略本次请求");
})().finally(() => {
  $done({});
});
