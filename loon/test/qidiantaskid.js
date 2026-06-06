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
  TASK_ID_KEY_3: "qd_taskId_3",

  // 时间戳
  TASK_ID_TS_KEY: "qd_taskId_ts",

  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS: "🎉任务信息获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴任务信息获取失败!",
  NOTIFICATION_SUBTITLE_SCRIPT_ERROR: "🔴脚本运行异常!",

  // 视频任务
  TARGET_VIDEO_TASK_ICON: "额外看3次小视频得奖励",

  // 阅读广告任务
  TARGET_READING_TASK_TITLE: "广告·加点！",

  LOG_PREFIX_SUCCESS: "🎉任务信息获取成功!",
  LOG_PREFIX_FAIL: "🔴任务信息获取失败!",
  LOG_PREFIX_SCRIPT_ERROR: "🔴脚本运行异常:",

  TTL: 30 * 1000,
};

/**
 * 判断是否已获取
 */
function isTaskIdAlreadyFetchedToday() {
  const tsStr = $persistentStore.read(CONFIG.TASK_ID_TS_KEY);
  if (!tsStr) return false;

  const ts = Number(tsStr);
  if (Number.isNaN(ts)) return false;

  return (Date.now() - ts) <= CONFIG.TTL;
}

/**
 * 标记已获取
 */
function markTaskIdFetched() {
  $persistentStore.write(String(Date.now()), CONFIG.TASK_ID_TS_KEY);
}

/**
 * 安全获取
 */
function safeGet(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * 根据 Icon 查找任务
 */
function findTaskIdByIcon(taskList, targetIcon) {
  if (!Array.isArray(taskList)) return undefined;

  const targetTask = taskList.find(
    task => task?.Icon === targetIcon
  );

  return targetTask?.TaskId;
}

/**
 * 根据 Title 查找任务
 */
function findTaskIdByTitle(taskList, targetTitle) {
  if (!Array.isArray(taskList)) return undefined;

  const targetTask = taskList.find(
    task => task?.Title === targetTitle
  );

  return targetTask?.TaskId;
}

/**
 * 写入存储
 */
function writeStore(value, key) {
  if (value === undefined || value === null) {
    console.log(`尝试写入空值到 ${key}`);
    return false;
  }

  const result = $persistentStore.write(String(value), key);

  if (!result) {
    console.log(`写入失败: ${key} = ${value}`);
  }

  return result;
}

// --- 主逻辑 ---
(() => {
  try {

    if (isTaskIdAlreadyFetchedToday()) {
      console.log("今天已获取过 TaskId，跳过");
      $done({});
      return;
    }

    const obj = JSON.parse($response.body);

    // 日常任务
    const dailyTaskList =
      safeGet(obj, "Data.DailyBenefitModule.TaskList");

    const dailyTaskId =
      dailyTaskList?.[0]?.TaskId;

    // 视频奖励任务
    const videoTaskList =
      safeGet(obj, "Data.VideoRewardTab.TaskList");

    const videoTaskId =
      findTaskIdByIcon(
        videoTaskList,
        CONFIG.TARGET_VIDEO_TASK_ICON
      );

    // 广告加点任务
    const readingTaskList =
      safeGet(obj, "Data.ReadingPageTaskModule.TaskList");

    const readingTaskId =
      findTaskIdByTitle(
        readingTaskList,
        CONFIG.TARGET_READING_TASK_TITLE
      );

    // 校验
    if (
      dailyTaskId &&
      videoTaskId &&
      readingTaskId
    ) {

      const write1Success =
        writeStore(
          dailyTaskId,
          CONFIG.TASK_ID_KEY_1
        );

      const write2Success =
        writeStore(
          videoTaskId,
          CONFIG.TASK_ID_KEY_2
        );

      const write3Success =
        writeStore(
          readingTaskId,
          CONFIG.TASK_ID_KEY_3
        );

      if (
        write1Success &&
        write2Success &&
        write3Success
      ) {

        markTaskIdFetched();

        console.log(CONFIG.LOG_PREFIX_SUCCESS);
        console.log(`taskId: ${dailyTaskId}`);
        console.log(`taskId_2: ${videoTaskId}`);
        console.log(`taskId_3: ${readingTaskId}`);

        $notification.post(
          CONFIG.NOTIFICATION_TITLE,
          "任务ID获取成功",
          `task1:${dailyTaskId}\ntask2:${videoTaskId}\ntask3:${readingTaskId}`
        );

      } else {

        console.log(
          `${CONFIG.LOG_PREFIX_FAIL} (写入失败)`
        );

        $notification.post(
          CONFIG.NOTIFICATION_TITLE,
          "",
          `${CONFIG.NOTIFICATION_SUBTITLE_FAIL} (写入失败)`
        );
      }

    } else {

      console.log(
        `${CONFIG.LOG_PREFIX_FAIL}
dailyTaskId=${dailyTaskId}
videoTaskId=${videoTaskId}
readingTaskId=${readingTaskId}`
      );

      $notification.post(
        CONFIG.NOTIFICATION_TITLE,
        "",
        `获取失败\nDaily:${dailyTaskId || "null"}\nVideo:${videoTaskId || "null"}\nReading:${readingTaskId || "null"}`
      );
    }

  } catch (e) {

    console.log(
      `${CONFIG.LOG_PREFIX_SCRIPT_ERROR} ${e.message}`
    );

    $notification.post(
      CONFIG.NOTIFICATION_TITLE,
      "",
      `${CONFIG.NOTIFICATION_SUBTITLE_SCRIPT_ERROR}\n${e.message}`
    );

  } finally {
    $done({});
  }
})();