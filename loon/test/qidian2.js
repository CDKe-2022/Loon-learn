/* 🥳 脚本功能: 自动观看 起点读书 阅读页广告 (任务3: 广告·加点！)
   执行策略: 单次只刷一组，原样重放，条件销毁，自动轮替
   核心特性: 防并发锁 / 深拷贝防污染 / 致命错误提前终止 / 失败保留数据
   默认间隔时间: 0.5s (可通过 qd_timeout 修改) */

const CONFIG = {
  READING_SESSION_KEYS: [
    "qd_reading_session_1", 
    "qd_reading_session_2", 
    "qd_reading_session_3"
  ],
  TIMEOUT_KEY: "qd_timeout",
  NOTIFICATION_TITLE: "起点读书",
  TASK_3_EXECUTIONS: 2, 
  DEFAULT_TIMEOUT_SECONDS: 0.5,
  SUCCESS_RESULT_CODE: 0,
  LOCK_KEY: "qd_reading_lock" // 建议⑦：防并发脚本锁
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
  // 建议③：使用深拷贝彻底杜绝底层库对嵌套对象（如 policy/retry）的污染
  try {
    return JSON.parse(JSON.stringify(options));
  } catch (e) {
    return { ...options }; // 降级方案
  }
}

// --- 单次请求执行 (返回详细状态) ---
async function runTaskOnce(options, taskLabel, current, total) {
  const req = cloneRequestOptions(options);
  
  return new Promise((resolve) => {
    $httpClient.post(req, (error, response, data) => {
      // 网络层错误
      if (error) {
        console.log(`🔴${taskLabel} 第 ${current}/${total} 次网络失败: ${error}`);
        return resolve({ ok: false, fatal: false, msg: error });
      }

      // 建议④：严谨的 HTTP 状态码判断
      const statusCode = response ? (response.status || response.statusCode) : 0;
      const httpOk = statusCode === 200;

      let ok = false;
      let fatal = false;
      let serverMsg = "";

      try {
        const obj = JSON.parse(data);
        // 建议①：成功判定与 Msg 记录
        if (obj?.Result === CONFIG.SUCCESS_RESULT_CODE && httpOk) {
          ok = true;
          serverMsg = obj.Msg || "接口调用成功";
          console.log(`🎉${taskLabel} 第 ${current}/${total} 次成功 | 服务端: ${serverMsg}`);
        } else {
          serverMsg = obj?.Msg || data || "未知错误";
          console.log(`🔴${taskLabel} 第 ${current}/${total} 次失败 | HTTP:${statusCode} | 服务端: ${serverMsg}`);
          
          // 建议⑤：提前终止机制 (识别致命错误，如次数已达上限)
          if (serverMsg && (serverMsg.includes("上限") || serverMsg.includes("已领取") || serverMsg.includes("已完成") || serverMsg.includes("已存在"))) {
            fatal = true;
          }
        }
      } catch (e) {
        console.log(`🔴${taskLabel} 第 ${current}/${total} 次解析响应失败: ${e.message}`);
      }

      resolve({ ok, fatal, msg: serverMsg });
    });
  });
}

// --- 主流程 ---
(async () => {
  // 1. 建议⑦：脚本锁检查 (防双开/并发冲突)
  if ($persistentStore.read(CONFIG.LOCK_KEY)) {
    console.log("🟡检测到已有任务运行中，为避免并发冲突，本次退出");
    return safeDone();
  }
  $persistentStore.write(String(Date.now()), CONFIG.LOCK_KEY);

  // 2. 按顺序寻找当前需要刷的组
  let currentSessionStr = null;
  let currentSessionKey = "";
  let currentGroupLabel = "";

  for (let i = 0; i < CONFIG.READING_SESSION_KEYS.length; i++) {
    const sess = $persistentStore.read(CONFIG.READING_SESSION_KEYS[i]);
    if (sess) {
      currentSessionStr = sess;
      currentSessionKey = CONFIG.READING_SESSION_KEYS[i];
      currentGroupLabel = `任务3-组${i + 1}(加点)`;
      break;
    }
  }

  if (!currentSessionStr) {
    console.log("🟡未找到任何阅读广告会话，请先手动观看获取");
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️无数据", "未找到广告·加点！会话");
    return;
  }

  // 3. 提前解析 Session (若损坏则直接清空，防止死循环)
  let options;
  try {
    options = JSON.parse(currentSessionStr);
  } catch (e) {
    console.error(`🔴解析 ${currentGroupLabel} 会话信息失败: ${e.message}`);
    $notification.post(CONFIG.NOTIFICATION_TITLE, "⚠️数据损坏", `${currentGroupLabel} 解析失败，已自动清空`);
    $persistentStore.write("", currentSessionKey);
    return;
  }

  // 4. 获取并校验超时时间
  const rawTimeout = $persistentStore.read(CONFIG.TIMEOUT_KEY);
  const timeoutSeconds = parsePositiveNumber(rawTimeout, CONFIG.DEFAULT_TIMEOUT_SECONDS);
  const timeoutMs = timeoutSeconds * 1000;
  console.log(`⏱️ 设置的间隔时间: ${timeoutSeconds} 秒`);

  // 5. 批量执行当前组
  console.log(`🚀开始执行: ${currentGroupLabel}`);
  let success = 0;
  let fail = 0;
  let aborted = false; // 是否因致命错误提前终止
  
  for (let i = 1; i <= CONFIG.TASK_3_EXECUTIONS; i++) {
    console.log(`🟡${currentGroupLabel} 执行: 第 ${i}/${CONFIG.TASK_3_EXECUTIONS} 次`);
    const res = await runTaskOnce(options, currentGroupLabel, i, CONFIG.TASK_3_EXECUTIONS);
    
    if (res.ok) {
      success++;
    } else {
      fail++;
      if (res.fatal) {
        console.log(`⛔检测到致命错误(如次数已达上限)，提前终止当前组后续请求`);
        aborted = true;
        break; // 建议⑤：立即跳出循环
      }
    }

    if (i < CONFIG.TASK_3_EXECUTIONS && !aborted) {
      await wait(timeoutMs);
    }
  }

  // 6. 建议②：条件销毁 (不再无条件焚毁)
  if (success > 0 || aborted) {
    // 只要有成功，或者触发了上限(说明签名已消耗/作废)，都执行销毁
    $persistentStore.write("", currentSessionKey);
    console.log(`🧹已清空 ${currentGroupLabel} 的会话数据 (用完即焚)`);
  } else {
    // 只有全部因为网络/解析等偶发原因失败，才保留数据以便重试
    console.log(`⚠️ ${currentGroupLabel} 全部失败，保留会话数据以便下次重试`);
  }

  // 7. 建议⑥：友好通知
  let notifyMsg = `成功: ${success}/${CONFIG.TASK_3_EXECUTIONS}，失败: ${fail}`;
  if (success > 0 || aborted) {
    notifyMsg += `\n✅ 当前组已销毁，下次将自动执行下一组`;
  } else {
    notifyMsg += `\n⚠️ 全部失败，数据已保留`;
  }
  
  console.log("✅ 单组执行完毕\n" + notifyMsg);
  $notification.post(CONFIG.NOTIFICATION_TITLE, `${currentGroupLabel} 完毕`, notifyMsg);

})().catch((e) => {
  console.error("🔴脚本执行出错: ", e);
  $notification.post(CONFIG.NOTIFICATION_TITLE, "❌脚本异常", "请检查日志");
}).finally(() => {
  // 建议⑦：无论如何必须释放锁
  $persistentStore.write("", CONFIG.LOCK_KEY);
  safeDone();
});

