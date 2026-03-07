/*
脚本功能: 获取 起点读书 任务信息 (仅支持 Loon)
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

function parseJSON(raw) {
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * 提取任务1 ID（qd_taskId）
 * 兼容旧脚本行为：旧脚本实际因 (a = b) 最终使用了 TaskList[1]
 * 因此这里优先取 index 1，其次 index 0
 */
function extractTaskId1(data) {
  const list = data?.DailyBenefitModule?.TaskList;
  if (!Array.isArray(list) || list.length === 0) return "";

  const id = list?.[1]?.TaskId || list?.[0]?.TaskId || "";
  return id ? String(id) : "";
}

/**
 * 提取任务2 ID（qd_taskId_2）
 * 旧脚本通过 Icon === "额外看3次小视频得奖励" 精确匹配
 * 这里用 includes 提升稳健性，避免文案轻微变更导致失效
 */
function extractTaskId2(data) {
  const list = data?.VideoRewardTab?.TaskList;
  if (!Array.isArray(list) || list.length === 0) return "";

  const found = list.find((item) => {
    const text = String(item?.Icon || item?.Title || item?.TaskName || "");
    return text.includes(CONFIG.EXTRA_VIDEO_HINT);
  });

  const id = found?.TaskId || "";
  return id ? String(id) : "";
}

(function main() {
  try {
    if (typeof $response === "undefined" || !$response) {
      log("当前非 response 上下文，跳过。");
      notify("⚠️执行环境不正确", "请确认使用 script-response-body 触发");
      return;
    }

    const rawBody = $response.body || "";
    if (!rawBody) {
      log("🔴响应体为空");
      notify("🔴任务信息获取失败", "响应体为空");
      return;
    }

    const obj = parseJSON(rawBody);
    if (!obj) {
      log("🔴响应 JSON 解析失败");
      notify("🔴任务信息获取失败", "响应 JSON 解析失败，请查看日志");
      return;
    }

    const data = obj?.Data || {};
    const taskId1 = extractTaskId1(data);
    const taskId2 = extractTaskId2(data);

    const writeResult = {
      task1: false,
      task2: false,
    };

    if (taskId1) {
      writeResult.task1 = $persistentStore.write(taskId1, CONFIG.TASK_ID_KEY_1);
    }
    if (taskId2) {
      writeResult.task2 = $persistentStore.write(taskId2, CONFIG.TASK_ID_KEY_2);
    }

    // 完整成功
    if (taskId1 && taskId2 && writeResult.task1 && writeResult.task2) {
      log("🎉任务信息获取成功!");
      log(`taskId_1: ${taskId1}`);
      log(`taskId_2: ${taskId2}`);
      notify("✅任务信息获取成功", `taskId_1: ${taskId1}\ntaskId_2: ${taskId2}`);
      return;
    }

    // 部分成功/失败详情
    const details = [];
    if (!taskId1) details.push("未解析到 taskId_1");
    else if (!writeResult.task1) details.push("taskId_1 写入失败");

    if (!taskId2) details.push("未解析到 taskId_2");
    else if (!writeResult.task2) details.push("taskId_2 写入失败");

    const msg = details.join("；");
    log(`🔴任务信息获取不完整: ${msg}`);
    notify("⚠️任务信息获取不完整", msg);
  } catch (e) {
    log(`🔴脚本异常: ${e && e.message ? e.message : e}`);
    notify("脚本异常", "请查看日志");
  } finally {
    safeDone();
  }
})();