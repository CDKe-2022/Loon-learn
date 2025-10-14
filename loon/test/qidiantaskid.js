/* 
脚本功能: 获取 起点读书 任务信息 (仅 Loon)
操作步骤: 我 --> 福利中心

[rewrite local]
https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body qidian.taskId.js

[MITM]
hostname = h5.if.qidian.com
*/

// --- 配置常量 ---
const CONFIG = {
  // 存储键名
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  NOTIFICATION_SUBTITLE_SCRIPT_ERROR: "🔴脚本运行异常!",
  // 特定的 Icon 标识
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  // 成功日志前缀
  LOG_PREFIX_SUCCESS: "🎉任务信息获取成功!",
  LOG_PREFIX_FAIL: "🔴任务信息获取失败!",
  LOG_PREFIX_SCRIPT_ERROR: "🔴脚本运行异常:",
};

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
 * 在任务列表中查找具有特定 Icon 的任务 ID
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
    // 1. 解析响应体
    const obj = JSON.parse($response.body);
    console.log('解析的响应数据:', JSON.stringify(obj)); // 可选：调试用

    // 2. 提取任务 ID
    // 使用安全获取函数或可选链
    const dailyTaskList = safeGet(obj, 'Data.DailyBenefitModule.TaskList');
    const dailyTaskId = dailyTaskList?.[0]?.TaskId;
    const secondTaskId = dailyTaskList?.[1]?.TaskId; // 注意：如果不需要 b，可以移除或注释掉

    // 在视频任务列表中查找
    const videoTaskList = safeGet(obj, 'Data.VideoRewardTab.TaskList');
    const videoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

    // 3. 检查必需的 ID 是否存在
    // 当前逻辑：需要 dailyTaskId 和 videoTaskId
    // 如果 secondTaskId 也是必需的，则改为：if (dailyTaskId && secondTaskId && videoTaskId)
    if (dailyTaskId && videoTaskId) { 
      // 4. 写入持久化存储
      const write1Success = writeStore(dailyTaskId, CONFIG.TASK_ID_KEY_1);
      const write2Success = writeStore(videoTaskId, CONFIG.TASK_ID_KEY_2);

      if (write1Success && write2Success) {
        // 5. 成功通知和日志
        console.log(CONFIG.LOG_PREFIX_SUCCESS);
        console.log(`taskId: ${dailyTaskId}`);
        console.log(`taskId_2: ${videoTaskId}`); // 显示 videoTaskId 而不是 c
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS);
      } else {
        // 如果写入失败
        console.log(`${CONFIG.LOG_PREFIX_FAIL} (持久化存储写入失败)`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", `${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (写入失败)`);
      }
    } else {
      // 6. 必需的 ID 获取失败
      console.log(`${CONFIG.LOG_PREFIX_FAIL} (缺少ID: dailyTaskId=${dailyTaskId}, videoTaskId=${videoTaskId})`); // 明确指出哪个ID缺失
      // console.log($response.body); // 可选：如果需要调试原始响应，取消注释
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_FAIL);
    }
  } catch (e) {
    // 7. 捕获 JSON 解析等异常
    console.log(`${CONFIG.LOG_PREFIX_SCRIPT_ERROR} ${e.message}`);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SCRIPT_ERROR);
  } finally {
    // 8. 确保脚本结束
    $done({});
  }
})();