/* 🥳 脚本功能: 自动观看 起点读书 阅读页广告 (任务3: 广告·加点！)
   执行策略: 单次只刷一组，原样重放不篡改Body(防签名校验失败)，刷完清空自动轮替
   默认间隔时间: 0.5s (可通过 qd_timeout 修改) */

const CONFIG = {
  // 读取 Cookie 脚本存下的 3 组 Session
  READING_SESSION_KEYS: [
    "qd_reading_session_1", 
    "qd_reading_session_2", 
    "qd_reading_session_3"
  ],
  TIMEOUT_KEY: "qd_timeout",
  NOTIFICATION_TITLE: "起点读书",
  
  // 每组执行次数。手动抓包看1次，脚本只需再刷2次。如果想刷3次改成3。
  TASK_3_EXECUTIONS: 2, 
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 核心执行函数：直接反序列化原样重放，绝不篡改
async function runTask(sessionStr, taskLabel) {
  let options;
  try {
    // 此时 options 包含了原始的 url, headers, body
    options = JSON.parse(sessionStr);
  } catch (e) {
    console.error(`🔴解析 ${taskLabel} 会话信息失败: ${e.message}`);
    return false;
  }
  
  return new Promise((resolve) => {
    // Loon/Surge 的 $httpClient.post 会直接使用 options 中的原样 Header 和 Body
    // 这保证了 Argus 签名等防伪字段不被破坏
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
          // 失败可能是因为签名过期、任务次数已满等
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
  // 1. 按顺序寻找当前需要刷的组
  let currentSessionStr = null;
  let currentSessionKey = "";
  let currentGroupLabel = "";

  for (let i = 0; i < CONFIG.READING_SESSION_KEYS.length; i++) {
    const sess = $persistentStore.read(CONFIG.READING_SESSION_KEYS[i]);
    if (sess) {
      currentSessionStr = sess;
      currentSessionKey = CONFIG.READING_SESSION_KEYS[i];
      currentGroupLabel = `任务3-组${i + 1}(广告·加点！)`;
      break; // 找到第一个存在的即停止寻找
    }
  }

  if (!currentSessionStr) {
    console.log("🟡未找到任何阅读广告会话，请先手动观看获取");
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️无数据", "未找到广告·加点！会话");
    return;
  }

  const timeoutSeconds = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeout = timeoutSeconds ? Number(timeoutSeconds) : CONFIG.DEFAULT_TIMEOUT_SECONDS;

  // 2. 开始执行当前组
  console.log(`🚀开始执行: ${currentGroupLabel}`);
  for (let i = 0; i < CONFIG.TASK_3_EXECUTIONS; i++) {
    console.log(`🟡${currentGroupLabel}执行: 第 ${i + 1} 次`);
    await runTask(currentSessionStr, currentGroupLabel);
    if (i < CONFIG.TASK_3_EXECUTIONS - 1) await wait(timeout * 1000);
  }

  // 3. 用完即焚：清空当前组的 Session，下次运行自动轮到下一组
  $persistentStore.write("", currentSessionKey);
  console.log(`🧹已清空 ${currentGroupLabel} 的会话数据，下次将自动执行下一组`);

  $notification.post(CONFIG.NOTIFICATION_TITLE, "✅单组执行完成", `${currentGroupLabel} 已完成`);
  
})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
}).finally(() => {
  $done();
});
