/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
   操作步骤: 我 --> 福利中心
   [rewrite local]
   https:\/\/h5\.if\.qidian\.com\/argus\/api\/v2\/video\/adv\/mainPage url script-response-body qidian.taskId.js
   [MITM]
   hostname = h5.if.qidian.com */

// --- 配置常量 ---
const CONFIG = {
  DAILY_TASK_KEY: "qd_taskId",
  VIDEO_TASK_KEY: "qd_taskId_2",
  
  // 核心优化：不再写死 _1 到 _6，改为单键存储所有ID，用逗号分隔
  READING_SUBIDS_KEY: "qd_reading_task_subids", 
  
  NOTIFICATION_TITLE: "起点读书",
  
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  TARGET_READING_TASK_TITLE: "广告·加点", 
};

function safeGet(obj, path, defaultValue = undefined) {
  if (!obj || !path) return defaultValue;
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || typeof current !== 'object') return defaultValue;
    current = current[key];
  }
  return current === undefined ? defaultValue : current;
}

function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;
  const task = taskList.find(t => t?.Icon === targetIcon);
  return task?.TaskId;
}

/**
 * 提取所有包含关键词的 SubTaskId
 */
function findAllReadingSubIds(taskList, targetTitle) {
  if (!Array.isArray(taskList)) return [];
  const result = [];
  for (const task of taskList) {
    const title = task?.Title || "";
    if (title.includes(targetTitle) && task?.SubTaskId) {
      result.push(String(task.SubTaskId));
    }
  }
  return result;
}

function writeStore(value, key) {
  const valToWrite = (value === undefined || value === null) ? "" : String(value);
  $persistentStore.write(valToWrite, key);
}

// --- 主执行逻辑 ---
(() => {
  let isDataChanged = false;
  let logMsg = "";

  try {
    const respBody = $response.body;
    if (!respBody) throw new Error("未捕获到响应体");
    
    const obj = JSON.parse(respBody);
    
    const result = obj.Result ?? obj.result;
    if (result !== undefined && result !== 0) {
      throw new Error(`接口返回非成功状态: Result=${result}`);
    }

    const data = obj.Data;
    if (!data || typeof data !== 'object') {
      throw new Error("响应数据 Data 结构无效");
    }

    // 1. 福利任务
    const dailyTaskList = safeGet(data, 'DailyBenefitModule.TaskList', []);
    let newDailyTaskId = undefined;
    if (Array.isArray(dailyTaskList)) {
      for (const task of dailyTaskList) {
        if (task?.TaskId) { newDailyTaskId = task.TaskId; break; }
      }
    }

    // 2. 视频任务
    const videoTaskList = safeGet(data, 'VideoRewardTab.TaskList', []);
    const newVideoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

    // 3. 阅读页任务 (动态获取所有，不限制数量)
    const readingTaskList = safeGet(data, 'ReadingPageTaskModule.TaskList', []);
    const newReadingSubIds = findAllReadingSubIds(readingTaskList, CONFIG.TARGET_READING_TASK_TITLE);

    // --- 存储逻辑 ---
    
    if (newDailyTaskId) {
      const oldVal = $persistentStore.read(CONFIG.DAILY_TASK_KEY) || "";
      if (oldVal !== String(newDailyTaskId)) {
        writeStore(newDailyTaskId, CONFIG.DAILY_TASK_KEY);
        isDataChanged = true;
      }
    }

    if (newVideoTaskId) {
      const oldVal = $persistentStore.read(CONFIG.VIDEO_TASK_KEY) || "";
      if (oldVal !== String(newVideoTaskId)) {
        writeStore(newVideoTaskId, CONFIG.VIDEO_TASK_KEY);
        isDataChanged = true;
      }
    }

    // 核心优化：将数组用逗号拼接成字符串存入，例如 "id1,id2,id3,id4,id5,id6"
    if (newReadingSubIds.length > 0) {
      const newValStr = newReadingSubIds.join(',');
      const oldValStr = $persistentStore.read(CONFIG.READING_SUBIDS_KEY) || "";
      if (oldValStr !== newValStr) {
        writeStore(newValStr, CONFIG.READING_SUBIDS_KEY);
        isDataChanged = true;
      }
    }

    logMsg = `Daily: ${newDailyTaskId || '-'}, Video: ${newVideoTaskId || '-'}, Reading(${newReadingSubIds.length}个): ${newReadingSubIds.join(',')}`;
    console.log(isDataChanged ? `🟡检测到变化已更新 | ${logMsg}` : `🟢数据无变化 | ${logMsg}`);
    
    if (isDataChanged) {
      $notification.post(CONFIG.NOTIFICATION_TITLE, "🎉任务信息已更新!", logMsg);
    }

  } catch (e) {
    console.log(`🔴脚本运行异常: ${e.message}`);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "🔴获取失败", e.message);
  } finally {
    $done({});
  }
})();
