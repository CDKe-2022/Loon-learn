/* 
脚本功能: 获取 起点读书 任务信息
操作步骤: 我 --> 福利中心 

[rewrite local]
https\:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body https://raw.githubusercontent.com/MCdasheng/QuantumultX/main/Scripts/myScripts/qidian/qidian.taskId.js

[MITM]
hostname = h5.if.qidian.com

*/

// 创建一个名为 "起点读书" 的环境
const $ = new Env("起点读书");

// 解析返回的 JSON 数据
var obj = JSON.parse($response.body);

// 提取 DailyBenefitModule 模块中的任务ID
var a = obj.Data.DailyBenefitModule.TaskList[0].TaskId;  // 第一个任务的 ID
var b = obj.Data.DailyBenefitModule.TaskList[1].TaskId;  // 第二个任务的 ID
var c;  // 用于存储额外任务的 TaskId

// 遍历 SurpriseBenefitModule 模块中的任务列表，查找特定标题的任务
for (var i = 0; i < obj.Data.SurpriseBenefitModule.TaskList.length; i++) {
  // 如果任务标题为 "额外看3次小视频得奖励"
  if (obj.Data.SurpriseBenefitModule.TaskList[i].Title == "额外看3次小视频得奖励") {
    // 获取该任务的 TaskId，并保存
    c = obj.Data.SurpriseBenefitModule.TaskList[i].TaskId;
    // 将 TaskId 存储到本地数据中，键为 "qd_taskId_2"
    $.setdata(c, "qd_taskId_2");
    break;  // 找到目标任务后退出循环
  } else {
    continue;  // 如果不是目标任务，则继续遍历
  }
}

// 检查任务 ID 是否有效
if ((a = b) && c) {
  // 如果 a 和 b 是相等的并且 c 存在，说明任务信息获取成功
  $.setdata(a, "qd_taskId");  // 将 TaskId 存储到本地数据中，键为 "qd_taskId"
  $.log(`🎉任务信息获取成功!`);  // 输出任务获取成功的日志
  $.log(`taskId_2: ${a}`);  // 输出任务ID a
  $.log(`taskId_2: ${c}`);  // 输出任务ID c
  // 发送成功的通知
  $.msg($.name, `🎉任务信息获取成功!`, `可以禁用脚本`);
  $.done();  // 脚本执行完毕
} else {
  // 如果任务信息获取失败，输出失败的日志并通知用户
  $.log("🔴任务信息获取失败!");  
  $.log($response.body);  // 输出原始返回的响应数据，便于调试
  $.msg($.name, "🔴任务信息获取失败!");  // 发送失败通知
  $.done();  // 脚本执行完毕
}

// 定义一个 Env 类，封装操作方法
function Env(t, s) {
  class e {
    constructor(t) {
      this.env = t;
    }
    // 发送 GET 请求
    send(t, s = "GET") {
      t = "string" == typeof t ? { url: t } : t;
      let e = this.get;
      return (
        "POST" === s && (e = this.post),  // 如果是 POST 请求，使用 post 方法
        new Promise((s, i) => {
          e.call(this.env, t, (t, e, r) => {
            t ? i(t) : s(e);  // 请求成功，返回响应数据；失败则返回错误信息
          });
        })
      );
    }
    // GET 请求方法
    get(t) {
      return this.send.call(this.env, t);
    }
    // POST 请求方法
    post(t) {
      return this.send.call(this.env, t, "POST");
    }
  }
  return new (class {
    constructor(t, s) {
      this.name = t,
      this.http = new e(this),
      this.data = null,
      this.dataFile = "box.dat",  // 本地存储的文件名
      this.logs = [],
      this.isMute = !1,
      this.isNeedRewrite = !1,
      this.logSeparator = "\n",
      this.encoding = "utf-8",
      this.startTime = new Date().getTime(),
      Object.assign(this, s),
      this.log("", `\ud83d\udd14${this.name}, \u5f00\u59cb!`);  // 日志输出启动信息
    }

    // 判断当前环境是否为 Node.js
    isNode() {
      return "undefined" != typeof module && !!module.exports;
    }
    // 判断是否为 Quantumult X 环境
    isQuanX() {
      return "undefined" != typeof $task;
    }
    // 判断是否为 Surge 环境
    isSurge() {
      return "undefined" != typeof $environment && $environment["surge-version"];
    }
    // 判断是否为 Loon 环境
    isLoon() {
      return "undefined" != typeof $loon;
    }
    // 判断是否为 Shadowrocket 环境
    isShadowrocket() {
      return "undefined" != typeof $rocket;
    }
    // 判断是否为 Stash 环境
    isStash() {
      return "undefined" != typeof $environment && $environment["stash-version"];
    }

    // 将 JSON 字符串解析为对象
    toObj(t, s = null) {
      try {
        return JSON.parse(t);
      } catch {
        return s;  // 如果解析失败，返回默认值
      }
    }

    // 将对象转化为 JSON 字符串
    toStr(t, s = null) {
      try {
        return JSON.stringify(t);
      } catch {
        return s;  // 如果转化失败，返回默认值
      }
    }

    // 获取本地存储中的 JSON 数据
    getjson(t, s) {
      let e = s;
      const i = this.getdata(t);
      if (i)
        try {
          e = JSON.parse(this.getdata(t));  // 解析存储的 JSON 数据
        } catch {}
      return e;
    }

    // 将对象存储为 JSON 数据
    setjson(t, s) {
      try {
        return this.setdata(JSON.stringify(t), s);  // 将对象转化为 JSON 字符串并存储
      } catch {
        return !1;
      }
    }

    // 获取脚本
    getScript(t) {
      return new Promise((s) => {
        this.get({ url: t }, (t, e, i) => s(i));  // 请求脚本并返回响应
      });
    }

    // 运行脚本
    runScript(t, s) {
      return new Promise((e) => {
        let i = this.getdata("@chavy_boxjs_userCfgs.httpapi");
        i = i ? i.replace(/\n/g, "").trim() : i;
        let r = this.getdata("@chavy_boxjs_userCfgs.httpapi_timeout");
        r = r ? 1 * r : 20;
        r = s && s.timeout ? s.timeout : r;
        const [o, h] = i.split("@"),
          a = {
            url: `http://${h}/v1/scripting/evaluate`,
            body: { script_text: t, mock_type: "cron", timeout: r },
            headers: { "X-Key": o, Accept: "*/*" },
            timeout: r,
          };
        this.post(a, (t, s, i) => e(i));  // 执行脚本并返回结果
      }).catch((t) => this.logErr(t));
    }

    // 读取本地存储的数据
    loaddata() {
      if (!this.isNode()) return {};
      {
        (this.fs = this.fs ? this.fs : require("fs")),
          (this.path = this.path ? this.path : require("path"));
        const t = this.path.resolve(this.dataFile),
          s = this.path.resolve(process.cwd(), this.dataFile),
          e = this.fs.existsSync(t),
          i = !e && this.fs.existsSync(s);
        if (!e && !i) return {};  // 如果文件不存在，返回空对象
        {
          const i = e ? t : s;
          try {
            return JSON.parse(this.fs.readFileSync(i));  // 解析文件中的 JSON 数据
          } catch (t) {
            return {};  // 如果解析失败，返回空对象
          }
        }
      }
    }

    // 写入数据到本地存储
    writedata() {
      if (this.isNode()) {
        (this.fs = this.fs ? this.fs : require("fs")),
          (this.path = this.path ? this.path : require("path"));
        const t = this.path.resolve(this.dataFile),
          s = this.path.resolve(process.cwd(), this.dataFile),
          e = this.fs.existsSync(t),
          i = !e && this.fs.existsSync(s),
          r = JSON.stringify(this.data);
        e
          ? this.fs.writeFileSync(t, r)  // 如果文件存在，写入文件
          : i
          ? this.fs.writeFileSync(s, r)  // 如果文件在其他目录存在，写入该目录
          : this.fs.writeFileSync(t, r);  // 写入数据
      }
    }

    // 日志输出方法
    log(...t) {
      this.logs = [...this.logs, ...t];
      this.isMute || console.log(...t);  // 如果不是静音模式，输出日志
    }

    // 错误日志输出
    logErr(t) {
      this.log("", `❗️${this.name}, \u9519\u8bef!`, t);
    }

    // 获取本地存储的数据
    getdata(t) {
      let s = this.data && this.data[t] ? this.data[t] : null;
      return s;
    }

    // 将数据存储到本地
    setdata(t, s) {
      return (this.data[s] = t), this.writedata(), t;
    }

    // 发送通知
    msg(t, s, e) {
      if (this.isMute) return;
      if (this.isQuanX()) {
        $notify(t, s, e);
      } else {
        if (this.isSurge() || this.isLoon()) {
          $notification.post(t, s, e);
        }
      }
    }

    // 脚本执行完毕
    done() {
      const t = new Date().getTime();
      this.log("", `\u2705${this.name}, \u5b8c\u6210!`);
    }
  })(t);
}
