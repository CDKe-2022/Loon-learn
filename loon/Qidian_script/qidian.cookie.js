/* 脚本功能: 获取 起点读书 广告信息 (完美适配单Session策略)
   操作步骤: 
   1. 进入福利中心 (自动捕获任务1、2的Session)
   2. 阅读页看1分钟书后点击"加点"广告 (自动捕获任务3对应组的Session)
   
   [Script]
   http-request ^https?:\/\/(h5|magev6)\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch script-path=qidian.cookie.js, requires-body=true
   [MITM]
   hostname = %APPEND% h5.if.qidian.com, magev6.if.qidian.com */

const CONFIG = {
  // 任务一 & 任务二
  TASK_ID_KEY_1: "qd_taskId",
  SESSION_KEY_1: "qd_session",
  
  TASK_ID_KEY_2: "qd_taskId_2",
  SESSION_KEY_2: "qd_session_2",
  
  // 任务三 (阅读·加点，动态适配多组任务)
  // 读取上一个脚本写入的逗号分隔ID串
  READING_TASK_IDS_KEY: "qd_reading_task_subids",
  // 动态拼接Session存储键：qd_reading_session_1, qd_reading_session_2...
  READING_SESSION_PREFIX: "qd_reading_session_",

  NOTIFICATION_TITLE: "起点读书",
};

/**
 * 通用保存函数 (全量保存，防止丢失 Argus 签名头导致重放失败)
 */
function saveSession(session, key, msg) {
  try {
    // 直接全量序列化存储，不精简 Header
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
    $notification.post(CONFIG.NOTIFICATION_TITLE, "", "🔴信息写入失败!");
    return false;
  }
}

!(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers,
  };
  console.log('捕获的请求URL:', session.url);

  // 1. 检查是否为 任务一 (福利)
  const taskId1 = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
  if (taskId1 && session.body && session.body.includes(taskId1)) {
    if (saveSession(session, CONFIG.SESSION_KEY_1, "🎉任务一(Session)获取成功!")) {
      return; 
    }
  }

  // 2. 检查是否为 任务二 (视频)
  const taskId2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
  if (taskId2 && session.body && session.body.includes(taskId2)) {
    if (saveSession(session, CONFIG.SESSION_KEY_2, "🎉任务二(Session)获取成功!")) {
      return;
    }
  }

  // 3. 检查是否为 任务三 (阅读·加点) -> 动态拆分ID，按序号存储Session
  const readingTaskIdsStr = $persistentStore.read(CONFIG.READING_TASK_IDS_KEY);
  if (readingTaskIdsStr) {
    // 将 "id1,id2,id3..." 拆分成数组
    const readingTaskIds = readingTaskIdsStr.split(',');
    
    for (let i = 0; i < readingTaskIds.length; i++) {
      const taskId = readingTaskIds[i];
      if (taskId && session.body && session.body.includes(taskId)) {
        // 动态生成对应的 Session Key，如 qd_reading_session_1
        const sessionKey = `${CONFIG.READING_SESSION_PREFIX}${i + 1}`;
        if (saveSession(session, sessionKey, `🎉阅读广告-组${i + 1}(Session)获取成功!`)) {
          return;
        }
      }
    }
  }

  // 4. 都不匹配 (可能是其他无关的广告请求)
  console.log("⚪未匹配到已知任务ID，已忽略本次请求");

})().finally(() => {
  $done({});
});
