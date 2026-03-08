/*
脚本功能: 获取 起点读书 任务信息 (仅支持 Loon, 变更检测版)
操作步骤: 我 --> 福利中心

[rewrite local]
https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body your_script_url

[MITM]
hostname = h5.if.qidian.com
*/

const CONFIG = {
  NAME: "起点读书",
  TASK_ID_KEY_1: "qd_taskId",
  TASK_ID_KEY_2: "qd_taskId_2",

  // 额外小视频任务识别关键词（兼容文案微调）
  EXTRA_VIDEO_HINT: "额外看3次小视频",
};

let doneCalled = false;
function safeDone(obj = {}) {
  if (!doneCalled) {
    doneCalled = true;
    $done(obj);
  }
}

function log(msg) {
  console.log(`[${CONFIG.NAME}] ${msg}`);
}

function notify(subtitle, message) {
  $notification.post(CONFIG.NAME, subtitle || "", message || "");
}

function read(key) {
  return $persistentStore.read(key) || "";
}

function write(key, val) {
  return $persistentStore.write(String(val), key);
}

function parseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractTaskId1(data) {
  const list = data?.DailyBenefitModule?.TaskList;
  if (!Array.isArray(list) || list.length === 0) return "";
  // 与你之前逻辑保持一致倾向：优先 index 1，其次 0
  return String(list?.[1]?.TaskId || list?.[0]?.TaskId || "");
}

function extractTaskId2(data) {
  const list = data?.VideoRewardTab?.TaskList;
  if (!Array.isArray(list)) return "";
  const found = list.find((item) => {
    const text = String(item?.Icon || item?.Title || item?.TaskName || "");
    return text.includes(CONFIG.EXTRA_VIDEO_HINT);
  });
  return String(found?.TaskId || "");
}

(function main() {
  try {
    if (typeof $response === "undefined" || !$response) {
      log("非 response 上下文，跳过");
      return;
    }

    const rawBody = $response.body || "";
    if (!rawBody) {
      log("🔴响应体为空");
      return;
    }

    const obj = parseJSON(rawBody);
    if (!obj) {
      log("🔴响应 JSON 解析失败");
      return;
    }

    const data = obj?.Data || {};
    const newId1 = extractTaskId1(data);
    const newId2 = extractTaskId2(data);

    if (!newId1 || !newId2) {
      log("🔴未解析到完整 taskId，跳过写入");
      return;
    }

    const oldId1 = read(CONFIG.TASK_ID_KEY_1);
    const oldId2 = read(CONFIG.TASK_ID_KEY_2);

    // 核心：变更检测
    const sameAsLocal = oldId1 === newId1 && oldId2 === newId2;

    if (sameAsLocal) {
      // 一致：不重复写入 / 不重复通知 / 不重复刷新
      log("✅ taskId 未变化，跳过写入与通知");
      return;
    }

    // 不一致或首次：覆盖写入并通知
    const ok1 = write(CONFIG.TASK_ID_KEY_1, newId1);
    const ok2 = write(CONFIG.TASK_ID_KEY_2, newId2);

    if (ok1 && ok2) {
      const firstTime = !oldId1 || !oldId2;
      if (firstTime) {
        log(`🎉首次获取成功: taskId_1=${newId1}, taskId_2=${newId2}`);
        notify("✅首次获取任务信息成功", `taskId_1: ${newId1}\ntaskId_2: ${newId2}`);
      } else {
        log(`🔄检测到变更并已更新: ${oldId1} -> ${newId1}, ${oldId2} -> ${newId2}`);
        notify("🔄任务信息已更新", `taskId_1: ${oldId1} → ${newId1}\ntaskId_2: ${oldId2} → ${newId2}`);
      }
    } else {
      log("🔴写入本地存储失败");
      notify("⚠️任务信息更新失败", "写入本地存储失败");
    }
  } catch (e) {
    log(`🔴脚本异常: ${e?.message || e}`);
    notify("脚本异常", "请查看日志");
  } finally {
    safeDone();
  }
})();