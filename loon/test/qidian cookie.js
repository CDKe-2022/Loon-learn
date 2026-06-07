/* 
脚本功能: 获取 起点读书 广告信息
操作步骤: 我 --> 福利中心 --> 手动观看一个广告

[Script]
http-request ^https?:\/\/(h5|magev6)\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch script-path=qidian.cookie.js, requires-body=true

[MITM]
hostname = %APPEND% h5.if.qidian.com, magev6.if.qidian.com
*/

// --- 配置常量 ---
const CONFIG = {
  // 存储键名
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  TASK_ID_KEY_3: "qd_reading_task_subids", // 对应阅读页“广告·加点！”子任务数组
  
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  SESSION_KEY_3: "qd_session_3",           // 存储阅读任务的 session
  
  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS_1: "🎉广告1信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_2: "🎉广告2信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_3: "🎉广告3(广告·加点！)信息获取成功!", 
  NOTIFICATION_SUBTITLE_FAIL: "🔴广告信息获取失败!",
  NOTIFICATION_SUBTITLE_WRITE_FAIL: "🔴信息写入失败!",
};

// --- 读取预设的任务ID ---
const taskId = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
const taskId_2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
const taskId_3_Str = $persistentStore.read(CONFIG.TASK_ID_KEY_3); // 读取数组字符串

/**
 * 安全地从请求体中提取 taskId
 * @param {string} body - 请求体字符串
 * @returns {string|null} - 提取到的 taskId
 */
function getTaskIdFromBody(body) {
  if (!body) return null;
  try {
    const params = new URLSearchParams(body);
    return params.get("taskId");
  } catch (e) {
    return null;
  }
}

/**
 * 构建并精简 Session 对象，剔除无用的大体积 Headers
 * @returns {Object} - 精简后的 session 对象
 */
function buildSession() {
  // 浅拷贝 headers，避免修改原请求对象
  const headers = { ...$request.headers };
  
  // 删除可能导致持久化存储溢出的无用大体积 Header (不区分大小写保护)
  delete headers["abtest-gzip"];
  delete headers["Abtest-Gzip"];
  
  return {
    url: $request.url,
    body: $request.body,
    headers
  };
}

/**
 * 处理单任务匹配和会话信息写入
 * @param {Object} session - 包含请求信息的对象
 * @param {string} taskIdToCheck - 要检查的taskId
 * @param {string} sessionKey - 用于存储session的键名
 * @param {string} successMsg - 成功时的通知消息
 * @returns {boolean} - 操作是否成功
 */
function processTask(session, taskIdToCheck, sessionKey, successMsg) {
  if (!taskIdToCheck) return false;
  
  const reqTaskId = getTaskIdFromBody(session.body);
  // 严格相等匹配，杜绝 includes 误判
  if (reqTaskId === String(taskIdToCheck)) {
    try {
      const writeResult = $persistentStore.write(JSON.stringify(session), sessionKey);
      if (writeResult) {
        console.log(successMsg);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", successMsg);
        return true;
      } else {
        console.log(CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        return false;
      }
    } catch (error) {
      console.error(`写入持久化存储时发生错误: ${error.message}`);
      return false;
    }
  }
  return false;
}

/**
 * 处理阅读页“广告·加点！”数组任务的匹配和会话写入
 * 匹配成功后，会将已完成的 SubTaskId 从数组中移除并更新存储
 * @param {Object} session - 包含请求信息的对象
 * @param {string} subIdsStr - 存储在持久化中的 SubTaskId 数组字符串
 * @param {string} idKey - 存储SubTaskId数组的键名
 * @param {string} sessionKey - 用于存储session的键名
 * @param {string} successMsg - 成功时的通知消息
 * @returns {boolean} - 操作是否成功
 */
function processReadingTaskArray(session, subIdsStr, idKey, sessionKey, successMsg) {
  if (!subIdsStr) return false;
  
  try {
    const subIds = JSON.parse(subIdsStr);
    if (!Array.isArray(subIds) || subIds.length === 0) return false;

    const reqTaskId = getTaskIdFromBody(session.body);
    if (!reqTaskId) return false;

    // 严格遍历匹配
    let matchedIndex = -1;
    for (let i = 0; i < subIds.length; i++) {
      if (reqTaskId === String(subIds[i])) {
        matchedIndex = i;
        break;
      }
    }

    if (matchedIndex !== -1) {
      const matchedSubId = subIds[matchedIndex];
      
      // 1. 写入 Session
      const sessionSaved = $persistentStore.write(JSON.stringify(session), sessionKey);
      
      // 2. 从数组中移除已匹配的 SubTaskId
      subIds.splice(matchedIndex, 1);
      
      // 3. 将剩余的数组重新写回持久化存储
      const listSaved = $persistentStore.write(JSON.stringify(subIds), idKey);
      
      // 4. 严格校验两次写入结果
      if (sessionSaved && listSaved) {
        const remainCount = subIds.length;
        const finalMsg = `${successMsg} (剩余${remainCount}个待完成)`;
        
        console.log(finalMsg);
        console.log(`已完成 SubTaskId: ${matchedSubId}`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", finalMsg);
        return true;
      } else {
        console.log(CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        return false;
      }
    }
  } catch (error) {
    console.error(`处理阅读任务数组时发生错误: ${error.message}`);
  }
  
  return false;
}

// --- 主执行逻辑 ---
!(async () => {
  // 构建并精简 Session (剔除大体积 Header)
  const session = buildSession();
  console.log('捕获的请求信息:', JSON.stringify(session));

  // 1. 尝试处理 taskId_1
  if (processTask(session, taskId, CONFIG.SESSION_KEY_1, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_1)) {
    return;
  }

  // 2. 尝试处理 taskId_3 (阅读页“广告·加点！”数组任务) - 优先于 taskId_2 匹配，防止 ID 冲突被截胡
  if (processReadingTaskArray(session, taskId_3_Str, CONFIG.TASK_ID_KEY_3, CONFIG.SESSION_KEY_3, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_3)) {
    return;
  }

  // 3. 尝试处理 taskId_2
  if (processTask(session, taskId_2, CONFIG.SESSION_KEY_2, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_2)) {
    return;
  }

  // 如果都没匹配上
  console.log(CONFIG.NOTIFICATION_SUBTITLE_FAIL);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_FAIL);

})().finally(() => {
  $done({});
});
