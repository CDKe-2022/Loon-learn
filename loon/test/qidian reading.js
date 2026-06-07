/* 
🥳 脚本功能: 自动观看 起点读书 广告 - 阅读页广告·加点！ (仅支持 Loon)
操作步骤: 阅读满1分钟后手动运行此脚本，或加入定时任务
默认间隔时间: 0.5s (可通过 qd_timeout 修改，最低0.5s)
⚠️注意: Session 可能存在过期风险，如遇频繁失败请重新抓包获取 Session
*/

// --- 配置常量 ---
const CONFIG = {
  SESSIONS_MAP_KEY: "qd_reading_sessions",
  TIMEOUT_KEY: "qd_timeout",
  
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "广告·加点！任务执行完成",
  
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  MIN_TIMEOUT_SECONDS: 0.5,   
  MAX_TIMEOUT_SECONDS: 60,
  SUCCESS_RESULT_CODE: 0,
  MAX_CONSECUTIVE_FAILS: 3,
  TASK_3_MAX_EXECUTIONS: 3, // 🌟新增：每个 SubTaskId 最多执行次数 (2-3次)
};

// --- 辅助函数 ---
function isValidSession(sessionObj) {
  return !!(sessionObj && typeof sessionObj === "object" && typeof sessionObj.url === "string" && sessionObj.url);
}

function checkData() {
  const missingItems = [];
  const sessionsStr = $persistentStore.read(CONFIG.SESSIONS_MAP_KEY);
  
  if (!sessionsStr) {
    missingItems.push("Session字典(无数据)");
  } else {
    try {
      const map = JSON.parse(sessionsStr);
      if (!map || typeof map !== "object" || Array.isArray(map)) {
        missingItems.push("Session字典(格式错)");
      } else {
        const hasValidSession = Object.values(map).some(v => isValidSession(v?.session));
        if (!hasValidSession) missingItems.push("Session字典(无有效会话)");
      }
    } catch (e) { missingItems.push("Session字典(解析失败)"); }
  }

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

async function runTask(sessionObj, taskLabel) {
  if (!isValidSession(sessionObj)) {
    return "fail_data";
  }

  const taskIdLog = sessionObj.taskId ? `[${sessionObj.taskId}]` : "";

  return new Promise((resolve) => {
    $httpClient.post(sessionObj, (error, response, data) => {
      if (error) {
        console.log(`🔴${taskLabel}${taskIdLog} 网络异常: ${String(error).slice(0, 100)}`);
        return resolve("fail_network"); 
      }
      try {
        const obj = JSON.parse(data);
        const result = Number(obj?.Result);
        const message = obj?.Message || "";
        
        if (result === CONFIG.SUCCESS_RESULT_CODE) {
          if (/未解锁|阅读不足|条件未满足/.test(message)) {
            console.log(`🔴${taskLabel}${taskIdLog} 假成功拦截: ${message}`);
            return resolve("fail_not_ready");
          }
          console.log(`🎉${taskLabel}${taskIdLog} 成功!`);
          return resolve("success");
        } 
        
        if (/已完成|已领取|次数已达上限/.test(message)) {
          console.log(`🟡${taskLabel}${taskIdLog} 已完成或达上限: ${message}`);
          return resolve("completed");
        }

        const isAuthFail = /登录失效|token失效|session过期|用户未登录|签名错误|参数校验失败|请求非法/i.test(message);
        if (isAuthFail) {
          console.log(`🔴${taskLabel}${taskIdLog} 鉴权失效(需重新抓包): ${message}`);
          return resolve("fail_auth");
        }

        const isRiskControl = /风控|访问过于频繁/i.test(message);
        if (isRiskControl) {
          console.log(`🟠${taskLabel}${taskIdLog} 触发风控/频繁(保留Session稍后重试): ${message}`);
          return resolve("fail_risk");
        }

        const isFatalBusiness = /任务不存在|参数错误/i.test(message);
        if (isFatalBusiness) {
          console.log(`🔴${taskLabel}${taskIdLog} 致命业务错误(清理Session): ${message}`);
          return resolve("fail_fatal");
        }

        if (/阅读不足|未解锁/.test(message)) {
          console.log(`🔴${taskLabel}${taskIdLog} 条件未满足(保留重试): ${message}`);
          return resolve("fail_not_ready");
        }

        console.log(`🔴${taskLabel}${taskIdLog} 其他业务拒绝: ${String(data).slice(0, 200)}`);
        return resolve("fail_other");
        
      } catch (e) { 
        const httpStatus = response?.status || "?";
        const preview = String(data).slice(0, 100);
        console.log(`🔴${taskLabel}${taskIdLog} 响应解析异常(HTTP ${httpStatus}): ${preview}`);
        if (response?.status >= 500) {
          return resolve("fail_parse_server"); 
        }
        return resolve("fail_parse"); 
      }
    });
  });
}

// --- 主执行逻辑 ---
!(async () => {
  if (!checkData()) return;

  const sessionsStr = $persistentStore.read(CONFIG.SESSIONS_MAP_KEY);
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  
  const parsedTimeout = Number(timeoutSeconds);
  const timeout = Number.isFinite(parsedTimeout) && parsedTimeout >= CONFIG.MIN_TIMEOUT_SECONDS && parsedTimeout <= CONFIG.MAX_TIMEOUT_SECONDS
    ? parsedTimeout 
    : CONFIG.DEFAULT_TIMEOUT_SECONDS;
  console.log(`⏱️ 设置的间隔时间: ${timeout} 秒 (含随机抖动)`);

  let sessionsMap = {};
  try { sessionsMap = JSON.parse(sessionsStr || "{}"); } catch (e) { console.log("🔴Session字典解析异常"); return; }
  if (!sessionsMap || typeof sessionsMap !== "object" || Array.isArray(sessionsMap)) sessionsMap = {};

  let dirtyCount = 0;
  for (const id in sessionsMap) {
    if (!isValidSession(sessionsMap[id]?.session)) {
      delete sessionsMap[id];
      dirtyCount++;
    }
  }
  if (dirtyCount > 0) console.log(`🧹 启动清洗: 清理了 ${dirtyCount} 条无效Session记录`);

  const stats = { success: 0, completed: 0, fail: 0, skipped: 0 };
  let globalFailCount = 0;
  let riskCount = 0; 
  let aborted = false;
  
  const subIds = Object.keys(sessionsMap);
  const totalTasks = subIds.length;
  
  console.log(`🟡任务3(广告·加点！)待执行ID数量: ${totalTasks}`);

  // 外层循环：遍历不同的 SubTaskId
  for (let i = 0; i < subIds.length; i++) {
    const subId = subIds[i];
    
    if (!subId || subId === "undefined" || subId === "null") {
      delete sessionsMap[subId];
      stats.skipped++;
      continue; 
    }

    const sessionObj = sessionsMap[subId]?.session;
    const taskLabel = `任务3(ID:${subId})`;
    
    if (!sessionObj) {
        console.log(`⚠️${taskLabel} Session节点缺失，跳过并清理`);
        delete sessionsMap[subId];
        stats.skipped++;
        continue;
    }
    
    console.log(`🟡开始执行 ${taskLabel} (最多${CONFIG.TASK_3_MAX_EXECUTIONS}次)`);

    let localSuccess = 0;
    let localCompleted = 0;
    let localFail = 0;
    let shouldDeleteSession = false;

    // 🌟内层循环：对同一个 SubTaskId 请求多次
    for (let j = 0; j < CONFIG.TASK_3_MAX_EXECUTIONS; j++) {
      const currentTaskLabel = `${taskLabel}[第${j + 1}次]`;
      const status = await runTask(sessionObj, currentTaskLabel);
      
      let currentBreak = false;

      switch (status) {
        case "success":
          localSuccess++;
          globalFailCount = 0;
          riskCount = 0;
          break;
        case "completed":
          localCompleted++;
          shouldDeleteSession = true; // 达上限，必须清理
          currentBreak = true;
          break;
        case "fail_auth":
        case "fail_fatal":
          localFail++;
          shouldDeleteSession = true; // 鉴权失效/致命错误，必须清理
          currentBreak = true;
          break;
        case "fail_data":
          stats.skipped++;
          shouldDeleteSession = true;
          currentBreak = true;
          break;
        case "fail_risk":
          localFail++;
          riskCount++;
          currentBreak = true; // 风控直接停当前ID的后续尝试
          break;
        case "fail_network":
          localFail++;
          globalFailCount++;
          break;
        case "fail_parse_server":
          localFail++;
          globalFailCount++;
          break;
        case "fail_parse":
        case "fail_not_ready":
        case "fail_other":
          localFail++;
          globalFailCount = 0; // 业务拒绝重置网络熔断
          break;
      }

      // 全局熔断判定
      if (globalFailCount >= CONFIG.MAX_CONSECUTIVE_FAILS) {
        console.log("🔴连续遭遇鉴权、网络或服务端异常，触发全局熔断");
        aborted = true;
        currentBreak = true;
      }
      if (riskCount >= CONFIG.MAX_CONSECUTIVE_FAILS) {
        console.log("🟠连续触发风控限制，触发全局熔断");
        aborted = true;
        currentBreak = true;
      }

      if (currentBreak) {
        break;
      }

      // 内层延迟
      if (j < CONFIG.TASK_3_MAX_EXECUTIONS - 1) {
        const delay = timeout * 1000 + Math.floor(Math.random() * 300);
        await wait(delay);
      }
    }

    // 内层循环结束，汇总统计
    stats.success += localSuccess;
    stats.completed += localCompleted;
    stats.fail += localFail;

    // 清理逻辑：只要成功过至少1次，或者标记了需清理，就删Session
    if (localSuccess > 0 || shouldDeleteSession) {
      delete sessionsMap[subId];
    }

    if (aborted) {
      break;
    }

    // 外层延迟 (不同的 SubTaskId 之间)
    if (i < subIds.length - 1) {
      const delay = timeout * 1000 + Math.floor(Math.random() * 300);
      await wait(delay);
    }
  }

  const newSessionsStr = JSON.stringify(sessionsMap);
  const sessionsSaved = $persistentStore.write(newSessionsStr, CONFIG.SESSIONS_MAP_KEY);
  if (!sessionsSaved) {
    console.log("🔴严重错误: Session 字典更新失败，数据可能未同步");
  }

  const formatStats = (stats, total, isAborted) => {
    const requested = stats.success + stats.completed + stats.fail;
    if (requested === 0 && stats.skipped === 0) return `未执行 (共${total}个ID)`;
    
    let parts = [];
    if (stats.success > 0) parts.push(`成功${stats.success}`);
    if (stats.completed > 0) parts.push(`已达上限${stats.completed}`);
    if (stats.fail > 0) parts.push(`失败${stats.fail}`);
    if (stats.skipped > 0) parts.push(`异常跳过${stats.skipped}`);
    
    let resultStr = parts.join(' ') + ` (请求${requested}次/共${total}个ID)`;
    if (isAborted) resultStr += " [已熔断]";
    return resultStr;
  };

  const finalMsg = `${CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE}\n任务3: ${formatStats(stats, totalTasks, aborted)}`;
  console.log("✅ " + finalMsg);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", finalMsg);

})().catch((e) => {
  console.log("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
});
