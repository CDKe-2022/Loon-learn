/*
脚本功能: 获取 起点读书 广告信息
操作步骤: 福利中心 -> 手动观看广告
*/

// 配置
const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  TASK_ID_KEY_3: "qd_taskId_3",

  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  SESSION_KEY_3: "qd_session_3",

  NOTIFICATION_TITLE: "起点读书",

  NOTIFICATION_SUBTITLE_SUCCESS_1: "🎉广告1信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_2: "🎉广告2信息获取成功!",
  NOTIFICATION_SUBTITLE_SUCCESS_3: "🎉广告加点信息获取成功!",

  NOTIFICATION_SUBTITLE_FAIL: "🔴广告信息获取失败!",
  NOTIFICATION_SUBTITLE_WRITE_FAIL: "🔴信息写入失败!"
};

// 读取任务ID
const taskId1 = $persistentStore.read(CONFIG.TASK_ID_KEY_1);
const taskId2 = $persistentStore.read(CONFIG.TASK_ID_KEY_2);
const taskId3 = $persistentStore.read(CONFIG.TASK_ID_KEY_3);

/**
 * 处理任务
 */
function processTask(session, taskId, sessionKey, successMsg) {

  if (!taskId) return false;

  if (session.body && session.body.includes(taskId)) {

    try {

      const result = $persistentStore.write(
        JSON.stringify(session),
        sessionKey
      );

      if (result) {

        console.log(successMsg);

        $notification.post(
          CONFIG.NOTIFICATION_TITLE,
          "",
          `${successMsg}\nTaskId=${taskId}`
        );

        return true;

      }

      console.log(CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL);

      $notification.post(
        CONFIG.NOTIFICATION_TITLE,
        "",
        CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL
      );

      return false;

    } catch (e) {

      console.log(`写入异常: ${e.message}`);

      $notification.post(
        CONFIG.NOTIFICATION_TITLE,
        "",
        CONFIG.NOTIFICATION_SUBTITLE_WRITE_FAIL
      );

      return false;
    }
  }

  return false;
}

!(async () => {

  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers
  };

  console.log("捕获请求:");
  console.log(session.body);

  // 广告1
  if (
    processTask(
      session,
      taskId1,
      CONFIG.SESSION_KEY_1,
      CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_1
    )
  ) return;

  // 广告2
  if (
    processTask(
      session,
      taskId2,
      CONFIG.SESSION_KEY_2,
      CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_2
    )
  ) return;

  // 广告加点
  if (
    processTask(
      session,
      taskId3,
      CONFIG.SESSION_KEY_3,
      CONFIG.NOTIFICATION_SUBTITLE_SUCCESS_3
    )
  ) return;

  console.log(CONFIG.NOTIFICATION_SUBTITLE_FAIL);

  $notification.post(
    CONFIG.NOTIFICATION_TITLE,
    "",
    CONFIG.NOTIFICATION_SUBTITLE_FAIL
  );

})().finally(() => {
  $done({});
});