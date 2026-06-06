/* 
🥳 脚本功能: 自动观看 起点读书 广告 (仅支持 Loon)
*/

const CONFIG = {
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",
  READING_TASK_SUBIDS_KEY: "qd_reading_task_subids",
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  SESSION_KEY_3: "qd_session_3", // 读取模板
  TIMEOUT_KEY: "qd_timeout",
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "脚本执行完成",
  TASK_1_EXECUTIONS: 8,
  TASK_2_EXECUTIONS: 2,
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
};

function checkDataAndExit() {
  const missingItems = [];
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_1)) missingItems.push("任务1 ID");
  if (!$persistentStore.read(CONFIG.TASK_ID_KEY_2)) missingItems.push("任务2 ID");
  if (!$persistentStore.read(CONFIG.SESSION_KEY_1)) missingItems.push("广告1会话");
  if (!$persistentStore.read(CONFIG.SESSION_KEY_2)) missingItems.push("广告2会话");

  if (missingItems.length > 0) {
    const errorMsg = `⚠️缺少: ${missingItems.join(', ')}。${CONFIG.NOTIFICATION_SUBTITLE_MISSING_DATA}`;
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️数据缺失", errorMsg);
    $done(); 
    return false; 
  }
  
  if (!$persistentStore.read(CONFIG.READING_TASK_SUBIDS_KEY) || !$persistentStore.read(CONFIG.SESSION_KEY_3)) {
    console.log("🟡未获取到任务3(广告·加点！)信息，将跳过该任务");
  }
  return true; 
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTask(optionsStr, taskLabel) {
  if (!optionsStr) {
    console.log(`🟡跳过执行 ${taskLabel}: 会话信息为空`);
    return;
  }

  // 【修复重点】必须将字符串解析为对象，才能传给 $httpClient.post
  let options;
  try {
    options = JSON.parse(optionsStr);
  } catch (e) {
    console.error(`🔴解析 ${taskLabel} 会话信息失败: ${e.message}`);
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
      }
      resolve();
    });
  });
}

(async () => {
  if (!checkDataAndExit()) return;

  const session1 = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const session2 = $persistentStore.read(CONFIG.SESSION_KEY_2);
  const session3Template = $persistentStore.read(CONFIG.SESSION_KEY_3); // 读取模板
  const readingIdsStr = $persistentStore.read(CONFIG.READING_TASK_SUBIDS_KEY); // 读取ID数组
  
  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;

  // 任务1
  for (let i = 0; i < CONFIG.TASK_1_EXECUTIONS; i++) {
    console.log(`🟡任务1执行: 第 ${i + 1} 次`);
    await runTask(session1, "任务1");
    if (i < CONFIG.TASK_1_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // 任务2
  for (let j = 0; j < CONFIG.TASK_2_EXECUTIONS; j++) {
    console.log(`🟡任务2执行: 第 ${j + 1} 次`);
    await runTask(session2, "任务2");
    if (j < CONFIG.TASK_2_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // 任务3：动态替换法执行
  if (session3Template && readingIdsStr) {
    try {
      const readingIds = JSON.parse(readingIdsStr);
      let templateObj = JSON.parse(session3Template);
      
      for (let k = 0; k < readingIds.length; k++) {
        const currentId = readingIds[k];
        // 深拷贝模板，防止互相污染
        let currentOptions = JSON.parse(JSON.stringify(templateObj));
        
        // 核心：将请求体里的旧 taskId 替换为当前的 SubTaskId
        currentOptions.body = currentOptions.body.replace(/taskId=[^&]+/, `taskId=${currentId}`);
        
        console.log(`🟡任务3(广告·加点！)执行: 第 ${k + 1} 块 (ID: ${currentId})`);
        // 传入序列化后的字符串，runTask内部会自动解析
        await runTask(JSON.stringify(currentOptions), `任务3-第${k+1}块`);
        
        if (k < readingIds.length - 1) await wait(timeout * 1000);
      }
    } catch (e) {
      console.log(`🔴任务3执行出错: ${e.message}`);
    }
  }

  console.log("✅ " + CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "", CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);

})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
}); 
