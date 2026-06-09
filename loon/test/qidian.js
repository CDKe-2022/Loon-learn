/* 🥳 脚本功能: 自动观看 起点读书 广告 (仅支持 Loon)
   任务1: 福利中心 --> 每日视频福利 --> 手动看一个视频
   任务2: 福利中心 --> 限时彩蛋 --> 额外看三次小视频奖励 --> 手动看一个视频
   任务3: 福利中心/阅读页 --> 广告·加点！ --> 手动看一个视频 (新增)
   默认执行次数: 8 次 / 2 次 / 3 次
   默认间隔时间: 0.5s (可通过 qd_timeout 修改) */

// --- 配置常量 ---
const CONFIG = {
  // 存储键名
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  TASK_ID_KEY_3_1: "qd_reading_task_subid_1", // 广告·加点！子任务1
  TASK_ID_KEY_3_2: "qd_reading_task_subid_2", // 广告·加点！子任务2
  TASK_ID_KEY_3_3: "qd_reading_task_subid_3", // 广告·加点！子任务3

  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  SESSION_KEY_3_1: "qd_session_3_1", // 广告·加点！子任务1会话
  SESSION_KEY_3_2: "qd_session_3_2", // 广告·加点！子任务2会话
  SESSION_KEY_3_3: "qd_session_3_3", // 广告·加点！子任务3会话

  TIMEOUT_KEY: "qd_timeout",

  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "脚本执行完成",

  // 循环次数
  TASK_1_EXECUTIONS: 8, // 对应原代码 8 次
  TASK_2_EXECUTIONS: 2, // 对应原代码 2 次
  TASK_3_EXECUTIONS: 3, // 新增：广告·加点！一般需要看3次

  // 默认超时时间 (秒)
  DEFAULT_TIMEOUT_SECONDS: 0.5,

  // 成功状态码
  SUCCESS_RESULT_CODE: 0,
};

// --- 检查必要数据并退出 (任务1和2为必须，任务3为可选) ---
function checkDataAndExit() {
  const missingItems = [];

  // 必须存在的数据
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_1)) missingItems.push("任务1 ID");
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_2)) missingItems.push("任务2 ID");
  if (!$persistentStore.read(CONFIG.SESSION_KEY_1)) missingItems.push("广告1会话");
  if (!$persistentStore.read(CONFIG.SESSION_KEY_2)) missingItems.push("广告2会话");

  if (missingItems.length > 0) {
    const errorMsg = `⚠️缺少: ${missingItems.join(', ')}。${CONFIG.NOTIFICATION_SUBTITLE_MISSING_DATA}`;
    console.log(errorMsg);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️数据缺失", errorMsg);
    $done(); // 退出脚本
    return false;
  }

  // 可选数据检查（仅打印日志，不阻断脚本）
  if (
    !$persistentStore.read(CONFIG.TASK_ID_KEY_3_1) ||
    !$persistentStore.read(CONFIG.TASK_ID_KEY_3_2) ||
    !$persistentStore.read(CONFIG.TASK_ID_KEY_3_3) ||
    !$persistentStore.read(CONFIG.SESSION_KEY_3_1) ||
    !$persistentStore.read(CONFIG.SESSION_KEY_3_2) ||
    !$persistentStore.read(CONFIG.SESSION_KEY_3_3)
  ) {
    console.log("🟡未获取到任务3(广告·加点！)完整信息，将跳过该任务");
  }

  return true;
}

// --- 延时函数 ---
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- 核心任务执行函数 ---
async function runTask(sessionStr, taskLabel) {
  if (!sessionStr) {
    console.log(`🟡跳过执行 ${taskLabel}: 会话信息为空`);
    return;
  }
  let options;
  try {
    options = JSON.parse(sessionStr);
  } catch (e) {
    console.error(`🔴解析 ${taskLabel} 会话信息失败: ${e.message}`);
    console.log(`会话数据: ${sessionStr}`);
    return;
  }
  return new Promise((resolve) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) {
        console.log(`🔴${taskLabel} 请求失败: ${error}`);
        resolve();
        return;
      }
      try {
        const obj = JSON.parse(data);
        if (obj?.Result === CONFIG.SUCCESS_RESULT_CODE) {
          console.log(`🎉${taskLabel} 成功!`);
        } else {
          console.log(`🔴${taskLabel} 失败: ${data}`);
        }
      } catch (e) {
        console.log(`🔴${taskLabel} 解析响应失败: ${e.message}`);
        console.log(`响应数据: ${data}`);
      }
      resolve();
    });
  });
}

// --- 主执行逻辑 ---
(async () => {
  // 1. 检查数据，如果失败则 $done() 已在 checkDataAndExit 中调用，脚本会退出
  if (!checkDataAndExit()) {
    return;
  }

  // 2. 读取配置和数据
  const session = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const session2 = $persistentStore.read(CONFIG.SESSION_KEY_2);
  const session3_1 = $persistentStore.read(CONFIG.SESSION_KEY_3_1);
  const session3_2 = $persistentStore.read(CONFIG.SESSION_KEY_3_2);
  const session3_3 = $persistentStore.read(CONFIG.SESSION_KEY_3_3);

  // 读取超时时间，使用默认值
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;
  console.log(`⏱️ 设置的间隔时间: ${timeout} 秒`);

  // 3. 执行任务循环
  // 任务1 执行 N 次
  for (let i = 0; i < CONFIG.TASK_1_EXECUTIONS; i++) {
    console.log(`🟡任务1执行: 第 ${i + 1} 次`);
    await runTask(session, "任务1");
    if (i < CONFIG.TASK_1_EXECUTIONS - 1) {
      await wait(timeout * 1000);
    }
  }

  // 任务2 执行 M 次
  for (let j = 0; j < CONFIG.TASK_2_EXECUTIONS; j++) {
    console.log(`🟡任务2执行: 第 ${j + 1} 次`);
    await runTask(session2, "任务2");
    if (j < CONFIG.TASK_2_EXECUTIONS - 1) {
      await wait(timeout * 1000);
    }
  }

  // 任务3 执行 K 次 (新增)，但每次用不同子任务的会话
  for (let k = 0; k < CONFIG.TASK_3_EXECUTIONS; k++) {
    let sessionStr;
    let label;

    // 第 1 次用 3-1，第 2 次用 3-2，第 3 次用 3-3
    if (k === 0) {
      sessionStr = session3_1;
      label = "任务3-1(广告·加点！)";
    } else if (k === 1) {
      sessionStr = session3_2;
      label = "任务3-2(广告·加点！)";
    } else if (k === 2) {
      sessionStr = session3_3;
      label = "任务3-3(广告·加点！)";
    } else {
      // 理论上不会走到这里
      console.log(`🟡任务3索引异常: ${k}`);
      break;
    }

    console.log(`🟡${label}执行: 第 ${k + 1} 次`);
    await runTask(sessionStr, label);
    if (k < CONFIG.TASK_3_EXECUTIONS - 1) {
      await wait(timeout * 1000);
    }
  }

  // 4. 执行完成通知
  console.log("✅ " + CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "脚本异常", "请检查日志");
}).finally(() => {
  $done();
});
