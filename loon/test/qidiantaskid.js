/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
   操作步骤: 我 --> 福利中心
   [rewrite local]
   https:\/\/h5\.if\.qidian\.com\/argus\/api\/v2\/video\/adv\/mainPage url script-response-body qidian.taskId.js
   [MITM]
   hostname = h5.if.qidian.com */

// --- 配置常量 ---
const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  READING_TASK_SUBID_KEY_1: "qd_reading_task_subid_1",
  READING_TASK_SUBID_KEY_2: "qd_reading_task_subid_2",
  READING_TASK_SUBID_KEY_3: "qd_reading_task_subid_3",
  
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  TARGET_READING_TASK_TITLE: "广告·加点！",
};

function safeGet(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;
  return taskList.find(task => task?.Icon === targetIcon)?.TaskId;
}

function findReadingTaskSubIdsByTitle(taskList, targetTitle, maxCount = 3) {
  if (!Array.isArray(taskList)) return [];
  const result = [];
  taskList.forEach(task => {
    if (task?.Title === targetTitle && task?.SubTaskId) {
      result.push(task.SubTaskId);
      if (result.length >= maxCount) return;
    }
  });
  return result;
}

function writeStore(value, key) {
  if (!value) return false;
  return $persistentStore.write(String(value), key);
}

// --- 主执行逻辑 ---
(() => {
  try {
    const obj = JSON.parse($response.body);
    
    // 1. 提取新的任务 ID
    const newDailyTaskId = safeGet(obj, 'Data.DailyBenefitModule.TaskList')?.[0]?.TaskId;
    const newVideoTaskId = findTaskIdByIcon(safeGet(obj, 'Data.VideoRewardTab.TaskList'), CONFIG.TARGET_VIDEO_TASK_ICON);
    const newReadingSubIds = findReadingTaskSubIdsByTitle(safeGet(obj, 'Data.ReadingPageTaskModule.TaskList'), CONFIG.TARGET_READING_TASK_TITLE, 3);

    if (!newDailyTaskId || !newVideoTaskId || newReadingSubIds.length === 0) {
      console.log(`${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (接口未返回有效ID)`);
      $done({});
      return;
    }

    const newReading1 = String(newReadingSubIds[0] || "");
    const newReading2 = String(newReadingSubIds[1] || "");
    const newReading3 = String(newReadingSubIds[2] || "");

    // 2. 读取本地已存储的旧 ID
    const oldDailyTaskId = String($persistentStore.read(CONFIG.TASK_ID_KEY_1) || "");
    const oldVideoTaskId = String($persistentStore.read(CONFIG.TASK_ID_KEY_2) || "");
    const oldReading1 = String($persistentStore.read(CONFIG.READING_TASK_SUBID_KEY_1) || "");
    const oldReading2 = String($persistentStore.read(CONFIG.READING_TASK_SUBID_KEY_2) || "");
    const oldReading3 = String($persistentStore.read(CONFIG.READING_TASK_SUBID_KEY_3) || "");

    // 3. 对比新旧数据
    const isSameData = (
      oldDailyTaskId === String(newDailyTaskId) &&
      oldVideoTaskId === String(newVideoTaskId) &&
      oldReading1 === newReading1 &&
      oldReading2 === newReading2 &&
      oldReading3 === newReading3
    );

    // 4. 如果数据完全一致，静默跳过，不通知不写入
    if (isSameData) {
      console.log("🟡任务信息未发生变化，跳过更新与通知");
      $done({});
      return;
    }

    // 5. 数据不一致（换号或任务刷新），执行写入并通知
    console.log("🟡检测到任务信息变化，准备更新...");
    const w1 = writeStore(newDailyTaskId, CONFIG.TASK_ID_KEY_1);
    const w2 = writeStore(newVideoTaskId, CONFIG.TASK_ID_KEY_2);
    const w3 = writeStore(newReading1, CONFIG.READING_TASK_SUBID_KEY_1);
    const w4 = writeStore(newReading2, CONFIG.READING_TASK_SUBID_KEY_2);
    const w5 = writeStore(newReading3, CONFIG.READING_TASK_SUBID_KEY_3);

    if (w1 && w2 && w3 && w4 && w5) {
      console.log(`🎉获取成功: taskId=${newDailyTaskId}, taskId_2=${newVideoTaskId}`);
      console.log(`reading_subid_1=${newReading1}, reading_subid_2=${newReading2}, reading_subid_3=${newReading3}`);
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS);
    } else {
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", `${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (写入失败)`);
    }

  } catch (e) {
    console.log(`🔴脚本运行异常: ${e.message}`);
  } finally {
    $done({});
  }
})();
