/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
操作步骤: 我 –> 福利中心
[rewrite local] https://h5.if.qidian.com/argus/api/v1/video/adv/mainPage url script-response-body qidian.taskId.js
[MITM] hostname = h5.if.qidian.com
*/

// ==================== 配置 ====================

const CONFIG = {
  // 存储键
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  READING_TASK_DETAIL_KEY: "qd_reading_task_detail",

  // 通知
  ENABLE_SUCCESS_NOTIFY: false,
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  NOTIFICATION_SUBTITLE_SCRIPT_ERROR: "🔴脚本运行异常!",

  // 特征字段
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  TARGET_READING_TASK_TITLE: "广告·加点！",

  // 日志
  LOG_PREFIX_SUCCESS: "🎉任务信息获取成功!",
  LOG_PREFIX_FAIL: "🔴任务信息获取失败!",
  LOG_PREFIX_SCRIPT_ERROR: "🔴脚本运行异常:"
};

// ==================== 工具函数 ====================

function safeGet(obj, path) {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;
  const task = taskList.find(item => item?.Icon === targetIcon && item?.TaskId != null);
  return task?.TaskId;
}

function findFirstValidTaskId(taskList) {
  if (!Array.isArray(taskList)) return undefined;
  const task = taskList.find(item => {
    if (item?.TaskId == null) return false;
    const idStr = String(item.TaskId).trim();
    return idStr !== "" && idStr !== "0" && idStr !== "null" && idStr !== "undefined";
  });
  return task?.TaskId;
}

/**
 * 过滤逻辑：未领取 (IsReceived === 0) 且 已解锁 (Status >= 0)
 * 优化：只保留领奖必须的核心字段，剔除易变文案(Title, RewardDesc)，防止无意义写入
 */
function findAvailableReadingTasks(taskList, targetTitle) {
  if (!Array.isArray(taskList)) return [];
  return taskList
    .filter(task => {
      if (task?.Title !== targetTitle || task?.SubTaskId == null) return false;
      return task?.IsReceived === 0 && Number(task?.Status) >= 0;
    })
    .map(task => ({
      SubTaskId: task.SubTaskId,
      TaskId: task.TaskId,
      Status: task.Status,
      IsReceived: task.IsReceived
    }));
}

function writeStore(value, key) {
  if (value === undefined || value === null) {
    console.log(`尝试写入 null/undefined 到 ${key}`);
    return false;
  }
  const strVal = String(value);
  if (strVal === "") {
    console.log(`写入空字符串到 ${key}`);
  }
  const result = $persistentStore.write(strVal, key);
  if (!result) {
    console.log(`写入持久化存储失败: 键=${key}`);
  }
  return result;
}

function notify(title, subtitle, body) {
  $notification.post(title, subtitle, body);
}

// ==================== 主逻辑 ====================

try {
  if (!$response?.body) {
    throw new Error("响应体为空");
  }

  const obj = JSON.parse($response.body);

  // 福利中心任务
  const dailyTaskList = safeGet(obj, "Data.DailyBenefitModule.TaskList");
  if (!Array.isArray(dailyTaskList)) {
    console.log("Data.DailyBenefitModule.TaskList 不是数组或不存在，可能是接口结构变更");
  }
  const dailyTaskId = findFirstValidTaskId(dailyTaskList);

  // 视频任务
  const videoTaskList = safeGet(obj, "Data.VideoRewardTab.TaskList");
  if (!Array.isArray(videoTaskList)) {
    console.log("Data.VideoRewardTab.TaskList 不是数组或不存在，可能是接口结构变更");
  }
  const videoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

  // 阅读任务 (获取完整对象)
  const readingTaskList = safeGet(obj, "Data.ReadingPageTaskModule.TaskList");
  if (!Array.isArray(readingTaskList)) {
    console.log("Data.ReadingPageTaskModule.TaskList 不是数组或不存在，可能是接口结构变更");
  }
  const availableReadingTasks = findAvailableReadingTasks(readingTaskList, CONFIG.TARGET_READING_TASK_TITLE);

  // 修复问题3：使用 == null 避免 TaskId 为 0 时被误判为空
  if (dailyTaskId == null || videoTaskId == null) {
    console.log(
      `${CONFIG.LOG_PREFIX_FAIL} (缺少主ID: dailyTaskId=${dailyTaskId}, videoTaskId=${videoTaskId})`
    );
    notify(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_FAIL);
  } else {
    const newTaskDetailStr = JSON.stringify(availableReadingTasks);

    // 读取旧数据
    const oldTaskId1 = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
    const oldTaskId2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
    const oldTaskDetailStr = $persistentStore.read(CONFIG.READING_TASK_DETAIL_KEY);

    // 修复问题1：JSON.parse 容错，防止历史缓存损坏导致脚本崩溃
    let oldTaskDetail = [];
    try {
      oldTaskDetail = JSON.parse(oldTaskDetailStr || "[]");
    } catch (e) {
      console.log("历史任务缓存损坏，已自动重建");
      oldTaskDetail = [];
    }
    const oldTaskDetailSafeStr = JSON.stringify(oldTaskDetail);

    // 修复问题2：比较完整的序列化字符串，确保对象内部状态变化也能被检测到
    const noChange = 
      oldTaskId1 === String(dailyTaskId) && 
      oldTaskId2 === String(videoTaskId) && 
      oldTaskDetailSafeStr === newTaskDetailStr;

    if (noChange) {
      console.log("任务信息未发生变化");
    } else {
      // 写入操作
      const write1Success = writeStore(String(dailyTaskId), CONFIG.TASK_ID_KEY_1);
      const write2Success = writeStore(String(videoTaskId), CONFIG.TASK_ID_KEY_2);
      const write3Success = writeStore(newTaskDetailStr, CONFIG.READING_TASK_DETAIL_KEY);

      if (write1Success && write2Success && write3Success) {
        console.log(`${CONFIG.LOG_PREFIX_SUCCESS} (数据已更新)`);
        console.log(`taskId: ${dailyTaskId}`);
        console.log(`taskId_2: ${videoTaskId}`);
        console.log(`reading_tasks_count: ${availableReadingTasks.length}`);
        console.log(`reading_subids: ${availableReadingTasks.map(t => t.SubTaskId).join(", ")}`);
        
        if (CONFIG.ENABLE_SUCCESS_NOTIFY) {
          notify(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS);
        }
      } else {
        console.log(`${CONFIG.LOG_PREFIX_FAIL} (持久化存储写入失败)`);
        notify(CONFIG.NOTIFICATION_TITLE, "", `${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (写入失败)`);
      }
    }
  }

} catch (e) {
  console.log(`${CONFIG.LOG_PREFIX_SCRIPT_ERROR} ${e.message}`);
  notify(CONFIG.NOTIFICATION_TITLE, "", `${CONFIG.NOTIFICATION_SUBTITLE_SCRIPT_ERROR}\n${e.message}`);
} finally {
  $done({});
}
