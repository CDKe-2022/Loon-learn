const $ = new Env("起点读书");
$.taskId = $.getdata("qd_taskId");
$.taskId_2 = $.getdata("qd_taskId_2");

!(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers,
  };
  $.log(JSON.stringify(session));

  if (session.body.includes($.taskId)) {
    if ($.setdata(JSON.stringify(session), "qd_session")) {
      $.msg($.name, "🎉广告1信息获取成功!");
    } else {
      $.msg($.name, "🔴广告1信息获取失败!");
    }
  } else if (session.body.includes($.taskId_2)) {
    if ($.setdata(JSON.stringify(session), "qd_session_2")) {
      $.msg($.name, "🎉广告2信息获取成功!");
    } else {
      $.msg($.name, "🔴广告2信息获取失败!");
    }
  } else {
    $.msg($.name, "🔴广告信息获取失败!");
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done());

function Env(name) {
  return new (class {
    constructor(name) {
      this.name = name;
      this.logs = [];
      this.startTime = Date.now();
      this.log("", `🔔${this.name}, 开始!`);
    }
    getdata(key) {
      return $persistentStore.read(key);
    }
    setdata(val, key) {
      return $persistentStore.write(val, key);
    }
    msg(title, subtitle = "", content = "") {
      $notification.post(title, subtitle, content);
    }
    log(...logs) {
      this.logs.push(...logs);
      console.log(logs.join(" "));
    }
    logErr(e) {
      this.log("", `❗️${this.name}, 错误!`, e);
    }
    done() {
      const end = (Date.now() - this.startTime) / 1000;
      this.log("", `🔔${this.name}, 结束! ⏱ ${end} 秒`);
      $done();
    }
  })(name);
}