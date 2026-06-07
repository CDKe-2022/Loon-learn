/* 
🥳 脚本功能: 自动观看 起点读书 广告 - 福利中心 (仅支持 Loon)
任务1: 福利中心 --> 每日视频福利
任务2: 福利中心 --> 限时彩蛋 --> 额外看三次小视频奖励
默认间隔时间: 0.5s (可通过 qd_timeout 修改)
*/

// --- 配置常量 ---
const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  TIMEOUT_KEY: "qd_timeout",
  
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "福利中心任务执行完成",
  
  TASK_1_EXECUTIONS: 8, 
  TASK_2_EXECUTIONS: 2, 
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
};

// --- 检查必要数据并退出 ---
function checkDataAndExit() {
  const missingItems = [];
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_1)) missingItems.push("任务1 ID");
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_2)) missingItems.push("任务2 ID");
  if (!$persistentStore.read(CONFIG.SESSION_KEY_1)) missingItems.push("广告1会话");
  if (!$persistentStore.read(CONFIG.SESSION_KEY_2)) missingItems.push("广告2会话");

  if (missingItems.length > 0) {
    const errorMsg = `⚠️缺少: ${missingItems.join(', ')}。${CONFIG.NOTIFICATION_SUBTITLE_MISSING_DATA}`;
    console.log(errorMsg);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️数据缺失", errorMsg);
    $done(); 
    return false; 
  }
  return true; 
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTask(sessionStr, taskLabel) {
  if (!sessionStr) return false;
  let options;
  try {
    options = JSON.parse(sessionStr);
  } catch (e) { return false; }

  return new Promise((resolve) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) { console.log(`🔴${taskLabel} 请求失败`); resolve(false); return; }
      try {
        const obj = JSON.parse(data);
        if (obj?.Result === CONFIG.SUCCESS_RESULT_CODE) {
          console.log(`🎉${taskLabel} 成功!`);
          resolve(true);
        } else {
          console.log(`🔴${taskLabel} 失败: ${data}`);
          resolve(false);
        }
      } catch (e) { resolve(false); }
    });
  });
}

(async () => {
  if (!checkDataAndExit()) return;

  const session = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const session2 = $persistentStore.read(CONFIG.SESSION_KEY_2);
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;
  console.log(`⏱️ 设置的间隔时间: ${timeout} 秒`);

  for (let i = 0; i < CONFIG.TASK_1_EXECUTIONS; i++) {
    console.log(`🟡任务1执行: 第 ${i + 1} 次`);
    await runTask(session, "任务1");
    if (i < CONFIG.TASK_1_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  for (let j = 0; j < CONFIG.TASK_2_EXECUTIONS; j++) {
    console.log(`🟡任务2执行: 第 ${j + 1} 次`);
    await runTask(session2, "任务2");
    if (j < CONFIG.TASK_2_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  console.log("✅ " + CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
});
