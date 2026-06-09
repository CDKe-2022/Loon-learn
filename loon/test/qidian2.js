/* 🥳 脚本功能: 自动观看 起点读书 阅读页广告 (任务3: 广告·加点！)
   执行策略: 状态机驱动 (0→1→2→3)，Session永不清除，可审计可回滚
   默认间隔时间: 0.5s (可通过 qd_timeout 修改) */

const CONFIG = {
  READING_SESSION_KEYS: [
    "qd_reading_session_1", 
    "qd_reading_session_2", 
    "qd_reading_session_3"
  ],
  // 新增：进度状态键
  READING_PROGRESS_KEY: "qd_reading_progress",
  
  TIMEOUT_KEY: "qd_timeout",
  NOTIFICATION_TITLE: "起点读书",
  
  // 每组执行次数。手动抓包看1次，脚本只需再刷2次。
  TASK_3_EXECUTIONS: 2, 
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTask(sessionStr, taskLabel) {
  let options;
  try {
    options = JSON.parse(sessionStr);
  } catch (e) {
    console.error(`🔴解析 ${taskLabel} 会话信息失败: ${e.message}`);
    return false;
  }
  
  return new Promise((resolve) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) {
        console.log(`🔴${taskLabel} 请求失败: ${error}`);
        resolve(false);
        return;
      }
      try {
        const obj = JSON.parse(data);
        if (obj?.Result === CONFIG.SUCCESS_RESULT_CODE) {
          console.log(`🎉${taskLabel} 成功!`);
          resolve(true);
        } else {
          // 即使返回"已领取"等非0状态，我们也视为本轮完成，允许推进状态
          console.log(`🔴${taskLabel} 失败(或已完成): ${data}`);
          resolve(true); // 注意这里改为 true，防止因重复点击导致状态机卡死
        }
      } catch (e) {
        console.log(`🔴${taskLabel} 解析响应失败`);
        resolve(false);
      }
    });
  });
}

(async () => {
  // 1. 读取当前进度
  let progress = parseInt($persistentStore.read(CONFIG.READING_PROGRESS_KEY) || "0", 10);
  
  if (progress >= 3) {
    console.log("✅今日阅读广告任务已全部完成 (Progress: 3)");
    $notification.post(CONFIG.NOTIFICATION_TITLE, "✅任务已完成", "今日阅读广告已全部刷完");
    return;
  }

  // 2. 根据进度定位要执行的组
  const currentSessionKey = CONFIG.READING_SESSION_KEYS[progress];
  const currentSessionStr = $persistentStore.read(currentSessionKey);
  const currentGroupIndex = progress + 1;
  const currentGroupLabel = `任务3-组${currentGroupIndex}(广告·加点！)`;

  if (!currentSessionStr) {
    console.log(`🟡未找到组${currentGroupIndex}的会话，请先手动观看获取 (当前Progress: ${progress})`);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️无数据", `未找到组${currentGroupIndex}的会话，请先手动观看`);
    return;
  }

  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;

  // 3. 执行当前组
  console.log(`🚀当前进度: ${progress} -> 开始执行: ${currentGroupLabel}`);
  let allSuccess = true;
  for (let i = 0; i < CONFIG.TASK_3_EXECUTIONS; i++) {
    console.log(`🟡${currentGroupLabel}执行: 第 ${i + 1} 次`);
    const success = await runTask(currentSessionStr, currentGroupLabel);
    if (!success) allSuccess = false;
    if (i < CONFIG.TASK_3_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // 4. 推进状态机 (只要执行完毕，无论接口返回成功还是已领取，都推进状态)
  const newProgress = progress + 1;
  $persistentStore.write(String(newProgress), CONFIG.READING_PROGRESS_KEY);
  console.log(`✅${currentGroupLabel} 执行流程结束，进度推进至: ${newProgress}`);
  
  // Session 不做任何删除操作，保留供审计
  $notification.post(CONFIG.NOTIFICATION_TITLE, "✅单组执行完成", `${currentGroupLabel} 已完成，当前进度: ${newProgress}/3`);

})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
});
