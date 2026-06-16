/* 🥳 脚本功能: 自动观看 起点读书 阅读页广告 (任务3: 广告·加点！)
   执行策略: 从单键队列读取，原样重放，条件销毁，自动轮替
   核心特性: 防并发锁 / 深拷贝防污染 / 致命错误提前终止 / 队列管理 */

const CONFIG = {
  READING_SESSION_QUEUE_KEY: "qd_reading_session_queue", // 读取队列键
  TIMEOUT_KEY: "qd_timeout",
  NOTIFICATION_TITLE: "起点读书",
  TASK_3_EXECUTIONS: 2, 
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
  LOCK_KEY: "qd_reading_lock" 
};

let doneCalled = false;
function safeDone() { if (!doneCalled) { doneCalled = true; $done(); } }
function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function parsePositiveNumber(raw, fallback) { const n = Number(raw); return Number.isFinite(n) && n > 0 ? n : fallback; }
function cloneRequestOptions(options) { try { return JSON.parse(JSON.stringify(options)); } catch (e) { return { ...options }; } }

async function runTaskOnce(options, taskLabel, current, total) {
  const req = cloneRequestOptions(options);
  return new Promise((resolve) => {
    $httpClient.post(req, (error, response, data) => {
      if (error) { console.log(`🔴${taskLabel} 第 ${current}/${total} 次网络失败: ${error}`); return resolve({ ok: false, fatal: false, msg: error }); }
      const statusCode = response ? (response.status || response.statusCode) : 0;
      const httpOk = statusCode === 200;
      let ok = false, fatal = false, serverMsg = "";
      try {
        const obj = JSON.parse(data);
        if (obj?.Result === CONFIG.SUCCESS_RESULT_CODE && httpOk) {
          ok = true; serverMsg = obj.Msg || "接口调用成功";
          console.log(`🎉${taskLabel} 第 ${current}/${total} 次成功 | 服务端: ${serverMsg}`);
        } else {
          serverMsg = obj?.Msg || data || "未知错误";
          console.log(`🔴${taskLabel} 第 ${current}/${total} 次失败 | HTTP:${statusCode} | 服务端: ${serverMsg}`);
          if (serverMsg && (serverMsg.includes("上限") || serverMsg.includes("已领取") || serverMsg.includes("已完成") || serverMsg.includes("已存在"))) fatal = true;
        }
      } catch (e) { console.log(`🔴解析响应失败: ${e.message}`); }
      resolve({ ok, fatal, msg: serverMsg });
    });
  });
}

(async () => {
  if ($persistentStore.read(CONFIG.LOCK_KEY)) { console.log("🟡检测到已有任务运行中，为避免并发冲突，本次退出"); return safeDone(); }
  $persistentStore.write(String(Date.now()), CONFIG.LOCK_KEY);

  // 1. 读取队列
  let queueStr = $persistentStore.read(CONFIG.READING_SESSION_QUEUE_KEY) || "[]";
  let queue = [];
  try {
    queue = JSON.parse(queueStr);
    if (!Array.isArray(queue)) queue = [];
  } catch (e) {
    console.log("🔴队列数据损坏，已重置为空");
    $persistentStore.write("[]", CONFIG.READING_SESSION_QUEUE_KEY);
    return;
  }

  if (queue.length === 0) {
    console.log("🟡Session队列为空，请先去阅读页手动观看获取");
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️无数据", "未找到广告·加点！会话队列");
    return;
  }

  // 2. 取出队首任务
  const currentTask = queue[0];
  const currentGroupLabel = `任务3-队列首端(加点)`;
  
  let options;
  try {
    options = currentTask.session;
  } catch (e) {
    console.error(`🔴解析会话信息失败，将剔除该损坏项: ${e.message}`);
    queue.shift(); // 踢掉损坏的
    $persistentStore.write(JSON.stringify(queue), CONFIG.READING_SESSION_QUEUE_KEY);
    return;
  }

  const rawTimeout = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeoutSeconds = parsePositiveNumber(rawTimeout, CONFIG.DEFAULT_TIMEOUT_SECONDS);
  const timeoutMs = timeoutSeconds * 1000;

  // 3. 执行重放
  console.log(`🚀开始执行: ${currentGroupLabel} (剩余队列: ${queue.length}个)`);
  let success = 0, fail = 0, aborted = false;
  
  for (let i = 1; i <= CONFIG.TASK_3_EXECUTIONS; i++) {
    console.log(`🟡${currentGroupLabel} 执行: 第 ${i}/${CONFIG.TASK_3_EXECUTIONS} 次`);
    const res = await runTaskOnce(options, currentGroupLabel, i, CONFIG.TASK_3_EXECUTIONS);
    if (res.ok) success++;
    else { fail++; if (res.fatal) { aborted = true; break; } }
    if (i < CONFIG.TASK_3_EXECUTIONS && !aborted) await wait(timeoutMs);
  }

  // 4. 队列维护 (用完即焚)
  if (success > 0 || aborted) {
    queue.shift(); // 移除队首
    $persistentStore.write(JSON.stringify(queue), CONFIG.READING_SESSION_QUEUE_KEY);
    console.log(`🧹已销毁当前会话，队列剩余: ${queue.length} 个`);
  } else {
    console.log(`⚠️ 全部失败，会话保留在队首以便下次重试`);
  }

  let notifyMsg = `成功: ${success}/${CONFIG.TASK_3_EXECUTIONS}，失败: ${fail}`;
  if (success > 0 || aborted) notifyMsg += `\n✅ 会话已销毁，队列剩余: ${queue.length} 个`;
  else notifyMsg += `\n⚠️ 全部失败，会话保留在队首`;
  
  console.log("✅ 单组执行完毕\n" + notifyMsg);
  $notification.post(CONFIG.NOTIFICATION_TITLE, `${currentGroupLabel} 完毕`, notifyMsg);

})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $persistentStore.write("", CONFIG.LOCK_KEY);
  safeDone();
});
