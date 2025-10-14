/* 
脚本功能: 获取 起点读书 广告信息
操作步骤: 我 --> 福利中心 --> 手动观看一个广告

[Script]
http-request ^https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch script-path=qidian.cookie.js, requires-body=true

[MITM]
hostname = h5.if.qidian.com
*/

// --- 配置常量 ---
const CONFIG = {
  // 存储键名
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS_1: "🎉广告1信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_2: "🎉广告2信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴广告信息获取失败!",
  NOTIFICATION_SUBTITLE_WRITE_FAIL: "🔴信息写入失败!",
};

// --- 读取预设的任务ID ---
const taskId = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
const taskId_2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);

/**
 * 处理任务匹配和会话信息写入
 * @param {Object} session - 包含请求信息的对象
 * @param {string} taskIdToCheck - 要检查的taskId
 * @param {string} sessionKey - 用于存储session的键名
 * @param {string} successMsg - 成功时的通知消息
 * @returns {boolean} - 操作是否成功
 */
function processTask(session, taskIdToCheck, sessionKey, successMsg) {
  // 检查taskId是否存在
  if (session.body && session.body.includes(taskIdToCheck)) {
    try {
      // 尝试写入持久化存储
      const writeResult = $persistentStore.write(JSON.stringify(session), sessionKey);
      if (writeResult) {
        console.log(successMsg);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", successMsg);
        return true; // 成功
      } else {
        // $persistentStore.write 返回false，写入失败
        console.log(CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        return false; // 失败
      }
    } catch (error) {
      // 捕获写入过程中可能的异常
      console.error(`写入持久化存储时发生错误: ${error.message}`);
      console.log(CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
      return false; // 失败
    }
  }
  return false; // 未匹配到taskId
}

// --- 主执行逻辑 ---
!(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers,
  };
  console.log('捕获的请求信息:', JSON.stringify(session)); // 使用更清晰的日志

  // 尝试处理 taskId_1
  if (processTask(session, taskId, CONFIG.SESSION_KEY_1, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_1)) {
    return; // 如果成功处理了taskId_1，直接返回
  }

  // 尝试处理 taskId_2
  if (processTask(session, taskId_2, CONFIG.SESSION_KEY_2, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_2)) {
    return; // 如果成功处理了taskId_2，直接返回
  }

  // 如果两个taskId都没匹配上
  console.log(CONFIG.NOTIFICATION_SUBTITLE_FAIL);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_FAIL);

})().finally(() => {
  // 确保脚本在所有情况下都能正确结束
  $done({});
});