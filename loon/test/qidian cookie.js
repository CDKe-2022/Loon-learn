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
  
  // 任务三 (阅读·加点，按需捕获，用完即焚)
  // 必须对应 taskId 脚本里的三个 Key，否则无法匹配
  READING_TASK_KEYS: [
    "qd_reading_task_subid_1",
    "qd_reading_task_subid_2",
    "qd_reading_task_subid_3"
  ],
  READING_SESSION_KEYS: [
    "qd_reading_session_1", 
    "qd_reading_session_2", 
    "qd_reading_session_3"
  ],

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
    // 修复：只有成功保存才退出，失败则继续尝试匹配其他任务
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

  // 3. 检查是否为 任务三 (阅读·加点) -> 三路匹配，哪个组匹配上了就存哪个组的 Session
  for (let i = 0; i < CONFIG.READING_TASK_KEYS.length; i++) {
    const readingTaskId = $persistentStore.read(CONFIG.READING_TASK_KEYS[i]);
    if (readingTaskId && session.body && session.body.includes(readingTaskId)) {
      if (saveSession(session, CONFIG.READING_SESSION_KEYS[i], `🎉阅读广告-组${i + 1}(Session)获取成功!`)) {
        return;
      }
    }
  }

  // 4. 都不匹配 (可能是其他无关的广告请求)
  console.log("⚪未匹配到已知任务ID，已忽略本次请求");

})().finally(() => {
  $done({});
});
