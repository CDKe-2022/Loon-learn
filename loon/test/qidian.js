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
  MAX_TIMEOUT_SECONDS: 60, // Timeout 上限保护
  SUCCESS_RESULT_CODE: 0,
  MAX_CONSECUTIVE_FAILS: 3, 
};

// --- 辅助函数：严格的 Session 预检 ---
function isValidSession(str) {
  if (!str) return false;
  try {
    const obj = JSON.parse(str);
    return !!(obj && typeof obj === "object" && obj.url);
  } catch (e) {
    return false;
  }
}

// --- 检查必要数据并退出 ---
function checkDataAndExit() {
  const missingItems = [];
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_1)) missingItems.push("任务1 ID");
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_2)) missingItems.push("任务2 ID");
  
  const s1 = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const s2 = $persistentStore.read(CONFIG.SESSION_KEY_2);
  if (!isValidSession(s1)) missingItems.push("广告1会话(无效)");
  if (!isValidSession(s2)) missingItems.push("广告2会话(无效)");

  if (missingItems.length > 0) {
    const errorMsg = `⚠️缺少: ${missingItems.join(', ')}。${CONFIG.NOTIFICATION_SUBTITLE_MISSING_DATA}`;
    console.log(errorMsg);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️数据缺失", errorMsg);
    return false; 
  }
  return true; 
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 防泄漏日志 + 双重 URL 兜底校验
async function runTask(sessionStr, taskLabel) {
  let options;
  try {
    options = JSON.parse(sessionStr);
  } catch (e) {
    console.log(`🔴${taskLabel} Session解析失败`);
    return "fail";
  }

  if (!options?.url) {
    console.log(`🔴${taskLabel} Session缺少URL`);
    return "fail";
  }

  const taskIdLog = options.taskId ? `[${options.taskId}]` : "";

  return new Promise((resolve) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) {
        console.log(`🔴${taskLabel}${taskIdLog} 请求异常: ${String(error).slice(0, 100)}`);
        resolve("fail"); 
        return;
      }
      try {
        const obj = JSON.parse(data);
        const result = Number(obj?.Result);
        const message = obj?.Message || "";
        
        if (result === CONFIG.SUCCESS_RESULT_CODE) {
          console.log(`🎉${taskLabel}${taskIdLog} 成功!`);
          resolve("success");
        } else if (/已完成|已领取|次数已达上限/.test(message)) {
          console.log(`🟡${taskLabel}${taskIdLog} 已完成或达上限: ${message}`);
          resolve("completed");
        } else {
          console.log(`🔴${taskLabel}${taskIdLog} 失败: ${String(data).slice(0, 200)}`);
          resolve("fail");
        }
      } catch (e) { 
        const preview = String(data).slice(0, 200);
        console.log(`🔴${taskLabel}${taskIdLog} 响应解析异常: ${preview}`);
        resolve("fail"); 
      }
    });
  });
}

// 主执行逻辑
(async () => {
  if (!checkDataAndExit()) return;

  const session1 = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const session2 = $persistentStore.read(CONFIG.SESSION_KEY_2);
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  
  // 修改点：只改了这里的条件，从 >= 0 改为 > 0
  const parsedTimeout = Number(timeoutSeconds);
  const timeout = Number.isFinite(parsedTimeout) && parsedTimeout > 0 && parsedTimeout <= CONFIG.MAX_TIMEOUT_SECONDS
    ? parsedTimeout 
    : CONFIG.DEFAULT_TIMEOUT_SECONDS;
  console.log(`⏱️ 设置的间隔时间: ${timeout} 秒`);

  const stats1 = { success: 0, completed: 0, fail: 0 };
  let failCount1 = 0;
  const maxFails1 = Math.min(CONFIG.MAX_CONSECUTIVE_FAILS, CONFIG.TASK_1_EXECUTIONS);

  for (let i = 0; i < CONFIG.TASK_1_EXECUTIONS; i++) {
    console.log(`🟡任务1执行: 第 ${i + 1} 次`);
    const status = await runTask(session1, "任务1");
    
    if (status === "success") {
      stats1.success++;
      failCount1 = 0;
    } else if (status === "completed") {
      stats1.completed++;
      break;
    } else {
      stats1.fail++;
      failCount1++;
    }

    if (failCount1 >= maxFails1) {
      console.log("🔴连续失败达到上限，触发熔断机制，停止执行任务1");
      break;
    }
    if (i < CONFIG.TASK_1_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  const stats2 = { success: 0, completed: 0, fail: 0 };
  let failCount2 = 0;
  const maxFails2 = Math.min(CONFIG.MAX_CONSECUTIVE_FAILS, CONFIG.TASK_2_EXECUTIONS);

  for (let j = 0; j < CONFIG.TASK_2_EXECUTIONS; j++) {
    console.log(`🟡任务2执行: 第 ${j + 1} 次`);
    const status = await runTask(session2, "任务2");
    
    if (status === "success") {
      stats2.success++;
      failCount2 = 0;
    } else if (status === "completed") {
      stats2.completed++;
      break;
    } else {
      stats2.fail++;
      failCount2++;
    }

    if (failCount2 >= maxFails2) {
      console.log("🔴连续失败达到上限，触发熔断机制，停止执行任务2");
      break;
    }
    if (j < CONFIG.TASK_2_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  const formatStats = (stats, total) => {
    const executed = stats.success + stats.completed + stats.fail;
    if (executed === 0) return `未执行 (共${total}次)`;
    
    let parts = [];
    if (stats.success > 0) parts.push(`成功${stats.success}`);
    if (stats.completed > 0) parts.push(`跳过${stats.completed}`);
    if (stats.fail > 0) parts.push(`失败${stats.fail}`);
    
    return parts.join(' ') + ` (执行${executed}/共${total}次)`;
  };

  const finalMsg = `${CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE}\n任务1: ${formatStats(stats1, CONFIG.TASK_1_EXECUTIONS)}\n任务2: ${formatStats(stats2, CONFIG.TASK_2_EXECUTIONS)}`;
  console.log("✅ " + finalMsg);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", finalMsg);

})().catch((e) => {
  console.log("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
});
