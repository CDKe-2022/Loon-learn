// ==UserScript==
// @plugin      Ubisoft 活动任务
// @author      KeChatGPT
// @version     1.0.0
// @homepage    https://github.com/kehuang2025/loon-ubisoft
// ==/UserScript==

const $ = new Env("Ubisoft 活动任务");

// 存储 Key
const CK_KEY = "ubisoft_cookie";
const INDEX_KEY = "ubisoft_mission_index";
const ID_KEY = "ubisoft_mission_id";

!(async () => {
  if (typeof $request !== "undefined") {
    await getCookie();
    $.done();
  } else {
    await runFlow();
    $.done();
  }
})().catch((e) => {
  $.logErr(e);
  $.done();
});

// ========== 抓取 Cookie ==========
async function getCookie() {
  const cookie = $request.headers["authorization"] || $request.headers["Authorization"];
  if (cookie) {
    $.setdata(cookie, CK_KEY);
    $.msg($.name, "✅ 成功捕获 Cookie", cookie.substring(0, 40) + "...");
  } else {
    $.msg($.name, "❌ 未能捕获 Cookie", "请重新触发任务请求");
  }
}

// ========== 运行完整流程 ==========
async function runFlow() {
  const cookie = $.getdata(CK_KEY);
  if (!cookie) {
    $.msg($.name, "❌ 缺少 Cookie", "请先手动打开 Ubisoft 活动获取 Cookie");
    return;
  }

  try {
    let missionIndex = parseInt($.getdata(INDEX_KEY) || "1", 10);

    $.log(`🔹 开始执行任务，当前 index=${missionIndex}`);

    const start = await missionStart(cookie, missionIndex);
    if (!start) return;

    const end = await missionEnd(cookie);
    if (!end) return;

    const boons = await getBoons(cookie);
    if (!boons) return;

    const event = await eventEnd(cookie);
    if (!event) return;

    // index 自增
    $.setdata(String(missionIndex + 1), INDEX_KEY);

    // ✅ 最终通知
    $.msg($.name, "🎉 全流程完成", `任务 #${missionIndex} 已完成，奖励：${boons}`);
  } catch (err) {
    $.msg($.name, "❌ 脚本错误", err.message);
    $.logErr(err);
  }
}

// ========== 四个接口 ==========
function missionStart(cookie, index) {
  return new Promise((resolve) => {
    const body = { index };
    const url = {
      url: "https://latest.live.acr.ubisoft.com/missionStart",
      headers: { Authorization: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    $.post(url, (err, resp, data) => {
      if (err) {
        $.msg($.name, "missionStart 错误", err);
        return resolve(false);
      }
      try {
        const obj = JSON.parse(data);
        if (obj?.data?.missionId) {
          $.setdata(obj.data.missionId, ID_KEY);
          $.msg($.name, "✅ missionStart 成功", `missionId=${obj.data.missionId}`);
          resolve(true);
        } else {
          $.msg($.name, "❌ missionStart 失败", data);
          resolve(false);
        }
      } catch (e) {
        $.logErr(e, resp);
        resolve(false);
      }
    });
  });
}

function missionEnd(cookie) {
  return new Promise((resolve) => {
    const missionId = $.getdata(ID_KEY);
    if (!missionId) {
      $.msg($.name, "❌ missionEnd 缺少 missionId", "请先运行 missionStart");
      return resolve(false);
    }
    const body = { missionId };
    const url = {
      url: "https://latest.live.acr.ubisoft.com/missionEnd",
      headers: { Authorization: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
    $.post(url, (err, resp, data) => {
      if (err) {
        $.msg($.name, "missionEnd 错误", err);
        return resolve(false);
      }
      try {
        const obj = JSON.parse(data);
        if (obj?.success) {
          $.msg($.name, "✅ missionEnd 成功", "");
          resolve(true);
        } else {
          $.msg($.name, "❌ missionEnd 失败", data);
          resolve(false);
        }
      } catch (e) {
        $.logErr(e, resp);
        resolve(false);
      }
    });
  });
}

function getBoons(cookie) {
  return new Promise((resolve) => {
    const url = {
      url: "https://latest.live.acr.ubisoft.com/getBoons",
      headers: { Authorization: cookie },
    };
    $.get(url, (err, resp, data) => {
      if (err) {
        $.msg($.name, "getBoons 错误", err);
        return resolve(false);
      }
      try {
        const obj = JSON.parse(data);
        if (obj?.boons) {
          $.msg($.name, "✅ getBoons 成功", `奖励: ${obj.boons.join(", ")}`);
          resolve(obj.boons.join(", "));
        } else {
          $.msg($.name, "❌ getBoons 失败", data);
          resolve(false);
        }
      } catch (e) {
        $.logErr(e, resp);
        resolve(false);
      }
    });
  });
}

function eventEnd(cookie) {
  return new Promise((resolve) => {
    const url = {
      url: "https://latest.live.acr.ubisoft.com/eventEnd",
      headers: { Authorization: cookie },
    };
    $.post(url, (err, resp, data) => {
      if (err) {
        $.msg($.name, "eventEnd 错误", err);
        return resolve(false);
      }
      try {
        const obj = JSON.parse(data);
        if (obj?.success) {
          $.msg($.name, "✅ eventEnd 成功", "");
          resolve(true);
        } else {
          $.msg($.name, "❌ eventEnd 失败", data);
          resolve(false);
        }
      } catch (e) {
        $.logErr(e, resp);
        resolve(false);
      }
    });
  });
}

// ========== Env 封装 ==========
function Env(t, s) { class e { constructor(t) { this.env = t } log(...t) { console.log(...t) } } return new class { constructor(t, s) { this.name = t, this.logs = [], this.startTime = (new Date).getTime(), Object.assign(this, new e(t)) } getdata(t) { return $persistentStore.read(t) } setdata(t, s) { return $persistentStore.write(t, s) } msg(t = this.name, s = "", e = "", r) { $notification.post(t, s, e, r) } logErr(t, s) { this.log("", `❗️${this.name}, 错误!`, t, s) } done(t = {}) { $done(t) } }(t, s) }
