/* 
🥳 脚本功能: 自动观看 起点读书 广告 (仅支持 Loon)
任务1: 福利中心 --> 每日视频福利
任务2: 福利中心 --> 限时彩蛋 --> 额外看三次小视频奖励
任务3: 福利中心/阅读页 --> 广告·加点！ (自动遍历剩余 SubTaskId，执行成功自动消耗)
默认间隔时间: 0.5s (可通过 qd_timeout 修改)
*/

// --- 配置常量 ---
const CONFIG = {
  // 存储键名 (与前面脚本严格对齐)
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  TASK_ID_KEY_3: "qd_reading_task_subids", // 对应阅读页任务ID数组
  
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  SESSION_KEY_3: "qd_session_3",           // 对应阅读页任务基础会话
  
  TIMEOUT_KEY: "qd_timeout",
  
  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "脚本执行完成",
  
  // 循环次数
  TASK_1_EXECUTIONS: 8, 
  TASK_2_EXECUTIONS: 2, 
  // 移除了 TASK_3_EXECUTIONS，改为根据数组长度动态执行
  
  // 默认超时时间 (秒)
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  
  // 成功状态码
  SUCCESS_RESULT_CODE: 0,
};

// --- 检查必要数据并退出 ---
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
    $done(); 
    return false; 
  }
  
  // 可选数据检查
  const subIdsStr = $persistentStore.read(CONFIG.TASK_ID_KEY_3);
  const session3 = $persistentStore.read(CONFIG.SESSION_KEY_3);
  if (!subIdsStr || !session3) {
    console.log("🟡未获取到任务3(广告·加点！)信息，将跳过该任务");
  } else {
    try {
      const arr = JSON.parse(subIdsStr);
      if (!Array.isArray(arr) || arr.length === 0) {
        console.log("🟡任务3 SubTaskId 数组为空，今日任务可能已全部完成");
      } else {
        console.log(`🟡任务3待执行数量: ${arr.length}`);
      }
    } catch(e) {
      console.log("🟡任务3 SubTaskId 数组解析失败");
    }
  }
  
  return true; 
}

// --- 延时函数 ---
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 安全替换请求体中的 taskId 参数
 * @param {string} body - 原始请求体
 * @param {string} newTaskId - 要替换的新 taskId
 * @returns {string} - 替换后的请求体
 */
function replaceTaskIdInBody(body, newTaskId) {
  if (!body) return body;
  try {
    const params = new URLSearchParams(body);
    params.set("taskId", String(newTaskId));
    return params.toString();
  } catch (e) {
    return body.replace(/taskId=[^&]+/, `taskId=${newTaskId}`);
  }
}

// --- 核心任务执行函数 ---
/**
 * @param {string} sessionStr - 会话 JSON 字符串
 * @param {string} taskLabel - 任务标签
 * @param {string|null} replaceTaskId - 如果提供，将替换请求体中的 taskId
 * @returns {boolean} - 是否执行成功
 */
async function runTask(sessionStr, taskLabel, replaceTaskId = null) {
  if (!sessionStr) {
    console.log(`🟡跳过执行 ${taskLabel}: 会话信息为空`);
    return false;
  }

  let options;
  try {
    options = JSON.parse(sessionStr);
  } catch (e) {
    console.error(`🔴解析 ${taskLabel} 会话信息失败: ${e.message}`);
    return false; 
  }

  // 核心修改：动态替换请求体中的 taskId
  if (replaceTaskId && options.body) {
    options.body = replaceTaskIdInBody(options.body, replaceTaskId);
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
        console.log(`🔴${taskLabel} 解析响应失败: ${e.message}`);
        resolve(false);
      }
    });
  });
}

// --- 主执行逻辑 ---
(async () => {
  if (!checkDataAndExit()) {
    return;
  }

  const session = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const session2 = $persistentStore.read(CONFIG.SESSION_KEY_2);
  const session3 = $persistentStore.read(CONFIG.SESSION_KEY_3);
  
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;
  console.log(`⏱️ 设置的间隔时间: ${timeout} 秒`);

  // 1. 执行任务1 (固定 8 次)
  for (let i = 0; i < CONFIG.TASK_1_EXECUTIONS; i++) {
    console.log(`🟡任务1执行: 第 ${i + 1} 次`);
    await runTask(session, "任务1");
    if (i < CONFIG.TASK_1_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // 2. 执行任务2 (固定 2 次)
  for (let j = 0; j < CONFIG.TASK_2_EXECUTIONS; j++) {
    console.log(`🟡任务2执行: 第 ${j + 1} 次`);
    await runTask(session2, "任务2");
    if (j < CONFIG.TASK_2_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // 3. 执行任务3 (动态遍历数组，成功后自动消耗)
  const subIdsStr = $persistentStore.read(CONFIG.TASK_ID_KEY_3);
  if (subIdsStr && session3) {
    try {
      let subIds = JSON.parse(subIdsStr);
      if (Array.isArray(subIds) && subIds.length > 0) {
        const totalTask3 = subIds.length;
        console.log(`🟡任务3(广告·加点！)需执行: ${totalTask3} 次`);
        
        for (let k = 0; k < totalTask3; k++) {
          // 始终取数组当前的第一个 ID
          const currentSubId = subIds[0]; 
          console.log(`🟡任务3执行: SubTaskId ${currentSubId} (${k + 1}/${totalTask3})`);
          
          // 传入 currentSubId 替换 session 中的 taskId
          const success = await runTask(session3, `任务3(ID:${currentSubId})`, currentSubId);
          
          if (success) {
            // 执行成功后，从内存数组中移除已完成的 ID
            subIds.shift();
            // 实时更新持久化存储中的数组，防止脚本中途中断导致重复执行
            $persistentStore.write(JSON.stringify(subIds), CONFIG.TASK_ID_KEY_3);
          }
          
          if (k < totalTask3 - 1) await wait(timeout * 1000);
        }
      }
    } catch (e) {
      console.log(`🔴任务3执行异常: ${e.message}`);
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
