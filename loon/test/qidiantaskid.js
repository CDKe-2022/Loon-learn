/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
   操作步骤: 我 --> 福利中心
   [rewrite local]
   https:\/\/h5\.if\.qidian\.com\/argus\/api\/v2\/video\/adv\/mainPage url script-response-body qidian.taskId.js
   [MITM]
   hostname = h5.if.qidian.com */

// --- 配置常量 ---
const CONFIG = {
  // 存储键名（增加描述性命名）
  DAILY_TASK_KEY: "qd_taskId",
  VIDEO_TASK_KEY: "qd_taskId_2",
  READING_SUBID_KEYS: [
    "qd_reading_task_subid_1",
    "qd_reading_task_subid_2",
    "qd_reading_task_subid_3"
  ],
  
  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  
  // 目标匹配规则
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  TARGET_READING_TASK_TITLE: "广告·加点！",
};

/**
 * 安全获取对象深层属性
 */
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

/**
 * 根据 Icon 查找视频任务 ID
 */
function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;
  const task = taskList.find(t => t?.Icon === targetIcon);
  return task?.TaskId;
}

/**
 * 根据 Title 查找阅读页任务 SubIds
 */
function findReadingTaskSubIds(taskList, targetTitle, maxCount = 3) {
  if (!Array.isArray(taskList)) return [];
  const result = [];
  for (const task of taskList) {
    if (task?.Title === targetTitle && task?.SubTaskId) {
      result.push(String(task.SubTaskId));
      if (result.length >= maxCount) break;
    }
  }
  return result;
}

/**
 * 安全写入持久化存储（允许空字符串用于覆盖旧数据）
 */
function writeStore(value, key) {
  const valToWrite = (value === undefined || value === null) ? "" : String(value);
  $persistentStore.write(valToWrite, key);
}

// --- 主执行逻辑 ---
(() => {
  let isDataChanged = false;
  let logMsg = "";

  try {
    // 1. 基础响应校验
    const respBody = $response.body;
    if (!respBody) throw new Error("未捕获到响应体");
    
    const obj = JSON.parse(respBody);
    
    // 修改点1：起点接口成功标志是 Result: 0，而不是 Code
    const result = obj.Result ?? obj.result;
    if (result !== undefined && result !== 0) {
      throw new Error(`接口返回非成功状态: Result=${result}`);
    }

    const data = obj.Data;
    if (!data || typeof data !== 'object') {
      throw new Error("响应数据 Data 结构无效");
    }

    // 2. 提取福利任务 ID（取第一个有效的 TaskId）
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

    // 3. 提取视频任务 ID
    const videoTaskList = safeGet(data, 'VideoRewardTab.TaskList', []);
    const newVideoTaskId = findTaskIdByIcon(videoTaskList, CONFIG.TARGET_VIDEO_TASK_ICON);

    // 4. 提取阅读页任务 IDs
    const readingTaskList = safeGet(data, 'ReadingPageTaskModule.TaskList', []);
    const newReadingSubIds = findReadingTaskSubIds(readingTaskList, CONFIG.TARGET_READING_TASK_TITLE, 3);

    // 5. 模块独立更新逻辑（仅在抓取到新数据时才覆盖本地）
    
    // [模块A] 福利任务
    if (newDailyTaskId) {
      const oldVal = $persistentStore.read(CONFIG.DAILY_TASK_KEY) || "";
      if (oldVal !== String(newDailyTaskId)) {
        writeStore(newDailyTaskId, CONFIG.DAILY_TASK_KEY);
        isDataChanged = true;
      }
    }

    // [模块B] 视频任务
    if (newVideoTaskId) {
      const oldVal = $persistentStore.read(CONFIG.VIDEO_TASK_KEY) || "";
      if (oldVal !== String(newVideoTaskId)) {
        writeStore(newVideoTaskId, CONFIG.VIDEO_TASK_KEY);
        isDataChanged = true;
      }
    }

    // [模块C] 阅读页任务
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
    // 【核心修复】：保留“未抓到则不清空”逻辑，防止接口波动导致误删有效任务ID

    // 6. 统一日志与通知输出
    logMsg = `Daily: ${newDailyTaskId || '-'}, Video: ${newVideoTaskId || '-'}, Reading: ${JSON.stringify(newReadingSubIds)}`;
    console.log(isDataChanged ? `🟡检测到变化已更新 | ${logMsg}` : `🟢数据无变化 | ${logMsg}`);
    
    // 修改点2：重写脚本应尽量保持安静，仅在数据发生变化或异常时弹通知，避免频繁打扰
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
