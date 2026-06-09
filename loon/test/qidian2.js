/* 🥳 脚本功能: 自动观看 起点读书 阅读页广告 (任务3: 广告·加点！)
   执行逻辑: 每次运行只按顺序(组1->组2->组3)刷一组，刷完自动清空该组会话，下次运行自动轮到下一组
   提示: 每组任务一般需要看3次广告，手动看1次后，脚本只需再刷2次即可 (可通过 TASK_3_EXECUTIONS 修改)
   默认间隔时间: 0.5s (可通过 qd_timeout 修改) */

const CONFIG = {
  SESSION_KEY_3_1: "qd_session_3_1",
  SESSION_KEY_3_2: "qd_session_3_2",
  SESSION_KEY_3_3: "qd_session_3_3",
  TIMEOUT_KEY: "qd_timeout",
  NOTIFICATION_TITLE: "起点读书",
  
  // 每组执行次数。因为手动看广告抓包时已经完成了1次，所以这里填2即可。如果你想刷3次也可以改成3。
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
          console.log(`🔴${taskLabel} 失败: ${data}`);
          resolve(false);
        }
      } catch (e) {
        console.log(`🔴${taskLabel} 解析响应失败`);
        resolve(false);
      }
    });
  });
}

(async () => {
  const session3_1 = $persistentStore.read(CONFIG.SESSION_KEY_3_1);
  const session3_2 = $persistentStore.read(CONFIG.SESSION_KEY_3_2);
  const session3_3 = $persistentStore.read(CONFIG.SESSION_KEY_3_3);

  // 按顺序确定本次要刷哪一组
  let currentSession = null;
  let currentSessionKey = "";
  let currentGroupLabel = "";

  if (session3_1) {
    currentSession = session3_1;
    currentSessionKey = CONFIG.SESSION_KEY_3_1;
    currentGroupLabel = "任务3-组1(广告·加点！)";
  } else if (session3_2) {
    currentSession = session3_2;
    currentSessionKey = CONFIG.SESSION_KEY_3_2;
    currentGroupLabel = "任务3-组2(广告·加点！)";
  } else if (session3_3) {
    currentSession = session3_3;
    currentSessionKey = CONFIG.SESSION_KEY_3_3;
    currentGroupLabel = "任务3-组3(广告·加点！)";
  } else {
    console.log("🟡未找到任何广告·加点！会话信息，请先手动观看获取");
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️无数据", "未找到广告·加点！会话");
    $done();
    return;
  }

  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;

  // --- 执行当前组 ---
  console.log(`🚀开始执行: ${currentGroupLabel}`);
  for (let i = 0; i < CONFIG.TASK_3_EXECUTIONS; i++) {
    console.log(`🟡${currentGroupLabel}执行: 第 ${i + 1} 次`);
    await runTask(currentSession, currentGroupLabel);
    if (i < CONFIG.TASK_3_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // --- 刷完后清空当前组的会话，以便下次运行时自动进入下一组 ---
  $persistentStore.write("", currentSessionKey);
  console.log(`🧹已清空 ${currentGroupLabel} 的会话数据，下次将自动执行下一组`);

  $notification.post(CONFIG.NOTIFICATION_TITLE, "✅单组执行完成", `${currentGroupLabel} 已完成`);
  
})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
});
