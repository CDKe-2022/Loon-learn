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
  READING_TASK_DETAIL_KEY: "qd_reading_task_detail", // 修复1：适配新的完整任务对象数组
  
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  READING_SESSIONS_KEY: "qd_reading_sessions",       // 额外建议：改为存储字典，避免多任务Session覆盖
  
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
const readingDetailStr = $persistentStore.read(CONFIG.READING_TASK_DETAIL_KEY); // 修复1：读取新结构

/**
 * 修复6：安全地从请求体中提取 taskId，兼容 Form 和 JSON 格式
 */
function getTaskIdFromBody(body) {
  if (!body) return null;
  
  // 尝试 Form 格式解析
  try {
    const params = new URLSearchParams(body);
    const id = params.get("taskId");
    if (id) return id;
  } catch (e) {}

  // 尝试 JSON 格式解析
  try {
    const obj = JSON.parse(body);
    return String(obj.taskId || obj.TaskId) || null;
  } catch (e) {}

  return null;
}

/**
 * 修复2 & 4：构建精简 Session，采用白名单提取，彻底解决大小写问题和存储溢出风险
 */
function buildSession() {
  const headers = { ...$request.headers };
  
  // 辅助函数：大小写不敏感提取 Header
  const extractHeader = (name) => {
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : undefined;
  };

  // 只保留领奖脚本必须的 Header，摒弃所有冗余大体积字段
  const keptHeaders = {
    Cookie: extractHeader('cookie'),
    'User-Agent': extractHeader('user-agent'),
    Referer: extractHeader('referer')
  };

  // 清理 undefined 的键
  Object.keys(keptHeaders).forEach(k => keptHeaders[k] === undefined && delete keptHeaders[k]);

  return {
    url: $request.url,
    body: $request.body,
    headers: keptHeaders
  };
}

/**
 * 处理单任务匹配和会话信息写入
 */
function processTask(session, taskIdToCheck, sessionKey, successMsg) {
  if (!taskIdToCheck) return false;
  
  const reqTaskId = getTaskIdFromBody(session.body);
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
 * 修复1 & 5 & 额外建议：处理阅读页任务数组的匹配和会话写入
 * 匹配成功后，将已完成的 SubTaskId 从数组移除，并将 Session 以字典形式存储
 */
function processReadingTaskArray(session, detailStr, detailKey, sessionsKey, successMsg) {
  if (!detailStr) return false;
  
  try {
    // 解析任务详情数组
    const tasks = JSON.parse(detailStr);
    if (!Array.isArray(tasks) || tasks.length === 0) return false;

    const reqTaskId = getTaskIdFromBody(session.body);
    if (!reqTaskId) return false;

    // 查找匹配的任务索引
    const matchedIndex = tasks.findIndex(task => String(task.SubTaskId) === reqTaskId);

    if (matchedIndex !== -1) {
      const matchedTask = tasks[matchedIndex];
      const matchedSubId = String(matchedTask.SubTaskId);
      
      // --- 修复5：先构建新数据，不直接修改原数组，保障写入一致性 ---
      const newTasks = [...tasks];
      newTasks.splice(matchedIndex, 1);
      
      // --- 额外建议：构建/更新 Session 字典 ---
      let sessionsMap = {};
      try {
        const oldSessionsStr = $persistentStore.read(sessionsKey);
        if (oldSessionsStr) sessionsMap = JSON.parse(oldSessionsStr);
      } catch (e) {
        console.log("历史阅读Session缓存损坏，已自动重建");
        sessionsMap = {};
      }
      sessionsMap[matchedSubId] = session; // 以 SubTaskId 为 key 存入 Session

      // 统一序列化
      const newTasksStr = JSON.stringify(newTasks);
      const newSessionsStr = JSON.stringify(sessionsMap);

      // 统一双写校验
      const tasksSaved = $persistentStore.write(newTasksStr, detailKey);
      const sessionsSaved = $persistentStore.write(newSessionsStr, sessionsKey);

      if (tasksSaved && sessionsSaved) {
        const remainCount = newTasks.length;
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
  const session = buildSession();
  
  // 修复3：精简日志，防止撑爆控制台
  console.log(`已捕获广告请求: ${session.url}, taskId=${getTaskIdFromBody(session.body)}`);

  // 1. 尝试处理 taskId_1
  if (processTask(session, taskId, CONFIG.SESSION_KEY_1, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_1)) {
    return;
  }

  // 2. 尝试处理 阅读页任务 (优先匹配，防止被 taskId_2 截胡)
  if (processReadingTaskArray(session, readingDetailStr, CONFIG.READING_TASK_DETAIL_KEY, CONFIG.READING_SESSIONS_KEY, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_3)) {
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
