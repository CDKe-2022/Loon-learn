/* 脚本功能: 获取 起点读书 任务信息 (仅 Loon)
   操作步骤: 我 --> 福利中心
   [rewrite local] https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body qidian.taskId.js
   [MITM] hostname = h5.if.qidian.com
*/

// --- 配置常量 ---
const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  READING_TASK_SUBIDS_KEY: "qd_reading_task_subids", // 改为存数组
  TASK_ID_TS_KEY: "qd_taskId_ts",
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",
  TARGET_READING_TASK_TITLE: "广告·加点！",
  TTL: 24 * 60 * 60 * 1000,
};

function safeGet(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;
  const targetTask = taskList.find(task => task?.Icon === targetIcon);
  return targetTask?.TaskId;
}

// 新增：提取所有同名的 SubTaskId，返回数组
function findAllReadingTaskSubIds(taskList, targetTitle) {
  if (!Array.isArray(taskList)) return [];
  return taskList
    .filter(task => task?.Title === targetTitle)
    .map(task => task?.SubTaskId)
    .filter(id => id !== undefined && id !== null);
}

function writeStore(value, key) {
  if (value === undefined || value === null) return false;
  const result = $persistentStore.write(value, key);
  return result;
}

(() => {
  try {
    const obj = JSON.parse($response.body);
    
    const dailyTaskId = safeGet(obj, 'Data.DailyBenefitModule.TaskList')?.[0]?.TaskId;
    const videoTaskId = findTaskIdByIcon(safeGet(obj, 'Data.VideoRewardTab.TaskList'), CONFIG.TARGET_VIDEO_TASK_ICON);
    const readingSubTaskIds = findAllReadingTaskSubIds(safeGet(obj, 'Data.ReadingPageTaskModule.TaskList'), CONFIG.TARGET_READING_TASK_TITLE);

    // 判断原有任务是否需要更新（保留防重复机制）
    const isTask1Fetched = (() => {
      const ts = Number($persistentStore.read(CONFIG.TASK_ID_TS_KEY));
      return !isNaN(ts) && (Date.now() - ts) <= CONFIG.TTL;
    })();

    let needNotify = false;

    // 原有任务1和2：今天没抓过才写入
    if (!isTask1Fetched && dailyTaskId && videoTaskId) {
      if (writeStore(dailyTaskId, CONFIG.TASK_ID_KEY_1) && writeStore(videoTaskId, CONFIG.TASK_ID_KEY_2)) {
        $persistentStore.write(String(Date.now()), CONFIG.TASK_ID_TS_KEY);
        needNotify = true;
      }
    }

    // 阅读任务：只要列表有变化就更新（取消防重复限制，确保解锁第二块时能更新）
    if (readingSubTaskIds.length > 0) {
      writeStore(JSON.stringify(readingSubTaskIds), CONFIG.READING_TASK_SUBIDS_KEY);
      needNotify = true;
    }

    if (needNotify) {
      console.log(`🎉获取成功: daily=${dailyTaskId}, video=${videoTaskId}, readingIds=${JSON.stringify(readingSubTaskIds)}`);
      $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS);
    } else {
      console.log('今日已获取过基础任务，且阅读任务无更新');
    }

  } catch (e) {
    console.log(`🔴脚本运行异常: ${e.message}`);
  } finally {
    $done({});
  }
})();
