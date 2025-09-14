// ==================
// 全局配置
// ==================
const BASE_URL = "https://latest.live.acr.ubisoft.com";
const ASSASSINS = [{ id: "A1", hp: 100.00, rank: 5 }, { id: "A62", hp: 100.00, rank: 5 }, { id: "A68", hp: 100.00, rank: 5 }];

const STORAGE = {
  MISSION_INDEX: "ac_missionIndex",
  MISSION_ID: "ac_missionId",
  COOKIE: "ac_cookie",
  EVENT_ID: "ac_eventId"
};

const $ = new Env("刺客信条：叛变");

function get(key) { return $.getdata(key); }
function set(key, val) { return $.setdata(val, key); }

function checkRequired(name, value) {
  if (!value || value === "") {
    $.log(`⚠️ ${name} 为空! 尝试自动获取...`);
    return false;
  }
  return true;
}

async function post(url, body, retry = 3) {
  const options = {
    url: url,
    headers: createHeaders(), // 👈 动态生成 Headers，避免全局引用未定义变量
    body: body
  };
  for (let i = 0; i < retry; i++) {
    try {
      const resp = await $.http.post(options);
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return JSON.parse(resp.body || "{}");
      } else {
        $.log(`❌ ${url} 状态码: ${resp.statusCode}, 第${i+1}次重试...`);
        await $.wait(2000);
      }
    } catch (err) {
      $.log(`🔴 请求异常: ${err.message}`);
      await $.wait(2000);
    }
  }
  throw new Error(`请求失败: ${url} 已重试 ${retry} 次`);
}

// ✅ 新增：动态创建 Headers 的函数（关键修复！）
function createHeaders() {
  const cookie = get(STORAGE.COOKIE);
  const eventId = get(STORAGE.EVENT_ID);

  if (!cookie || !eventId) {
    $.log("⚠️ 未检测到有效 Cookie 或 EventId，使用默认头（仅用于初始化请求）");
  }

  return {
    "Host": "latest.live.acr.ubisoft.com",
    "Content-Type": "application/json; charset=UTF-8",
    "Accept-Language": "zh-CN,zh-Hans;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "X-Unity-Version": "2021.3.45f1",
    "Accept": "*/*",
    "DEVICE-TIME-OFFSET": "0",
    "User-Agent": "AC%20Rebellion/107498 CFNetwork/3826.600.41 Darwin/24.6.0",
    "X-SAFE-JSON-ARRAY": "true",
    "Cookie": cookie || "" // ⚠️ 必须有默认值，防止 undefined
  };
}

// ======== 自动捕获动态数据（由 http-request 触发）========
function captureDynamicData(requestBody, requestHeaders) {
  let eventId = null;
  try {
    const body = JSON.parse(requestBody);
    eventId = body.data?.eventId;
    if (!eventId) throw new Error("未找到 eventId");
  } catch (e) {
    $.log("❌ 无法解析 initializeLeaderboard 请求体中的 eventId");
    return;
  }

  let cookie = null;
  const rawCookie = requestHeaders['cookie'] || requestHeaders['Cookie'];
  if (rawCookie && typeof rawCookie === 'string') {
    const match = rawCookie.match(/bhvrSession=([^;\s]+)/);
    if (match) cookie = match[0];
  }

  if (!cookie) {
    for (const key in requestHeaders) {
      if (key.toLowerCase() === 'cookie') {
        const val = requestHeaders[key];
        if (Array.isArray(val)) {
          for (const c of val) {
            const m = c.match(/bhvrSession=([^;\s]+)/);
            if (m) { cookie = m[0]; break; }
          }
        } else if (typeof val === 'string') {
          const m = val.match(/bhvrSession=([^;\s]+)/);
          if (m) { cookie = m[0]; break; }
        }
      }
    }
  }

  if (!cookie) {
    $.log("❌ 未在请求头中找到 bhvrSession");
    return;
  }

  set(STORAGE.COOKIE, cookie);
  set(STORAGE.EVENT_ID, eventId);

  $.log(`🎉 成功捕获动态数据：`);
  $.log(`   Cookie: ${cookie.substring(0, 20)}...`);
  $.log(`   EventId: ${eventId}`);

  $.msg("🎯 动态数据已捕获", `已更新 Cookie 和 EventId`, `当前活动: ${eventId}`);
}

// ======== 主流程函数（由 cron 触发）========
async function main() {
  $.log("🚀 开始执行《刺客信条：叛变》自动化任务...");

  let cookie = get(STORAGE.COOKIE);
  let eventId = get(STORAGE.EVENT_ID);

  if (!checkRequired("Cookie", cookie) || !checkRequired("EventId", eventId)) {
    $.log("🔄 尚未捕获动态数据，正在主动触发 initializeLeaderboard...");
    const body = JSON.stringify({ data: { eventId: "placeholder" } });
    try {
      const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/initializeLeaderboard", body);
      // 注意：这里不会触发捕获，因为没有拦截 header
      $.msg("⚠️ 请手动打开游戏", "确保已登录并触发一次 Gauntlet 流程，以便捕获 Cookie 和 EventId", "然后重新运行此脚本");
      return;
    } catch (e) {
      $.log("❌ 主动触发失败，请手动进入游戏触发一次 initializeLeaderboard 请求");
      $.msg("⚠️ 手动操作提示", "请打开游戏 → 进入 Gauntlet 活动页面 → 等待加载完成", "然后再次运行脚本");
      return;
    }
  }

  let status = await getMissionStatus(cookie, eventId);
  if (!status) {
    $.log("🔄 尚无有效任务，尝试启动新任务...");
    if (!(await eventStart(cookie, eventId))) {
      $.msg($.name, "❌ 启动失败", "请检查网络或重试");
      return;
    }
    status = await getMissionStatus(cookie, eventId);
    if (!status) {
      $.msg($.name, "❌ 仍无法获取任务", "请确认 Cookie 和 EventId 是否有效");
      return;
    }
  }

  if (status.missionIndex === 10) {
    $.log("🏁 任务已完成，进入奖励领取阶段...");
    await eventEndAndReset(cookie, eventId);
    await buyAndConsumeEnergy(cookie);
    await eventStart(cookie, eventId);
    $.msg($.name, "🎉 重置完成", `已领取奖励并启动新任务\n当前活动: ${eventId}`);
    return;
  }

  if (!(await missionStart(cookie, status.missionIndex, status.missionId, eventId))) {
    $.msg($.name, "❌ 任务开始失败", "可能 Cookie 过期");
    return;
  }

  if (!(await missionEnd(cookie, status.missionIndex, status.missionId, eventId))) {
    $.log("⚠️ 任务结束失败，继续尝试领取 Buff");
  }

  await applyBoon(cookie, eventId);
  await buyAndConsumeEnergy(cookie);

  $.msg($.name, "✅ 执行完成", `当前任务: ${status.missionIndex}/10\n活动: ${eventId}`);
}

// ========== 辅助函数（全部改为传参形式）==========
async function getMissionStatus(cookie, eventId) {
  const body = JSON.stringify({ data: { eventId } });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/info", body);
  if (res.data?.missionStatus) {
    const { missionIndex, missionId } = res.data.missionStatus;
    set(STORAGE.MISSION_INDEX, missionIndex);
    set(STORAGE.MISSION_ID, missionId);
    $.log(`✅ 获取任务状态: index=${missionIndex}, id=${missionId}`);
    return { missionIndex, missionId };
  }
  return null;
}

async function eventStart(cookie, eventId) {
  const body = JSON.stringify({
    data: {
      assassins: ASSASSINS,
      difficultyTier: "GauntletDifficultySetting3",
      level: 50,
      eventId
    }
  });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/eventStart", body);
  if (res.data?.missionStatus) {
    const { missionIndex, missionId } = res.data.missionStatus;
    set(STORAGE.MISSION_INDEX, missionIndex);
    set(STORAGE.MISSION_ID, missionId);
    $.log(`🎉 新任务已启动: index=${missionIndex}, id=${missionId}`);
    return true;
  }
  return false;
}

async function missionStart(cookie, missionIndex, missionId, eventId) {
  const body = JSON.stringify({
    data: {
      assassins: ["A1", "A62", "A68"],
      missionStatus: { missionIndex, missionId },
      eventId
    }
  });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/missionStart", body);
  if (res.data?.missionStatus) {
    set(STORAGE.MISSION_INDEX, res.data.missionStatus.missionIndex);
    set(STORAGE.MISSION_ID, res.data.missionStatus.missionId);
    return true;
  }
  return false;
}

async function missionEnd(cookie, missionIndex, missionId, eventId) {
  const body = JSON.stringify({
    data: {
      missionStatus: { missionIndex, missionId },
      assassins: [
        { id: "A1", hp: 100.00 },
        { id: "A62", hp: 100.00 },
        { id: "A68", hp: 100.00 }
      ],
      success: true,
      eventId
    }
  });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/missionEnd", body);
  if (res.data?.missionStatus) {
    set(STORAGE.MISSION_INDEX, res.data.missionStatus.missionIndex);
    set(STORAGE.MISSION_ID, res.data.missionStatus.missionId);
    return true;
  }
  return false;
}

async function applyBoon(cookie, eventId) {
  const body = JSON.stringify({ data: { difficultyTier: "GauntletDifficultySetting3", eventId } });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/getBoons", body);
  const boon = res.data?.endMissionBoons?.[0];
  if (!boon) {
    $.log("⚠️ 未获取到Buff");
    return false;
  }
  const applyBody = JSON.stringify({ data: { selectedBoon: boon, eventId } });
  const applyRes = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/applySelectedBoon", applyBody);
  if (applyRes.success) {
    $.log(`🎉 已应用Buff: ${boon}`);
    return true;
  }
  return false;
}

async function buyAndConsumeEnergy(cookie) {
  const buyBody = JSON.stringify({ oldQuantity: 0, wantedQuantity: 1, currencyType: "HC" });
  await post(BASE_URL + "/api/v1/purchases/Daily_TLEEnergy_150", buyBody);
  $.log("💰 已购买蓝币");

  const consumeBody = JSON.stringify({ itemId: "Daily_TLEEnergy_150", quantity: 1 });
  await post(BASE_URL + "/api/v1/inventories/consume", consumeBody);
  $.log("🧪 已消耗蓝币");
}

async function eventEndAndReset(cookie, eventId) {
  const body = JSON.stringify({ data: { eventId } });
  await post(BASE_URL + "/api/v1/extensions/gauntletEvent/eventEnd", body);
  await post(BASE_URL + "/api/v1/extensions/gauntletEvent/initializeLeaderboard", body);
  $.log("🏆 奖励已领取，准备重置任务...");
}

// ==================
// Loon 环境类（QuanX 兼容）
// ==================
class Env {
  constructor(name) {
    this.name = name;
    this.startTime = Date.now();
    this.log(`🔔${this.name}, 开始!`);
  }

  getdata(key) { return $persistentStore.read(key); }
  setdata(val, key) { return $persistentStore.write(val, key); }

  get(t, cb) { $httpClient.get(t, (err, resp, data) => { if (resp) resp.body = data; cb(err, resp, data); }); }
  post(t, cb) { $httpClient.post(t, (err, resp, data) => { if (resp) resp.body = data; cb(err, resp, data); }); }

  http = {
    get: t => new Promise((res, rej) => this.get(t, (err, resp) => err ? rej(err) : res(resp))),
    post: t => new Promise((res, rej) => this.post(t, (err, resp) => err ? rej(err) : res(resp)))
  };

  msg(title, subtitle = "", desc = "") {
    $notification.post(title, subtitle, desc);
  }

  log(...msg) {
    console.log(msg.join(" "));
  }

  logErr(err) {
    this.log(`❌错误: ${err}`);
  }

  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  done() {
    const end = (Date.now() - this.startTime) / 1000;
    this.log(`🔔${this.name}, 结束! ⏱ ${end.toFixed(1)} 秒`);
    $done();
  }
}

// ==================
// 主程序入口（由 cron 触发）
// ==================
main().catch(e => {
  $.logErr(e);
  $.msg($.name, "❌ 执行异常", e.message);
}).finally(() => $.done());

// ==================
// 捕获函数（由 http-request 触发）
// ==================
if (typeof $request !== "undefined") {
  // 当被 http-request 调用时，执行捕获逻辑
  captureDynamicData($request.body, $request.headers);
}
