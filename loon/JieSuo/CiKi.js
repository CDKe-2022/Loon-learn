/**
 * 刺客信条：叛变 自动任务
 * bhvrSession + 蓝币自动购买 + 自动刷新Cookie
 */

const EVENT_ID = "GE_22_5DayGauntletEventTemplate_20250511";
const BASE_URL = "https://latest.live.acr.ubisoft.com";
const ASSASSINS = [
  { id: "A1", hp: 100.0, rank: 5 },
  { id: "A62", hp: 100.0, rank: 5 },
  { id: "A68", hp: 100.0, rank: 5 },
];

class Env {
  constructor(name) {
    this.name = name;
    this.startTime = Date.now();
    this.log(`🔔${this.name} 开始!`);
  }

  getdata(key) { return $persistentStore.read(key); }
  setdata(val, key) { return $persistentStore.write(val, key); }

  http = {
    post: (options) => new Promise((resolve, reject) => {
      $httpClient.post(options, (err, resp, data) => err ? reject(err) : resolve({ statusCode: resp.status, body: data }));
    }),
    get: (options) => new Promise((resolve, reject) => {
      $httpClient.get(options, (err, resp, data) => err ? reject(err) : resolve({ statusCode: resp.status, body: data }));
    }),
  };

  msg(title, subtitle = "", desc = "") { $notification.post(title, subtitle, desc); }
  log(...msg) { console.log(msg.join(" ")); }
  wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  done() { const end = (Date.now() - this.startTime)/1000; this.log(`🔔${this.name} 结束! ⏱ ${end.toFixed(1)} 秒`); $done(); }
}

const $ = new Env("刺客信条：叛变");

// =====================
// 自动获取 Cookie
// =====================
function getCookie() {
  try {
    const bhvr = $response.headers["Set-Cookie"] || $response.headers["set-cookie"];
    if (bhvr && bhvr.includes("bhvrSession=")) {
      const cookie = bhvr.split(";")[0];
      $.setdata(cookie, "bhvrSession");
      $.msg($.name, "✅ Cookie获取成功", cookie);
      $.log("✅ Cookie已保存:", cookie);
    } else {
      $.log("⚠️ 未检测到 bhvrSession");
    }
  } catch (e) {
    $.log("❌ 获取Cookie异常:", e.message);
  }
}

// =====================
// 通用 POST 请求
// =====================
async function post(path, body = {}) {
  let cookie = $.getdata("bhvrSession");
  if (!cookie) {
    $.msg($.name, "❌ Cookie不存在", "请先获取 bhvrSession");
    throw new Error("Cookie缺失");
  }
  const options = {
    url: BASE_URL + path,
    headers: {
      "Host": "latest.live.acr.ubisoft.com",
      "Content-Type": "application/json; charset=UTF-8",
      "Accept-Language": "zh-CN,zh-Hans;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "X-Unity-Version": "2020.3.40f1",
      "Accept": "*/*",
      "DEVICE-TIME-OFFSET": "0",
      "User-Agent": "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
      "X-SAFE-JSON-ARRAY": "true",
      "Cookie": cookie
    },
    body: JSON.stringify(body),
  };
  const resp = await postWithRetry(options);
  return JSON.parse(resp.body || "{}");
}

async function postWithRetry(options, retry = 3) {
  for (let i = 0; i < retry; i++) {
    try {
      const resp = await $.http.post(options);
      if (resp.statusCode >= 200 && resp.statusCode < 300) return resp;
      $.log(`❌ 状态码 ${resp.statusCode}, 重试第${i+1}次`);
      await $.wait(2000);
    } catch (e) {
      $.log(`🔴 请求异常: ${e.message}, 重试第${i+1}次`);
      await $.wait(2000);
    }
  }
  throw new Error("请求失败: " + options.url);
}

// =====================
// 蓝币购买/消耗
// =====================
async function buyBlueCoin() {
  $.log("💰 尝试购买蓝币...");
  try {
    // 购买
    await post("/api/v1/purchases/Daily_TLEEnergy_150", { oldQuantity: 0, wantedQuantity: 1, currencyType: "HC" });
    // 消耗
    await post("/api/v1/inventories/consume", { itemId: "Daily_TLEEnergy_150", quantity: 1 });
    $.msg($.name, "💰 蓝币购买成功", "已消耗 1 个蓝币");
  } catch (e) {
    $.log("❌ 蓝币购买/消耗失败:", e.message);
  }
}

// =====================
// 任务流程
// =====================
async function getMissionStatus() {
  const res = await post("/api/v1/extensions/gauntletEvent/info", { data: { eventId: EVENT_ID } });
  if (res.data?.missionStatus) {
    const { missionIndex, missionId } = res.data.missionStatus;
    $.setdata(missionIndex, "missionIndex");
    $.setdata(missionId, "missionId");
    $.log(`✅ 获取任务状态: index=${missionIndex}, id=${missionId}`);
    return { missionIndex, missionId };
  }
  $.log("⚠️ 未返回任务状态");
  return null;
}

async function eventStart() {
  const body = { data: { assassins: ASSASSINS, difficultyTier: "GauntletDifficultySetting3", level: 50, eventId: EVENT_ID } };
  const res = await post("/api/v1/extensions/gauntletEvent/eventStart", body);
  if (res.data?.missionStatus?.missionId) {
    $.setdata(res.data.missionStatus.missionIndex, "missionIndex");
    $.setdata(res.data.missionStatus.missionId, "missionId");
    $.msg($.name, "🎉 新任务已启动", `MissionIndex=${res.data.missionStatus.missionIndex}`);
    return true;
  }
  $.log("❌ 启动任务失败，尝试购买蓝币...");
  await buyBlueCoin();
  return false;
}

async function missionStart(missionIndex, missionId) {
  const body = { data: { assassins: ASSASSINS.map(a => a.id), missionStatus: { missionIndex, missionId }, eventId: EVENT_ID } };
  const res = await post("/api/v1/extensions/gauntletEvent/missionStart", body);
  if (res.data?.missionStatus?.missionId) {
    $.setdata(res.data.missionStatus.missionIndex, "missionIndex");
    $.setdata(res.data.missionStatus.missionId, "missionId");
    $.msg($.name, "✅ missionStart成功", `MissionIndex=${res.data.missionStatus.missionIndex}`);
    return true;
  }
  $.log("❌ missionStart失败");
  return false;
}

async function missionEnd(missionIndex, missionId) {
  const body = { data: { missionStatus: { missionIndex, missionId }, assassins: ASSASSINS, success: true, eventId: EVENT_ID } };
  const res = await post("/api/v1/extensions/gauntletEvent/missionEnd", body);
  if (res.data?.missionStatus?.missionId) {
    $.setdata(res.data.missionStatus.missionIndex, "missionIndex");
    $.setdata(res.data.missionStatus.missionId, "missionId");
    $.msg($.name, "✅ missionEnd成功", `MissionIndex=${res.data.missionStatus.missionIndex}`);
    return true;
  }
  $.log("❌ missionEnd失败");
  return false;
}

async function applyBoon() {
  const res = await post("/api/v1/extensions/gauntletEvent/getBoons", { data: { difficultyTier: "GauntletDifficultySetting3", eventId: EVENT_ID } });
  const boon = res.data?.endMissionBoons?.[0];
  if (!boon) { $.log("⚠️ 未获取到Buff"); return false; }
  const applyRes = await post("/api/v1/extensions/gauntletEvent/applySelectedBoon", { data: { selectedBoon: boon, eventId: EVENT_ID } });
  if (applyRes.success) { $.msg($.name, "🎉 Buff已应用", boon); return true; }
  $.log("❌ 应用Buff失败");
  return false;
}

async function eventEnd() {
  await post("/api/v1/extensions/gauntletEvent/eventEnd", { data: { eventId: EVENT_ID } });
  await post("/api/v1/extensions/gauntletEvent/initializeLeaderboard", { data: { eventId: EVENT_ID } });
  $.msg($.name, "🏆 本轮任务已结束", "已领取奖励");
}

// =====================
// 主流程
// =====================
async function runTasks() {
  try {
    $.log("🚀 开始执行任务流程");

    let status = await getMissionStatus();
    if (!status) {
      if (!(await eventStart())) return;
      status = await getMissionStatus();
      if (!status) { $.msg($.name, "❌ 无法获取任务状态"); return; }
    }

    if (status.missionIndex === 10) {
      await eventEnd();
      await eventStart();
      return;
    }

    if (!(await missionStart(status.missionIndex, status.missionId))) return;
    await $.wait(1000);
    if (!(await missionEnd(status.missionIndex, status.missionId))) return;
    await $.wait(1000);
    await applyBoon();
    await eventEnd();

    $.log("🎯 本轮任务流程完成");
  } catch (e) {
    $.log("❌ 执行异常:", e.message);
    $.msg($.name, "❌ 执行异常", e.message);
  } finally {
    $.done();
  }
}

// =====================
// 执行入口
// =====================
try {
  if (typeof $response !== "undefined" && typeof $request !== "undefined" && $request.url.includes("/auth/provider/apple/login1")) {
    getCookie();
    $.done();
  } else {
    runTasks();
  }
} catch (e) {
  runTasks();
}
