/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
   操作步骤: 我 --> 福利中心
   [rewrite local] https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body qidian.taskId.js
   [MITM] hostname = h5.if.qidian.com
*/

// --- 配置常量 ---
const CONFIG = {
  // 存储键名 - 原有两个
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",

  // 新增：存“广告·加点！”子任务的 SubTaskId
  READING_TASK_SUBID_KEY: "qd_reading_task_subid",

  // 用来记录“当天是否已获取过TaskId”的标记（存时间戳）- 原有
  TASK_ID_TS_KEY: "qd_taskId_ts",

  // 新增：专门给阅读页“广告·加点！”用的一天一次标记
  TASK_ID_TS_KEY_READING: "qd_taskId_ts_reading",

  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  NOTIFICATION_SUBTITLE_SCRIPT_ERROR: "🔴脚本运行异常!",

  // 特定的 Icon 标识 - 原有视频任务
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",

  // 新增：阅读页“广告·加点！”任务的 Title
  TARGET_READING_TASK_TITLE: "广告·加点！",

  // 成功日志前缀
  LOG_PREFIX_SUCCESS: "🎉任务信息获取成功!",
  LOG_PREFIX_FAIL: "🔴任务信息获取失败!",
  LOG_PREFIX_SCRIPT_ERROR: "🔴脚本运行异常:",

  // 可选：只通知一次的时间段（毫秒），默认 24 小时
  TTL: 24 * 60 * 60 * 1000,
};

/**
 * 获取当前日期的 YYYYMMDD 字符串
 * @returns {string}
 */
function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * 判断今天是否已经获取过 TaskId（原有视频任务）
 * @returns {boolean}
 */
function isTaskIdAlreadyFetchedToday() {
  const tsStr = $persistentStore.read(CONFIG.TASK_ID_TS_KEY);
  if (!tsStr) return false; // 从没写过

  const ts = Number(tsStr);
  if (Number.isNaN(ts)) return false;

  const now = Date.now();
  // 如果写入时间到现在还没超过 24 小时，就认为是“今天”已获取过
  return (now - ts) <= CONFIG.TTL;
}

/**
 * 标记“今天已获取过 TaskId”（原有视频任务）
 */
function markTaskIdFetched() {
  $persistentStore.write(String(Date.now()), CONFIG.TASK_ID_TS_KEY);
}

/**
 * 新增：判断今天是否已经获取过阅读页“广告·加点！”任务
 * @returns {boolean}
 */
function isReadingTaskAlreadyFetchedToday() {
  const tsStr = $persistentStore.read(CONFIG.TASK_ID_TS_KEY_READING);
  if (!tsStr) return false;

  const ts = Number(tsStr);
  if (Number.isNaN(ts)) return false;

  const now = Date.now();
  return (now - ts) <= CONFIG.TTL;
}

/**
 * 新增：标记“今天已获取过阅读页任务”
 */
function markReadingTaskFetched() {
  $persistentStore.write(String(Date.now()), CONFIG.TASK_ID_TS_KEY_READING);
}

/**
 * 安全地获取嵌套对象的属性值
 * @param {Object} obj - 源对象
 * @param {string} path - 属性路径，例如 "a.b.c"
 * @returns {*} - 属性值，如果路径不存在则返回 undefined
 */
function safeGet(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 在任务列表中查找具有特定 Icon 的任务 ID（原有视频任务）
 * @param {Array} taskList - 任务列表数组
 * @param {string} targetIcon - 目标 Icon 名称
 * @returns {string|undefined} - 找到的任务 ID，未找到则返回 undefined
 */
function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) {
    console.log(`任务列表不是数组: ${JSON.stringify(taskList)}`);
    return undefined;
  }
  const targetTask = taskList.find(task => task?.Icon === targetIcon);
  return targetTask?.TaskId;
}

/**
 * 新增：在阅读页任务列表中查找 Title 匹配的子任务 SubTaskId
 * @param {Array} taskList - ReadingPageTaskModule.TaskList 数组
 * @param {string} targetTitle - 目标 Title，例如 "广告·加点！"
 * @returns {string|undefined} - 找到的子任务 SubTaskId，未找到则返回 undefined
 */
function findReadingTaskSubIdByTitle(taskList, targetTitle) {
  if (!Array.isArray(taskList)) {
    console.log(`阅读任务列表不是数组: ${JSON.stringify(taskList)}`);
    return undefined;
  }
  // 只取第一个 Title 匹配的子任务即可（一般同 Title 的多个子任务逻辑一样）
  const targetTask = taskList.find(task => task?.Title === targetTitle);
  return targetTask?.SubTaskId;
}

/**
 * 写入持久化存储并检查结果
 * @param {string} value - 要写入的值
 * @param {string} key - 存储键
 * @returns {boolean} - 写入是否成功
 */
function writeStore(value, key) {
  if (value === undefined || value === null) {
    console.log(`尝试写入空值到 ${key}`);
    return false;
  }
  const result = $persistentStore.write(value, key);
  if (!result) {
    console.log(`写入持久化存储失败: 键=${key}, 值=${value}`);
  }
  return result;
}

// --- 主执行逻辑 ---
(() => {
  try {
    // 0. 判断“今天是否已获取过 TaskId”，如果已获取过，直接结束，不再通知
    if (isTaskIdAlreadyFetchedToday()) {
      console.log('今天已获取过 TaskId，跳过本次请求');
      $done({});
      return;
    }

    // 1. 解析响应体
    const obj = JSON.parse($response.body);
    console.log('解析的响应数据:', JSON.stringify(obj)); // 可选：调试用

    // 2. 提取原有任务 ID
    // 使用安全获取函数或可选链
    const dailyTaskList = safeGet(obj, 'Data.DailyBenefitModule.TaskList');
    const dailyTaskId = dailyTaskList?.[0]?.TaskId;
    const secondTaskId = dailyTaskList?.[1]?.TaskId; // 如需用到可保留

    // 在视频任务列表中查找
    const videoTaskList = safeGet(obj, 'Data.VideoRewardTab.TaskList');
    const videoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

    // 3. 新增：提取阅读页“广告·加点！”子任务 SubTaskId
    const readingTaskList = safeGet(obj, 'Data.ReadingPageTaskModule.TaskList');
    const readingSubTaskId = findReadingTaskSubIdByTitle(readingTaskList, CONFIG.TARGET_READING_TASK_TITLE);

    // 4. 检查必需的 ID 是否存在
    // 当前逻辑：需要 dailyTaskId 和 videoTaskId（原有） + readingSubTaskId（新增）
    if (dailyTaskId && videoTaskId && readingSubTaskId) {
      // 5. 写入持久化存储
      const write1Success = writeStore(dailyTaskId, CONFIG.TASK_ID_KEY_1);
      const write2Success = writeStore(videoTaskId, CONFIG.TASK_ID_KEY_2);
      const write3Success = writeStore(readingSubTaskId, CONFIG.READING_TASK_SUBID_KEY);

      if (write1Success && write2Success && write3Success) {
        // 6. 标记“今天已获取过 TaskId”（原有视频任务）
        markTaskIdFetched();

        // 7. 新增：标记阅读页任务今天已获取
        markReadingTaskFetched();

        // 8. 成功通知和日志
        console.log(CONFIG.LOG_PREFIX_SUCCESS);
        console.log(`taskId: ${dailyTaskId}`);
        console.log(`taskId_2: ${videoTaskId}`);
        console.log(`reading_subid: ${readingSubTaskId}`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS);
      } else {
        console.log(`${CONFIG.LOG_PREFIX_FAIL} (持久化存储写入失败)`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", `${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (写入失败)`);
      }
    } else {
      // 9. 必需的 ID 获取失败
      console.log(`${CONFIG.LOG_PREFIX_FAIL} (缺少ID: dailyTaskId=${dailyTaskId}, videoTaskId=${videoTaskId}, readingSubTaskId=${readingSubTaskId})`);
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_FAIL);
    }
  } catch (e) {
    // 10. 捕获 JSON 解析等异常
    console.log(`${CONFIG.LOG_PREFIX_SCRIPT_ERROR} ${e.message}`);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SCRIPT_ERROR);
  } finally {
    // 11. 确保脚本结束
    $done({});
  }
})(); 
