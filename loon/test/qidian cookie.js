/* 
脚本功能: 获取 起点读书 广告信息
[Script]
http-request ^https?:\/\/(h5|magev6)\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch script-path=qidian.cookie.js, requires-body=true
[MITM]
hostname = %APPEND% h5.if.qidian.com, magev6.if.qidian.com
*/

const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  READING_TASK_SUBIDS_KEY: "qd_reading_task_subids", // 读取ID数组
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  SESSION_KEY_3: "qd_session_3", // 存阅读任务模板
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_SUCCESS_1: "🎉广告1信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_2: "🎉广告2信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_3: "🎉广告3(阅读任务)模板获取成功!",
  NOTIFICATION_SUBTITLE_FAIL: "🔴广告信息获取失败!",
  NOTIFICATION_SUBTITLE_WRITE_FAIL: "🔴信息写入失败!",
};

const taskId = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
const taskId_2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
// 读取阅读任务ID数组
const readingTaskIds = JSON.parse($persistentStore.read(CONFIG.READING_TASK_SUBIDS_KEY) || "[]");

function processTask(session, taskIdToCheck, sessionKey, successMsg) {
  if (taskIdToCheck && session.body && session.body.includes(taskIdToCheck)) {
    try {
      if ($persistentStore.write(JSON.stringify(session), sessionKey)) {
        $notification.post(CONFIG.NOTIFICATION_TITLE, "", successMsg);
        return true;
      }
    } catch (error) {
      console.error(`写入失败: ${error.message}`);
      return false;
    }
  }
  return false;
}

!(async () => {
  const session = { url: $request.url, body: $request.body, headers: $request.headers };

  if (processTask(session, taskId, CONFIG.SESSION_KEY_1, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_1)) return;
  if (processTask(session, taskId_2, CONFIG.SESSION_KEY_2, CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_2)) return;

  // 新增：遍历阅读任务ID数组，只要匹配上一个，就作为模板存储
  for (const rId of readingTaskIds) {
    if (rId && session.body && session.body.includes(rId)) {
      try {
        if ($persistentStore.write(JSON.stringify(session), CONFIG.SESSION_KEY_3)) {
          console.log(`🎉阅读任务模板获取成功，匹配ID: ${rId}`);
          $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_3);
          return;
        }
      } catch (error) {
        console.error(`写入失败: ${error.message}`);
      }
      break;
    }
  }

  console.log(CONFIG.NOTIFICATION_SUBTITLE_FAIL);
})().finally(() => { $done({}); });
