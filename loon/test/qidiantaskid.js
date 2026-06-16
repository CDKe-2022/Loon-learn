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
  READING_SUBID_KEYS: [
    "qd_reading_task_subid_1",
    "qd_reading_task_subid_2",
    "qd_reading_task_subid_3"
  ],
  
  NOTIFICATION_TITLE: "起点读书",
  
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  // 核心修复：去除叹号，使用核心关键词匹配，兼容【限时】等前缀
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
 * 根据 Title 包含关键词查找阅读页任务 SubIds
 */
function findReadingTaskSubIds(taskList, targetTitle, maxCount = 3) {
  if (!Array.isArray(taskList)) return [];
  const result = [];
  for (const task of taskList) {
    // 核心修复：使用 includes 匹配，防止起点增加【限时】等前缀导致匹配失败
    const title = task?.Title || "";
    if (title.includes(targetTitle) && task?.SubTaskId) {
      result.push(String(task.SubTaskId));
      if (result.length >= maxCount) break;
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

    const dailyTaskList = safeGet(data, 'DailyBenefitModule.TaskList', []);
    let newDailyTaskId = undefined;
    if (Array.isArray(dailyTaskList)) {
      for (const task of dailyTaskList) {
        if (task?.TaskId) {
          newDailyTaskId = task.TaskId;
          break;
        }
      }
    }

    const videoTaskList = safeGet(data, 'VideoRewardTab.TaskList', []);
    const newVideoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

    const readingTaskList = safeGet(data, 'ReadingPageTaskModule.TaskList', []);
    const newReadingSubIds = findReadingTaskSubIds(readingTaskList, CONFIG.TARGET_READING_TASK_TITLE, 3);

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

    if (newReadingSubIds.length > 0) {
      const oldVals = CONFIG.READING_SUBID_KEYS.map(k => $persistentStore.read(k) || "");
      let needUpdate = false;
      
      for (let i = 0; i < 3; i++) {
        const newVal = newReadingSubIds[i] || "";
        if (oldVals[i] !== newVal) needUpdate = true;
      }
      
      if (needUpdate) {
        for (let i = 0; i < 3; i++) {
          writeStore(newReadingSubIds[i] || "", CONFIG.READING_SUBID_KEYS[i]);
        }
        isDataChanged = true;
      }
    } 

    logMsg = `Daily: ${newDailyTaskId || '-'}, Video: ${newVideoTaskId || '-'}, Reading: ${JSON.stringify(newReadingSubIds)}`;
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
