// 设置基准货币，可以改成其他币种
const base = "CNY";

// 保留几位有效数字，用于格式化汇率
const digits = 3;

// 初始化API对象，用于请求汇率数据
const $ = API("exchange");

// 货币名称和对应的国旗图标
const currencyNames = {
    CNY: ["人民币", "🇨🇳"],
    USD: ["美元", "🇺🇸"],
    EUR: ["欧元", "🇪🇺"],
    GBP: ["英镑", "🇬🇧"],
    HKD: ["港币", "🇭🇰"],
    JPY: ["日元", "🇯🇵"],
    KRW: ["韩元", "🇰🇷"],
    THB: ["泰铢", "🇹🇭"],
    RUB: ["卢布", "🇷🇺"],
    VND: ["越南盾", "🇻🇳"],
    TWD: ["新台币", "🇨🇳"],
    TRY: ["土耳其里拉", "🇹🇷"],
    ZWL: ["津巴布韦币", "🇿🇼"],
    MYR: ["马来西亚林吉特", "🇲🇾"],
};

// 发起HTTP GET请求，获取当前基准货币的汇率数据
fetchExchangeRates(base)
    .then(data => processExchangeRates(data))
    .catch(error => {
        const errorMessage = `[错误] 获取汇率失败 - 原因：${error.message}`;
        $.notify(`[错误]`, `获取汇率失败`, `原因：${error.message}`);
        console.error(errorMessage);
    })
    .finally(() => $.done());

// 获取汇率数据
function fetchExchangeRates(baseCurrency) {
    const url = `https://api.exchangerate-api.com/v4/latest/${baseCurrency}`;
    return $.http.get({ url })
        .then(response => JSON.parse(response.body))
        .catch(error => {
            throw new Error("API请求失败，请检查网络连接或API地址是否正确。");
        });
}

// 处理并通知汇率信息
function processExchangeRates(data) {
    const source = currencyNames[base];
    const info = Object.keys(currencyNames).reduce((accumulator, key) => {
        if (key !== base && data.rates.hasOwnProperty(key)) {
            const rate = parseFloat(data.rates[key]);
            const target = currencyNames[key];
            return accumulator + formatExchangeRate(rate, source, target);
        }
        return accumulator;
    }, "");

    const title = `[今日汇率] 基准：${source[1]} ${source[0]}`;
    const subtitle = `⏰ 更新时间：${data.date}`;
    const message = `📈 汇率情况：\n${info}`;
    
    // 输出到日志
    console.log(`${title}\n${subtitle}\n${message}`);
    
    // 发送通知
    $.notify(title, subtitle, message);
}

// 格式化汇率信息
function formatExchangeRate(rate, source, target) {
    if (rate > 1) {
        return `${target[1]} 1${source[0]}兑${roundNumber(rate, digits)}${target[0]}\n`;
    } else {
        return `${target[1]} 1${target[0]}兑${roundNumber(1 / rate, digits)}${source[0]}\n`;
    }
}

// 辅助函数：用于对数字进行四舍五入处理
function roundNumber(num, scale) {
    if (!("" + num).includes("e")) {
        return +(Math.round(num + "e+" + scale) + "e-" + scale);
    } else {
        let arr = ("" + num).split("e");
        let sig = "";
        if (+arr[1] + scale > 0) {
            sig = "+";
        }
        return +(
            Math.round(+arr[0] + "e" + sig + (+arr[1] + scale)) +
            "e-" +
            scale
        );
    }
}

// 辅助函数：用于检测脚本运行环境并提供API支持
function ENV() {
    const e = "undefined" != typeof $task,
        t = "undefined" != typeof $loon,
        s = "undefined" != typeof $httpClient && !t,
        i = "function" == typeof require && "undefined" != typeof $jsbox;
    return {
        isQX: e,
        isLoon: t,
        isSurge: s,
        isNode: "function" == typeof require && !i,
        isJSBox: i,
        isRequest: "undefined" != typeof $request,
        isScriptable: "undefined" != typeof importModule
    };
}

// 辅助函数：提供HTTP请求的封装
function HTTP(e = { baseURL: "" }) {
    const { isQX: t, isLoon: s, isSurge: i, isScriptable: n, isNode: o } = ENV();
    const r = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/;
    const u = {};

    // 遍历HTTP方法，创建HTTP请求方法（GET, POST, 等）
    ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(l => u[l.toLowerCase()] = (u =>
        (function (u, l) {
            l = "string" == typeof l ? { url: l } : l;
            const h = e.baseURL;
            h && !r.test(l.url || "") && (l.url = h ? h + l.url : l.url);
            const a = (l = { ...e, ...l }).timeout;
            const c = { onRequest: () => { }, onResponse: e => e, onTimeout: () => { }, ...l.events };
            let f, d;

            // 请求处理流程，针对不同环境进行请求处理
            if (c.onRequest(u, l), t)
                f = $task.fetch({ method: u, ...l });
            else if (s || i || o)
                f = new Promise((e, t) => {
                    (o ? require("request") : $httpClient)[u.toLowerCase()](l, (s, i, n) => {
                        s ? t(s) : e({ statusCode: i.status || i.statusCode, headers: i.headers, body: n })
                    })
                });
            else if (n) {
                const e = new Request(l.url);
                e.method = u, e.headers = l.headers, e.body = l.body;
                f = new Promise((t, s) => {
                    e.loadString().then(s => { t({ statusCode: e.response.statusCode, headers: e.response.headers, body: s }) }).catch(e => s(e))
                })
            }
            const p = a ? new Promise((e, t) => { d = setTimeout(() => (c.onTimeout(), t(`${u} URL: ${l.url} exceeds the timeout ${a} ms`)), a) }) : null;
            return (p ? Promise.race([p, f]).then(e => (clearTimeout(d), e)) : f).then(e => c.onResponse(e));
        })(l, u))
    );

    return u;
}

// 辅助函数：API封装，用于管理脚本环境、缓存、日志和通知等
function API(e = "untitled", t = !1) {
    const { isQX: s, isLoon: i, isSurge: n, isNode: o, isJSBox: r, isScriptable: u } = ENV();
    return new class {
        constructor(e, t) {
            this.name = e;
            this.debug = t;
            this.http = HTTP();
            this.env = ENV();
            this.node = (() => {
                if (o) {
                    return { fs: require("fs") };
                }
                return null;
            })();
            this.initCache();
            Promise.prototype.delay = function (e) {
                return this.then(function (t) {
                    return ((e, t) => new Promise(function (s) { setTimeout(s.bind(null, t), e) }))(e, t)
                })
            }
        }

        // 初始化缓存，根据环境选择合适的存储方式
        initCache() {
            if (s && (this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}")),
                (i || n) && (this.cache = JSON.parse($persistentStore.read(this.name) || "{}")),
                o) {
                let e = "root.json";
                this.node.fs.existsSync(e) || this.node.fs.writeFileSync(e, JSON.stringify({}), { flag: "wx" }, e => console.log(e)),
                    this.root = {},
                    e = `${this.name}.json`,
                    this.node.fs.existsSync(e) ? this.cache = JSON.parse(this.node.fs.readFileSync(e)) : this.cache = this.root;
            }
        }

        // 发送通知并输出到日志
        notify(title, subtitle = '', message = '') {
            // 输出到日志
            console.log(`${title}\n${subtitle}\n${message}`);

            if (s) $notify(title, subtitle, message);
            if (i || n) $notification.post(title, subtitle, message);
            if (u) importModule("Notification").post(title, subtitle, message);
            if (o) console.log(`${title}\n${subtitle}\n${message}`);
        }

        // 结束脚本执行
        done() {
            if (s || i || n) $done();
            if (u) Script.complete();
            if (o) console.log("Done");
        }
    }(e, t);
}