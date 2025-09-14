#!name=刺客信条：叛变 - 自动任务
#!desc=自动完成Gauntlet每日任务：启动→执行→结束→领Buff→补蓝币，支持Cookie自动刷新
#!author=AI助手
#!date=2025-09-14
#!icon=https://i.imgur.com/7vqKz9m.png

// ==================
// 配置区
// ==================
const EVENT_ID = "GE_22_5DayGauntletEventTemplate_20250511";
const BASE_URL = "https://latest.live.acr.ubisoft.com";
const COOKIE = ""; // 可留空，会在首次抓取后自动写入

const HEADERS = {
  "Host": "latest.live.acr.ubisoft.com",
  "Content-Type": "application/json; charset=UTF-8",
  "Accept-Language": "zh-CN,zh-Hans;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "X-Unity-Version": "2020.3.40f1",
  "Accept": "*/*",
  "DEVICE-TIME-OFFSET": "0",
  "User-Agent": "AC%20Rebellion/104382 CFNetwork/1335.0.3 Darwin/21.6.0",
  "X-SAFE-JSON-ARRAY": "true",
  "Cookie": COOKIE
};

const ASSASSINS = [
  { "id": "A1", "hp": 100.00, "rank": 5 },
  { "id": "A62", "hp": 100.00, "rank": 5 },
  { "id": "A68", "hp": 100.00, "rank": 5 }
];

const STORAGE = {
  MISSION_INDEX: "acr_missionIndex",
  MISSION_ID: "acr_missionId",
  COOKIE: "acr_cookie"
};

const $ = new Env("刺客信条：叛变");

// ==================
// HTTP 请求封装
// ==================
async function post(url, body, retry = 3) {
  const options = { url, headers: HEADERS, body };
  for (let i = 0; i < retry; i++) {
    try {
      const resp = await $.http.post(options);
      if (resp.statusCode >= 200 && resp.statusCode < 300) {
        return JSON.parse(resp.body || "{}");
      } else {
        $.log(`❌ ${url} 状态码: ${resp.statusCode}, 重试 ${i+1}/${retry}`);
        await $.wait(2000);
      }
    } catch (err) {
      $.log(`🔴 请求异常: ${err.message}`);
      await $.wait(2000);
    }
  }
  throw new Error(`请求失败: ${url}`);
}

// ==================
// 核心任务函数
// ==================
async function getMissionStatus() {
  const body = JSON.stringify({ data: { eventId: EVENT_ID } });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/info", body);
  if (res.data?.missionStatus) {
    const { missionIndex, missionId } = res.data.missionStatus;
    $.setdata(missionIndex, STORAGE.MISSION_INDEX);
    $.setdata(missionId, STORAGE.MISSION_ID);
    $.log(`✅ 获取任务状态: index=${missionIndex}, id=${missionId}`);
    return { missionIndex, missionId };
  }
  return null;
}

async function eventStart() {
  const body = JSON.stringify({
    data: { assassins: ASSASSINS, difficultyTier: "GauntletDifficultySetting3", level: 50, eventId: EVENT_ID }
  });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/eventStart", body);
  if (res.data?.missionStatus) {
    const { missionIndex, missionId } = res.data.missionStatus;
    $.setdata(missionIndex, STORAGE.MISSION_INDEX);
    $.setdata(missionId, STORAGE.MISSION_ID);
    $.log(`🎉 新任务已启动: index=${missionIndex}, id=${missionId}`);
    return true;
  }
  return false;
}

async function missionStart(missionIndex, missionId) {
  const body = JSON.stringify({
    data: {
      assassins: ["A1", "A62", "A68"],
      missionStatus: { missionIndex, missionId },
      eventId: EVENT_ID
    }
  });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/missionStart", body);
  return !!res.data?.missionStatus;
}

async function missionEnd(missionIndex, missionId) {
  const body = JSON.stringify({
    data: {
      missionStatus: { missionIndex, missionId },
      assassins: [
        { id: "A1", hp: 100.00 },
        { id: "A62", hp: 100.00 },
        { id: "A68", hp: 100.00 }
      ],
      success: true,
      eventId: EVENT_ID
    }
  });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/missionEnd", body);
  return !!res.data?.missionStatus;
}

async function applyBoon() {
  const body = JSON.stringify({ data: { difficultyTier: "GauntletDifficultySetting3", eventId: EVENT_ID } });
  const res = await post(BASE_URL + "/api/v1/extensions/gauntletEvent/getBoons", body);
  const boon = res.data?.endMissionBoons?.[0];
  if (!boon) return false;
  const applyBody = JSON.stringify({ data: { selectedBoon: boon, eventId: EVENT_ID } });
  await post(BASE_URL + "/api/v1/extensions/gauntletEvent/applySelectedBoon", applyBody);
  $.log(`🎉 已应用Buff: ${boon}`);
  return true;
}

async function buyAndConsumeEnergy() {
  const buyBody = JSON.stringify({ oldQuantity: 0, wantedQuantity: 1, currencyType: "HC" });
  await post(BASE_URL + "/api/v1/purchases/Daily_TLEEnergy_150", buyBody);
  const consumeBody = JSON.stringify({ itemId: "Daily_TLEEnergy_150", quantity: 1 });
  await post(BASE_URL + "/api/v1/inventories/consume", consumeBody);
  $.log("🧪 已消耗蓝币");
}

async function eventEndAndReset() {
  const body = JSON.stringify({ data: { eventId: EVENT_ID } });
  await post(BASE_URL + "/api/v1/extensions/gauntletEvent/eventEnd", body);
  await post(BASE_URL + "/api/v1/extensions/gauntletEvent/initializeLeaderboard", body);
  $.log("🏆 奖励已领取并重置");
  return true;
}

// ==================
// 主流程
// ==================
async function main() {
  $.log("🚀 开始执行《刺客信条：叛变》自动任务...");

  let cookie = $.getdata(STORAGE.COOKIE) || COOKIE;
  if (!cookie) {
    $.msg($.name, "⚠️ 缺少Cookie", "请先运行一次抓取Cookie");
    return;
  }
  HEADERS.Cookie = cookie;

  let status = await getMissionStatus();
  if (!status) {
    if (!(await eventStart())) {
      $.msg($.name, "❌ 启动失败", "请检查Cookie或网络");
      return;
    }
    status = await getMissionStatus();
  }

  if (status.missionIndex === 10) {
    await eventEndAndReset();
    await buyAndConsumeEnergy();
    await eventStart();
    $.msg($.name, "🎉 重置完成", "已领取奖励并启动新任务");
    return;
  }

  if (await missionStart(status.missionIndex, status.missionId)) {
    await missionEnd(status.missionIndex, status.missionId);
    await applyBoon();
    await buyAndConsumeEnergy();
    $.msg($.name, "✅ 执行完成", `当前任务: ${status.missionIndex}/10`);
  } else {
    $.msg($.name, "❌ 任务开始失败", "Cookie可能过期");
  }
}

// ==================
// Env 封装
// ==================
class Env {
  constructor(name) {
    this.name = name;
  }
  getdata(key) { return $persistentStore.read(key); }
  setdata(val, key) { return $persistentStore.write(val, key); }
  get(t, cb) { $httpClient.get(t, (err, resp, data) => { if (resp) resp.body = data; cb(err, resp, data); }); }
  post(t, cb) { $httpClient.post(t, (err, resp, data) => { if (resp) resp.body = data; cb(err, resp, data); }); }
  http = {
    get: t => new Promise((res, rej) => this.get(t, (err, resp) => err ? rej(err) : res(resp))),
    post: t => new Promise((res, rej) => this.post(t, (err, resp) => err ? rej(err) : res(resp)))
  };
  msg(title, subtitle = "", desc = "") { $notification.post(title, subtitle, desc); }
  log(...msg) { console.log(msg.join(" ")); }
  wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
  done() { $done(); }
}

// ==================
// 启动
// ==================
main().catch(e => {
  $.msg($.name, "❌ 执行异常", e.message);
}).finally(() => $.done());
