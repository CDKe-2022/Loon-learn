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
  READING_TASK_DETAIL_KEY: "qd_reading_task_detail", 
  
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  READING_SESSIONS_KEY: "qd_reading_sessions",
  
  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS_1: "🎉广告1信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_2: "🎉广告2信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_3: "🎉广告3(广告·加点！)信息获取成功!", 
  NOTIFICATION_SUBTITLE_FAIL: "🔴广告信息获取失败!",
  NOTIFICATION_SUBTITLE_WRITE_FAIL: "🔴信息写入失败!",
};

const MAX_SESSION_COUNT = 20; // 防止 Session 字典无限增长的保底阈值

// --- 读取预设的任务ID ---
const taskId = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
const taskId_2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
const readingDetailStr = $persistentStore.read(CONFIG.READING_TASK_DETAIL_KEY);

/**
 * 安全提取 taskId，兼容 Form 和 JSON，严格避免 0 值被误判
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
    // 使用 != null 严格判断，避免 taskId 为 0 时被逻辑或 (||) 吞掉
    if (obj?.taskId != null) return String(obj.taskId);
    if (obj?.TaskId != null) return String(obj.TaskId);
  } catch (e) {}

  return null;
}

/**
 * 构建精简 Session，扩充白名单，保留关键鉴权 Header
 */
function buildSession() {
  const headers = { ...$request.headers };
  
  // 辅助函数：大小写不敏感提取 Header
  const extractHeader = (name) => {
    const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : undefined;
  };

  // 白名单：保留领奖可能需要的所有关键字段
  const keptHeaders = {
    Cookie: extractHeader('cookie'),
    'User-Agent': extractHeader('user-agent'),
    Referer: extractHeader('referer'),
    Origin: extractHeader('origin'),
    'Content-Type': extractHeader('content-type'),
    Authorization: extractHeader('authorization')
  };

  // 清理 undefined 的键，节约存储空间
  Object.keys(keptHeaders).forEach(k => keptHeaders[k] === undefined && delete keptHeaders[k]);

  return {
    url: $request.url,
    taskId: getTaskIdFromBody($request.body), // 显式提取 taskId，避免后续重复解析 body
    body: $request.body,
    headers: keptHeaders
  };
}

/**
 * 处理单任务匹配和会话信息写入
 */
function processTask(session, taskIdToCheck, sessionKey, successMsg) {
  // 统一空值判断，避免 "0" 等边缘值被误杀
  if (taskIdToCheck === undefined || taskIdToCheck === null) {
    return false;
  }
  
  // 统一使用已解析的 session.taskId
  const reqTaskId = session.taskId;
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
      console.log(`写入持久化存储时发生错误: ${error.message}`);
      return false;
    }
  }
  return false;
}

/**
 * 处理阅读页任务数组的匹配和会话写入
 */
function processReadingTaskArray(session, detailStr, detailKey, sessionsKey, successMsg) {
  if (!detailStr) return false;
  
  try {
    const tasks = JSON.parse(detailStr);
    if (!Array.isArray(tasks) || tasks.length === 0) return false;

    // 统一使用已解析的 session.taskId
    const reqTaskId = session.taskId;
    if (!reqTaskId) return false;

    const matchedIndex = tasks.findIndex(task => String(task.SubTaskId) === reqTaskId);

    if (matchedIndex !== -1) {
      const matchedTask = tasks[matchedIndex];
      const matchedSubId = String(matchedTask.SubTaskId);
      
      // 1. 构建新的任务列表 (不直接修改原数组)
      const newTasks = [...tasks];
      newTasks.splice(matchedIndex, 1);
      
      // 2. 构建/更新 Session 字典
      let sessionsMap = {};
      const oldSessionsStr = $persistentStore.read(sessionsKey) || "{}"; // 备份旧数据用于回滚
      try {
        sessionsMap = JSON.parse(oldSessionsStr);
      } catch (e) {
        console.log("历史阅读Session缓存损坏，已自动重建");
        sessionsMap = {};
      }

      // 使用 timestamp 记录，彻底解决 Integer Index 排序导致的淘汰错乱
      sessionsMap[matchedSubId] = {
        session: session,
        timestamp: Date.now()
      };

      // 淘汰最旧数据
      if (Object.keys(sessionsMap).length > MAX_SESSION_COUNT) {
        const oldestEntry = Object.entries(sessionsMap).sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        const oldestKey = oldestEntry[0];
        delete sessionsMap[oldestKey];
        console.log(`Session 存储已达上限，清理最旧记录: ${oldestKey}`);
      }

      const newTasksStr = JSON.stringify(newTasks);
      const newSessionsStr = JSON.stringify(sessionsMap);

      // 3. 核心事务：先写 Session，若 Task 写入失败则回滚 Session
      const sessionsSaved = $persistentStore.write(newSessionsStr, sessionsKey);
      const tasksSaved = $persistentStore.write(newTasksStr, detailKey);

      if (!tasksSaved && sessionsSaved) {
        // Task写入失败，回滚Session到覆盖前状态
        const rollbackSaved = $persistentStore.write(oldSessionsStr, sessionsKey);
        if (!rollbackSaved) {
          console.log("严重: Session回滚失败，数据可能不一致!");
        }
        console.log(`${CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL} (Task写入失败)`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);
        return false;
      }

      if (sessionsSaved && tasksSaved) {
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
    // 统一使用 console.log 保证兼容性
    console.log(`处理阅读任务数组时发生错误: ${error.message}`);
  }
  
  return false;
}

// --- 主执行逻辑 ---
!(async () => {
  const session = buildSession();
  console.log(`已捕获广告请求: ${session.url}, taskId=${session.taskId}`);

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
