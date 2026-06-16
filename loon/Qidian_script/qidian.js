/*
🥳 脚本功能: 自动观看 起点读书 常规广告及阅读加点 (任务1、2、3全自动化)

任务1: 福利中心 --> 每日视频福利 (默认 8 次)
任务2: 福利中心 --> 限时彩蛋 (默认 2 次)
任务3: 阅读页 --> 广告·加点 (动态读取 N 个 Session，重放后自动清理防重复)

默认间隔时间:
- 0.5 秒 (可通过 qd_timeout 修改，单位：秒)
*/

// --- 配置常量 ---
const CONFIG = {
  // 任务1 & 任务2 存储键名
  SESSION_KEY_1: "qd_session",
  SESSION_KEY_2: "qd_session_2",
  TIMEOUT_KEY: "qd_timeout",

  // 任务3 (阅读·加点) 动态存储键名
  READING_TASK_IDS_KEY: "qd_reading_task_subids", // 存储的是逗号拼接的ID串
  READING_SESSION_PREFIX: "qd_reading_session_",  // 动态拼接为 qd_reading_session_1, _2 ...

  // 通知配置
  NOTIFICATION_TITLE: "起点读书",
  NOTIFICATION_SUBTITLE_MISSING_DATA: "信息不全! 请通过重写获取信息",
  NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE: "广告任务执行完成",

  // 循环次数
  TASK_1_EXECUTIONS: 8,
  TASK_2_EXECUTIONS: 2,

  // 默认超时时间(秒)
  DEFAULT_TIMEOUT_SECONDS: 0.5,

  // 成功状态码
  SUCCESS_RESULT_CODE: 0,
};

// 防止重复 $done
let doneCalled = false;
function safeDone() {
  if (!doneCalled) {
    doneCalled = true;
    $done();
  }
}

// --- 工具函数 ---
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePositiveNumber(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function cloneRequestOptions(options) {
  // 核心防坑：避免请求对象在多次调用中被底层 HTTP 库意外污染 (如篡改 Headers)
  return {
    ...options,
    headers: options && options.headers ? { ...options.headers } : undefined,
  };
}

function notify(subtitle, message) {
  $notification.post(CONFIG.NOTIFICATION_TITLE, subtitle || "", message || "");
}

// --- 读取并校验初始化数据 ---
function readInitData() {
  const rawSession1 = $persistentStore.read(CONFIG.SESSION_KEY_1);
  const rawSession2 = $persistentStore.read(CONFIG.SESSION_KEY_2);

  const missingItems = [];
  if (!rawSession1) missingItems.push("任务1会话");
  if (!rawSession2) missingItems.push("任务2会话");

  if (missingItems.length > 0) {
    const errorMsg = `⚠️缺少: ${missingItems.join(", ")}。${CONFIG.NOTIFICATION_SUBTITLE_MISSING_DATA}`;
    console.log(errorMsg);
    notify("⚠️数据缺失", errorMsg);
    return null;
  }

  let session1, session2;
  try {
    session1 = JSON.parse(rawSession1);
  } catch (e) {
    const msg = `🔴解析任务1会话失败: ${e.message}`;
    console.log(msg);
    notify("⚠️会话解析失败", msg);
    return null;
  }

  try {
    session2 = JSON.parse(rawSession2);
  } catch (e) {
    const msg = `🔴解析任务2会话失败: ${e.message}`;
    console.log(msg);
    notify("⚠️会话解析失败", msg);
    return null;
  }

  // 读取任务3的动态 Session (如果有的话)
  const readingIdsStr = $persistentStore.read(CONFIG.READING_TASK_IDS_KEY) || "";
  const readingIds = readingIdsStr ? readingIdsStr.split(',') : [];
  const readingSessions = [];
  
  for (let i = 0; i < readingIds.length; i++) {
    const sessionKey = `${CONFIG.READING_SESSION_PREFIX}${i + 1}`;
    const rawReadingSession = $persistentStore.read(sessionKey);
    if (rawReadingSession) {
      try {
        readingSessions.push({
          session: JSON.parse(rawReadingSession),
          sessionKey: sessionKey, // 记录key用于执行后清理
          index: i + 1
        });
      } catch (e) {
        console.log(`🔴解析任务3-组${i + 1}会话失败: ${e.message}`);
      }
    }
  }

  const rawTimeout = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeoutSeconds = parsePositiveNumber(rawTimeout, CONFIG.DEFAULT_TIMEOUT_SECONDS);

  if (rawTimeout && Number(rawTimeout) !== timeoutSeconds) {
    console.log(`🟡检测到非法 qd_timeout=${rawTimeout}，已回退默认值 ${CONFIG.DEFAULT_TIMEOUT_SECONDS}s`);
  }

  return {
    session1,
    session2,
    readingSessions, // 返回任务3的会话数组
    timeoutMs: timeoutSeconds * 1000,
    timeoutSeconds,
  };
}

// --- 单次请求执行 ---
async function runTaskOnce(options, taskLabel, current, total) {
  return new Promise((resolve) => {
    const req = cloneRequestOptions(options);

    $httpClient.post(req, (error, response, data) => {
      if (error) {
        console.log(`🔴${taskLabel} 第 ${current}/${total} 次请求失败: ${error}`);
        return resolve(false);
      }

      const statusCode = response ? (response.status || response.statusCode) : undefined;
      if (statusCode && statusCode !== 200) {
        console.log(`🔴${taskLabel} 第 ${current}/${total} 次 HTTP异常: ${statusCode}`);
      }

      let ok = false;
      try {
        const obj = JSON.parse(data);
        ok = obj && obj.Result === CONFIG.SUCCESS_RESULT_CODE && (!statusCode || statusCode === 200);
        if (ok) {
          console.log(`🎉${taskLabel} 第 ${current}/${total} 次成功`);
        } else {
          console.log(`🔴${taskLabel} 第 ${current}/${total} 次失败: ${data}`);
        }
      } catch (e) {
        console.log(`🔴${taskLabel} 第 ${current}/${total} 次解析响应失败: ${e.message}`);
        console.log(`响应数据: ${data}`);
      }

      resolve(ok);
    });
  });
}

// --- 批量执行 (任务1、2) ---
async function executeBatch(taskLabel, options, count, intervalMs) {
  let success = 0;
  let fail = 0;

  for (let i = 1; i <= count; i++) {
    console.log(`🟡${taskLabel} 执行: 第 ${i}/${count} 次`);
    const ok = await runTaskOnce(options, taskLabel, i, count);
    if (ok) success++;
    else fail++;

    if (i < count) {
      await wait(intervalMs);
    }
  }

  return { success, fail, total: count };
}

// --- 动态执行 (任务3: 阅读·加点) ---
async function executeReadingTasks(readingSessions, intervalMs) {
  let success = 0;
  let fail = 0;
  const total = readingSessions.length;

  if (total === 0) {
    console.log("⚪未检测到任务3(广告·加点)的Session，跳过执行。");
    return { success, fail, total };
  }

  for (let i = 0; i < total; i++) {
    const item = readingSessions[i];
    console.log(`🟡任务3(广告·加点) 执行: 组${item.index}/${total}`);
    
    // 一次性签名，重放1次即可
    const ok = await runTaskOnce(item.session, `任务3-组${item.index}`, 1, 1);
    
    if (ok) {
      success++;
      // 核心逻辑：签名是一次性的，成功后立即清理，防止下次脚本执行时误用过期签名
      $persistentStore.write("", item.sessionKey);
      console.log(`🧹任务3-组${item.index} 签名已用尽，已自动清理本地缓存`);
    } else {
      fail++;
      // 如果失败，通常也是签名失效或网络问题，同样清理掉避免堆积垃圾数据
      $persistentStore.write("", item.sessionKey);
      console.log(`🧹任务3-组${item.index} 执行失败，已自动清理本地缓存`);
    }

    if (i < total - 1) {
      await wait(intervalMs);
    }
  }

  return { success, fail, total };
}

// --- 主流程 ---
(async () => {
  const init = readInitData();
  if (!init) return safeDone();

  console.log(`⏱️ 设置的间隔时间: ${init.timeoutSeconds} 秒`);

  // 执行任务1和任务2
  const result1 = await executeBatch("任务1(每日福利)", init.session1, CONFIG.TASK_1_EXECUTIONS, init.timeoutMs);
  const result2 = await executeBatch("任务2(限时彩蛋)", init.session2, CONFIG.TASK_2_EXECUTIONS, init.timeoutMs);
  
  // 执行任务3 (动态多点)
  const result3 = await executeReadingTasks(init.readingSessions, init.timeoutMs);

  // 汇总通知
  const summary =
    `任务1(福利): 成功 ${result1.success}/${result1.total}，失败 ${result1.fail}\n` +
    `任务2(彩蛋): 成功 ${result2.success}/${result2.total}，失败 ${result2.fail}\n` +
    `任务3(加点): 成功 ${result3.success}/${result3.total}，失败 ${result3.fail}`;

  console.log("✅ " + CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE);
  console.log("📊 执行汇总:\n" + summary);
  notify(CONFIG.NOTIFICATION_SUBTITLE_EXECUTION_COMPLETE, summary);
})().catch((e) => {
  console.log("🔴脚本执行出错: " + (e && e.message ? e.message : e));
  notify("脚本异常", "请检查日志");
}).finally(() => {
  safeDone();
});
