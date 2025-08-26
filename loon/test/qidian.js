const $ = new Env("起点读书");

// 配置参数
$.taskId = $.getdata("qd_taskId");
$.taskId_2 = $.getdata("qd_taskId_2");
$.session = $.getdata("qd_session");
$.session_2 = $.getdata("qd_session_2");
$.timeout = $.getdata("qd_timeout") || 20;

// 参数检查
function checkParam(name, value) {
  if (!value) {
    $.log(`⚠️${name}信息不全! 请通过重写获取信息`);
    $.msg($.name, `⚠️${name}信息不全!`, "请通过重写获取信息");
  }
}
checkParam("任务1", $.taskId);
checkParam("任务2", $.taskId_2);
checkParam("广告1", $.session);
checkParam("广告2", $.session_2);

// 主流程
(async () => {
  for (let i = 0; i < 7; i++) {
    $.log(`🟡任务1执行次数: ${i + 1}`);
    await task($.session);
    await $.wait($.timeout * 1000);
  }
  for (let j = 0; j < 2; j++) {
    $.log(`🟡任务2执行次数: ${j + 1}`);
    await task($.session_2);
    await $.wait($.timeout * 1000);
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => {
    $.log("✅执行完成");
    $.done();
  });

// 任务函数
async function task(session) {
  let options = JSON.parse(session);
  return $.http.post(options).then((resp) => {
    let obj = JSON.parse(resp.body || "{}");
    if (obj.Result == 0) {
      $.log("🎉成功!");
    } else {
      $.log("🔴失败!");
      $.log(resp.body);
    }
  });
}

// ================== Loon 精简环境 ==================
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
    http = {
      get: (t) =>
        new Promise((res, rej) =>
          this.get(t, (err, resp) => (err ? rej(err) : res(resp)))
        ),
      post: (t) =>
        new Promise((res, rej) =>
          this.post(t, (err, resp) => (err ? rej(err) : res(resp)))
        ),
    };
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