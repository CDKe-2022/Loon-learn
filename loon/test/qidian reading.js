/* 
🥳 脚本功能: 自动观看 起点读书 广告 - 阅读页广告·加点！ (仅支持 Loon)
操作步骤: 阅读满1分钟后手动运行此脚本，或加入定时任务
默认间隔时间: 0.5s (可通过 qd_timeout 修改)
⚠️注意: Session 可能存在过期风险，如遇频繁失败请重新抓包获取 Session
*/

// --- 配置常量 ---
const CONFIG = {
  TASK_ID_KEY_3: "qd_reading_task_subids", 
  SESSION_KEY_3: "qd_session_3",           
  TIMEOUT_KEY: "qd_timeout",
  
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "广告·加点！任务执行完成",
  
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
};

// --- 检查必要数据 (修复：不在内部调用 $done，统一由 finally 调用) ---
function checkData() {
  const missingItems = [];
  if (!$persistentStore.read(CONFIG.SESSION_KEY_3)) missingItems.push("广告3会话");
  
  const subIdsStr = $persistentStore.read(CONFIG.TASK_ID_KEY_3);
  if (!subIdsStr) {
    missingItems.push("任务3 SubTaskId");
  } else {
    try {
      const arr = JSON.parse(subIdsStr);
      if (!Array.isArray(arr) || arr.length === 0) missingItems.push("任务3 SubTaskId (数组为空)");
    } catch(e) {
      missingItems.push("任务3 SubTaskId (解析失败)");
    }
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

/**
 * 替换请求体中的 taskId 参数
 * ⚠️ 重点排查区：如果抓包发现 finishWatch 接口实际使用的是 subTaskId 参数，
 * 请将此处的 "taskId" 替换为 "subTaskId"
 */
function replaceTaskIdInBody(body, newTaskId) {
  if (!body) return body;
  try {
    const params = new URLSearchParams(body);
    params.set("taskId", String(newTaskId)); // 核心替换点
    return params.toString();
  } catch (e) {
    return body.replace(/taskId=[^&]+/, `taskId=${newTaskId}`); // 核心替换点
  }
}

async function runTask(sessionStr, taskLabel, replaceTaskId = null) {
  if (!sessionStr) return false;
  let options;
  try {
    options = JSON.parse(sessionStr);
  } catch (e) { return false; }

  if (replaceTaskId && options.body) {
    const originalBody = options.body;
    options.body = replaceTaskIdInBody(options.body, replaceTaskId);
    // 🔍 关键排查日志：打印替换前后的 body，确认替换逻辑是否正确
    console.log(`🔄替换请求体: \n原始: ${originalBody} \n替换后: ${options.body}`);
  }

  return new Promise((resolve) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) { console.log(`🔴${taskLabel} 请求失败`); resolve(false); return; }
      try {
        const obj = JSON.parse(data);
        if (obj?.Result === CONFIG.SUCCESS_RESULT_CODE) {
          // 🔍 关键排查日志：打印完整返回体，确认是否真的成功发奖，还是被风控假成功
          console.log(`🎉${taskLabel} 接口返回成功! 完整数据: ${data}`);
          resolve(true);
        } else {
          console.log(`🔴${taskLabel} 接口返回失败: ${data}`);
          resolve(false);
        }
      } catch (e) { resolve(false); }
    });
  });
}

(async () => {
  if (!checkData()) return; // 如果校验失败，直接跳出，由 finally 执行 $done

  const session3Str = $persistentStore.read(CONFIG.SESSION_KEY_3);
  const subIdsStr = $persistentStore.read(CONFIG.TASK_ID_KEY_3);
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;
  console.log(`⏱️ 设置的间隔时间: ${timeout} 秒`);

  if (subIdsStr && session3Str) {
    try {
      let subIds = JSON.parse(subIdsStr);
      if (Array.isArray(subIds) && subIds.length > 0) {
        const totalTask3 = subIds.length;
        console.log(`🟡任务3(广告·加点！)待执行数量: ${totalTask3}`);
        
        let successCount = 0;
        
        for (let k = 0; k < totalTask3; k++) {
          const currentSubId = subIds[0]; 
          console.log(`🟡任务3执行: SubTaskId ${currentSubId} (${k + 1}/${totalTask3})`);
          
          const success = await runTask(session3Str, `任务3(ID:${currentSubId})`, currentSubId);
          
          if (success) {
            // 只有接口明确返回成功才消耗数组
            subIds.shift();
            $persistentStore.write(JSON.stringify(subIds), CONFIG.TASK_ID_KEY_3);
            successCount++;
          } else {
            // 一旦失败，可能未解锁或 Session 过期，停止继续执行
            console.log(`🟡任务3 SubTaskId ${currentSubId} 执行失败，停止执行剩余任务。`);
            break;
          }
          
          if (k < totalTask3 - 1) await wait(timeout * 1000);
        }
        
        if (successCount > 0) {
          console.log(`🎉任务3成功执行 ${successCount} 次！`);
        }
      }
    } catch (e) {
      console.log(`🔴任务3执行异常: ${e.message}`);
    }
  }

  console.log("✅ " + CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);

})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $done(); // 修复：统一在此处结束脚本，避免重复调用
});
