const $ = new Env("起点读书");

try {
  const obj = JSON.parse($response.body);
  const taskList = obj.Data.VideoBenefitModule.TaskList;
  const countdownTasks = obj.Data.CountdownBenefitModule.TaskList;

  const a = taskList[0]?.TaskId;
  const b = taskList[1]?.TaskId;
  let c = null;

  // Locate TaskId for the specific task title
  for (const task of countdownTasks) {
    if (task.Title === "额外看3次小视频得奖励") {
      c = task.TaskId;
      $.setdata(c, "qd_taskId_2");
      break;
    }
  }

  if (a && b && c) {
    $.setdata(a, "qd_taskId");
    $.log(`🎉任务信息获取成功!`);
    $.log(`taskId: ${a}`);
    $.log(`taskId_2: ${c}`);
    $.msg($.name, `🎉任务信息获取成功!`);
  } else {
    $.log("🔴任务信息获取失败!");
    $.log($response.body);
    $.msg($.name, "🔴任务信息获取失败!");
  }
} catch (e) {
  $.logErr(e);
  $.msg($.name, "🔴解析或任务信息获取失败!");
} finally {
  $.done();
}

function Env(name, opts = {}) {
  class Http {
    constructor(env) {
      this.env = env;
    }
    send(request, method = "GET") {
      request = typeof request === "string" ? { url: request } : request;
      return new Promise((resolve, reject) => {
        const fn = method === "POST" ? this.post : this.get;
        fn.call(this, request, (err, response, data) => {
          err ? reject(err) : resolve(response);
        });
      });
    }
    get(request) {
      return this.send(request);
    }
    post(request) {
      return this.send(request, "POST");
    }
  }

  return new (class {
    constructor(name, opts) {
      this.name = name;
      this.http = new Http(this);
      this.data = null;
      this.dataFile = "box.dat";
      this.logs = [];
      this.isMute = false;
      this.isNeedRewrite = false;
      this.logSeparator = "\n";
      this.encoding = "utf-8";
      this.startTime = new Date().getTime();
      Object.assign(this, opts);
      this.log(`🔔${this.name}, 开始!`);
    }

    // Environment checks
    isNode() {
      return typeof module !== "undefined" && !!module.exports;
    }
    isQuanX() {
      return typeof $task !== "undefined";
    }
    isSurge() {
      return typeof $environment !== "undefined" && $environment["surge-version"];
    }
    isLoon() {
      return typeof $loon !== "undefined";
    }
    isShadowrocket() {
      return typeof $rocket !== "undefined";
    }
    isStash() {
      return typeof $environment !== "undefined" && $environment["stash-version"];
    }

    // Data storage and retrieval
    getdata(key) {
      let value = this.getval(key);
      if (/^@/.test(key)) {
        const [, objKey, subKey] = /^@(.*?)\.(.*?)$/.exec(key);
        const objData = objKey ? this.getval(objKey) : "{}";
        try {
          value = JSON.parse(objData)[subKey] || value;
        } catch {}
      }
      return value;
    }
    setdata(val, key) {
      if (/^@/.test(key)) {
        const [, objKey, subKey] = /^@(.*?)\.(.*?)$/.exec(key);
        const objData = this.getval(objKey) || "{}";
        try {
          const obj = JSON.parse(objData);
          obj[subKey] = val;
          return this.setval(JSON.stringify(obj), objKey);
        } catch {
          return false;
        }
      } else {
        return this.setval(val, key);
      }
    }
    getval(key) {
      if (this.isSurge() || this.isLoon() || this.isQuanX() || this.isShadowrocket() || this.isStash()) {
        return $persistentStore.read(key);
      } else if (this.isNode()) {
        this.data = this.loaddata();
        return this.data[key];
      }
    }
    setval(val, key) {
      if (this.isSurge() || this.isLoon() || this.isQuanX() || this.isShadowrocket() || this.isStash()) {
        return $persistentStore.write(val, key);
      } else if (this.isNode()) {
        this.data = this.loaddata();
        this.data[key] = val;
        this.writedata();
        return true;
      }
    }

    // Node.js data management
    loaddata() {
      if (!this.isNode()) return {};
      const fs = require("fs");
      const path = require("path");
      const filePath = path.resolve(this.dataFile);
      if (fs.existsSync(filePath)) {
        try {
          return JSON.parse(fs.readFileSync(filePath));
        } catch {
          return {};
        }
      } else {
        return {};
      }
    }
    writedata() {
      if (this.isNode()) {
        const fs = require("fs");
        const path = require("path");
        const data = JSON.stringify(this.data || {});
        fs.writeFileSync(path.resolve(this.dataFile), data);
      }
    }

    // Notifications and logging
    msg(title = this.name, subtitle = "", message = "", url = null) {
      const openUrl = (url) => {
        if (!url) return undefined;
        return typeof url === "string" ? { "open-url": url } : url;
      };
      if (!this.isMute) {
        if (this.isSurge() || this.isLoon() || this.isShadowrocket() || this.isStash()) {
          $notification.post(title, subtitle, message, openUrl(url));
        } else if (this.isQuanX()) {
          $notify(title, subtitle, message, openUrl(url));
        }
      }
      this.log(`📣 ${title}\n${subtitle}\n${message}`);
    }
    log(...logs) {
      logs.forEach((log) => console.log(log));
      this.logs = this.logs.concat(logs);
    }
    logErr(err) {
      this.log(`❗️${this.name} Error:`, err.stack || err);
    }
    done(result = {}) {
      const endTime = new Date().getTime();
      const duration = (endTime - this.startTime) / 1000;
      this.log(`🔔${this.name}, 结束! 🕛 ${duration} 秒`);
      if (this.isSurge() || this.isLoon() || this.isShadowrocket() || this.isStash()) {
        $done(result);
      } else if (this.isNode()) {
        process.exit();
      }
    }
  })(name, opts);
}