const $ = new Env("Ubisoft 每日任务");

// ================== 抓取 Cookie ==================
if ($response && $request && $request.url.includes("/auth/provider/apple/login1")) {
  getCookie();
  $.done();
} else {
  runTasks();
}

// 捕获 bhvrSession
function getCookie() {
  const setCookie = $response.headers["Set-Cookie"] || $response.headers["set-cookie"];
  if (setCookie) {
    const match = setCookie.match(/bhvrSession=([^;]+)/);
    if (match) {
      const bhvr = match[1];
      $.setdata(bhvr, "UBISOFT_BHVR");
      $.msg($.name, "✅ 成功捕获 bhvrSession", bhvr.substring(0, 40) + "...");
    } else {
      $.msg($.name, "❌ 未能捕获 bhvrSession", "未匹配到 bhvrSession");
    }
  } else {
    $.msg($.name, "❌ 未能捕获 bhvrSession", "响应头无 Set-Cookie");
  }
}

// ================== 主流程 ==================
async function runTasks() {
  const cookie = $.getdata("UBISOFT_BHVR");
  if (!cookie) {
    $.msg($.name, "❌ 未检测到 bhvrSession", "请先登录抓取 Cookie");
    return $.done();
  }

  try {
    let summary = [];

    // 示例任务索引，实际可调整
    const missions = [0, 1];

    for (const idx of missions) {
      $.log(`▶️ 开始任务 index=${idx}`);
      let start = await missionStart(cookie, idx);
      if (!start.success) {
        summary.push(`任务${idx} 启动失败`);
        continue;
      }

      await $.wait(2000);

      let end = await missionEnd(cookie, idx);
      if (!end.success) {
        summary.push(`任务${idx} 结束失败`);
        continue;
      }

      await $.wait(2000);

      let boons = await getBoons(cookie);
      summary.push(`任务${idx} 奖励: ${boons.reward || "无"}`);
    }

    await $.wait(2000);

    let event = await eventEnd(cookie);
    if (event.success) {
      summary.push(`🎉 活动结算成功: ${event.msg}`);
    } else {
      summary.push("❌ 活动结算失败");
    }

    $.msg($.name, "执行完成", summary.join("\n"));
  } catch (e) {
    $.logErr(e);
    $.msg($.name, "❌ 运行异常", e.message || e);
  } finally {
    $.done();
  }
}

// ================== API 封装 ==================
function missionStart(cookie, index) {
  return request("https://latest.live.acr.ubisoft.com/missionStart", {
    index,
  }, cookie, "任务开始");
}

function missionEnd(cookie, index) {
  return request("https://latest.live.acr.ubisoft.com/missionEnd", {
    index,
  }, cookie, "任务结束");
}

function getBoons(cookie) {
  return request("https://latest.live.acr.ubisoft.com/getBoons", {}, cookie, "获取奖励");
}

function eventEnd(cookie) {
  return request("https://latest.live.acr.ubisoft.com/eventEnd", {}, cookie, "活动结束");
}

// 通用请求函数
function request(url, body, cookie, tag) {
  return new Promise((resolve) => {
    const opt = {
      url,
      headers: {
        "Content-Type": "application/json",
        Cookie: `bhvrSession=${cookie}`,
      },
      body: JSON.stringify(body),
    };
    $.post(opt, (err, resp, data) => {
      if (err) {
        $.log(`❌ ${tag} 请求失败: ${err}`);
        return resolve({ success: false });
      }
      try {
        const obj = JSON.parse(data || "{}");
        if (obj && obj.result == 0) {
          $.log(`✅ ${tag} 成功: ${data}`);
          resolve({ success: true, reward: obj.reward, msg: data });
        } else {
          $.log(`⚠️ ${tag} 失败: ${data}`);
          resolve({ success: false });
        }
      } catch (e) {
        $.log(`❌ ${tag} JSON解析错误: ${e}`);
        resolve({ success: false });
      }
    });
  });
}

// ================== Loon 环境封装 ==================
function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.startTime = Date.now();
      this.log(`🔔${this.name}, 开始!`);
    }
    getdata(key) {
      return $persistentStore.read(key);
    }
    setdata(val, key) {
      return $persistentStore.write(val, key);
    }
    get(t, cb) {
      $httpClient.get(t, (err, resp, data) => {
        if (resp) resp.body = data;
        cb(err, resp, data);
      });
    }
    post(t, cb) {
      $httpClient.post(t, (err, resp, data) => {
        if (resp) resp.body = data;
        cb(err, resp, data);
      });
    }
    msg(title, subt = "", desc = "") {
      $notification.post(title, subt, desc);
    }
    log(...msg) {
      console.log(msg.join(" "));
    }
    logErr(err) {
      this.log(`❌错误: ${err}`);
    }
    wait(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }
    done() {
      let end = (Date.now() - this.startTime) / 1000;
      this.log(`🔔${this.name}, 结束! ⏱ ${end} 秒`);
      $done();
    }
  })(name);
}
