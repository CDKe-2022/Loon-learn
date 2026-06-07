/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
   操作步骤: 我 --> 福利中心
   [rewrite local] https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body qidian.taskId.js
   [MITM] hostname = h5.if.qidian.com
*/

// --- 配置常量 ---
const CONFIG = {
  // 存储键名
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  READING_TASK_SUBIDS_KEY: "qd_reading_task_subids", // 存储可操作的 SubTaskId 数组 (JSON格式)

  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  NOTIFICATION_SUBTITLE_SCRIPT_ERROR: "🔴脚本运行异常!",

  // 特定的 Icon 标识 - 原有视频任务
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  // 阅读页“广告·加点！”任务的 Title
  TARGET_READING_TASK_TITLE: "广告·加点！",

  // 成功日志前缀
  LOG_PREFIX_SUCCESS: "🎉任务信息获取成功!",
  LOG_PREFIX_FAIL: "🔴任务信息获取失败!",
  LOG_PREFIX_SCRIPT_ERROR: "🔴脚本运行异常:",
};

/**
 * 安全地获取嵌套对象的属性值
 */
function safeGet(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 在任务列表中查找具有特定 Icon 的任务 ID（原有视频任务）
 */
function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;
  const targetTask = taskList.find(task => task?.Icon === targetIcon);
  return targetTask?.TaskId;
}

/**
 * 获取阅读页任务中，当前可操作/可领取的 SubTaskId 数组
 * 核心修复：排除已领取(Status=3)和未解锁(Status=-1)的任务
 */
function findAvailableReadingSubTaskIds(taskList, targetTitle) {
  if (!Array.isArray(taskList)) return [];
  
  return [...new Set(
    taskList
      .filter(task => {
        if (task?.Title !== targetTitle || !task?.SubTaskId) return false;
        
        // 核心过滤逻辑：只保留未领取且已解锁的任务
        // Status: -1 未解锁, 0 进行中/待完成, 3 已完成/已领取
        return task?.IsReceived === 0 && task?.Status !== -1; 
      })
      .map(task => String(task.SubTaskId))
  )];
}

/**
 * 写入持久化存储并检查结果
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

    // 2. 提取原有任务 ID（增加 find 保护，防止数组越界或顺序调整）
    const dailyTaskList = safeGet(obj, 'Data.DailyBenefitModule.TaskList');
    const dailyTaskId = dailyTaskList?.find(t => t?.TaskId)?.TaskId;

    // 在视频任务列表中查找
    const videoTaskList = safeGet(obj, 'Data.VideoRewardTab.TaskList');
    const videoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

    // 3. 提取阅读页“广告·加点！”可操作的 SubTaskId 数组
    const readingTaskList = safeGet(obj, 'Data.ReadingPageTaskModule.TaskList');
    const readingSubTaskIds = findAvailableReadingSubTaskIds(readingTaskList, CONFIG.TARGET_READING_TASK_TITLE);

    // 4. 检查必需的主 ID 是否存在 (放宽对 readingSubTaskIds 的限制，允许为空数组以更新已完成状态)
    if (dailyTaskId && videoTaskId) {
      
      // 读取旧数据进行比对
      const oldTaskId1 = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
      const oldTaskId2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
      const oldSubIdsStr = $persistentStore.read(CONFIG.READING_TASK_SUBIDS_KEY);
      const newSubIdsStr = JSON.stringify(readingSubTaskIds);

      // 如果数据完全没有变化，则跳过写入，减少 IO 消耗
      if (oldTaskId1 === dailyTaskId && oldTaskId2 === videoTaskId && oldSubIdsStr === newSubIdsStr) {
        console.log('任务信息未发生变化，无需更新');
        $done({});
        return;
      }

      // 5. 数据有变化，写入持久化存储
      const write1Success = writeStore(dailyTaskId, CONFIG.TASK_ID_KEY_1);
      const write2Success = writeStore(videoTaskId, CONFIG.TASK_ID_KEY_2);
      const write3Success = writeStore(newSubIdsStr, CONFIG.READING_TASK_SUBIDS_KEY);

      if (write1Success && write2Success && write3Success) {
        
        // 7. 成功日志（增强日志格式）
        console.log(CONFIG.LOG_PREFIX_SUCCESS + " (数据已更新)");
        console.log(`taskId: ${dailyTaskId}`);
        console.log(`taskId_2: ${videoTaskId}`);
        console.log(`reading_subids(${readingSubTaskIds.length}): ${readingSubTaskIds.join(', ')}`);
        
        // 如果你不想每次数据变动都弹通知，可以把下面这行注释掉
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS);
        
      } else {
        console.log(`${CONFIG.LOG_PREFIX_FAIL} (持久化存储写入失败)`);
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", `${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (写入失败)`);
      }
      
    } else {
      // 9. 必需的主 ID 获取失败
      console.log(`${CONFIG.LOG_PREFIX_FAIL} (缺少主ID: dailyTaskId=${dailyTaskId}, videoTaskId=${videoTaskId})`);
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
