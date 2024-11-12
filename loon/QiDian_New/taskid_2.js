const $ = new Env("起点读书");

// 获取任务ID
$.taskId = $.getdata("qd_taskId");
$.taskId_2 = $.getdata("qd_taskId_2");

// 主函数
(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers
  };
  $.log(JSON.stringify(session));

  if (session.body.includes($.taskId)) {
    await handleSession("qd_session", "🎉广告1信息获取成功!", session);
  } else if (session.body.includes($.taskId_2)) {
    await handleSession("qd_session_2", "🎉广告2信息获取成功!", session);
  } else {
    $.log("🔴广告信息获取失败!");
    $.msg($.name, "🔴广告信息获取失败!");
  }
})().catch((e) => $.logErr(e)).finally(() => $.done());

// 处理 session 存储
async function handleSession(key, successMsg, session) {
  if ($.setdata(JSON.stringify(session), key)) {
    $.log(successMsg);
    $.msg($.name, successMsg);
  } else {
    $.log(`🔴${successMsg.replace("成功", "失败")}`);
    $.log(session);
    $.msg($.name, `🔴${successMsg.replace("成功", "失败")}`);
  }
}

// Env 类优化
function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.startTime = Date.now();
      this.logs = [];
      this.isMute = false;
      this.logSeparator = "\n";
      this.log(`🔔${this.name}, 开始!`);
    }

    log(...args) {
      this.logs.push(...args);
      console.log(args.join(this.logSeparator));
    }

    logErr(e) {
      this.log(`❗️${this.name}, 错误!`, e.stack || e);
    }

    done() {
      const endTime = Date.now();
      this.log(`🔔${this.name}, 结束! 🕛 ${(endTime - this.startTime) / 1000} 秒`);
      $done();
    }

    getdata(key) {
      return this.isNode() ? process.env[key] : $prefs.valueForKey(key);
    }

    setdata(val, key) {
      if (this.isNode()) {
        process.env[key] = val;
        return true;
      }
      return $prefs.setValueForKey(val, key);
    }

    msg(title, subtitle = "", body = "", options = {}) {
      if (!this.isMute) {
        if (this.isNode()) {
          console.log(`📲${title}\n${subtitle}\n${body}`);
        } else {
          $notify(title, subtitle, body, options);
        }
      }
    }

    isNode() {
      return typeof module !== "undefined" && !!module.exports;
    }
  })(name);
}