const $ = new Env("起点读书");

// 初始化任务和会话信息，设置超时时间
const taskIds = [$.getdata("qd_taskId"), $.getdata("qd_taskId_2")];
const sessions = [$.getdata("qd_session"), $.getdata("qd_session_2")];
$.timeout = parseInt($.getdata("qd_timeout"), 10) || 20;

// 检查必需的任务和会话信息是否完整
taskIds.forEach((taskId, index) => {
  if (!taskId) {
    const taskMsg = `⚠️任务${index + 1}信息不全!`;
    $.log(taskMsg);
    $.msg($.name, taskMsg, "请通过重写获取信息");
  }
});
sessions.forEach((session, index) => {
  if (!session) {
    const sessionMsg = `⚠️广告${index + 1}信息不全!`;
    $.log(sessionMsg);
    $.msg($.name, sessionMsg, "请通过重写获取信息");
  }
});

(async () => {
  for (let i = 0; i < 7; i++) {
    $.log(`🟡任务1执行次数: ${i + 1}`);
    await runTask(sessions[0]);
  }
  for (let j = 0; j < 2; j++) {
    $.log(`🟡任务2执行次数: ${j + 1}`);
    await runTask(sessions[1]);
  }
})().catch((e) => $.logErr(e)).finally(() => {
  $.log("ok");
  $.done();
});

async function runTask(session) {
  try {
    const options = JSON.parse(session);
    const resp = await $.http.post(options);
    const obj = JSON.parse(resp.body);

    if (obj.Result === 0) {
      $.log("🎉成功!");
    } else {
      $.log("🔴失败!");
      $.log(resp.body);
    }
  } catch (e) {
    $.logErr(e);
  }
}

// Env 类优化
function Env(t, s) {
  return new (class {
    constructor(name, options) {
      this.name = name;
      this.http = new EnvHttpClient(this);
      this.logs = [];
      this.isMute = false;
      this.startTime = Date.now();
      Object.assign(this, options);
      this.log("", `🔔${this.name}, 开始!`);
    }

    log(...args) {
      this.logs.push(...args);
      console.log(args.join("\n"));
    }

    logErr(e) {
      this.log(`❗️${this.name}, 错误!`, e.stack || e);
    }

    done() {
      const endTime = Date.now();
      this.log("", `🔔${this.name}, 结束! 🕛 ${(endTime - this.startTime) / 1000} 秒`);
      $done();
    }
  })(t, s);
}

// EnvHttpClient 类用于封装 HTTP 请求
class EnvHttpClient {
  constructor(env) {
    this.env = env;
  }

  post(options) {
    return new Promise((resolve, reject) => {
      const method = options.method || "POST";
      options.method = method.toUpperCase();
      $httpClient[method.toLowerCase()](options, (error, response, body) => {
        if (error) reject(error);
        else {
          response.body = body;
          resolve(response);
        }
      });
    });
  }
}