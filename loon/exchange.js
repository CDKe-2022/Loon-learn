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

// 记录程序启动日志
$.log("程序启动，开始获取汇率数据");

// 发起HTTP GET请求，获取当前基准货币的汇率数据
$.http.get({
    url: "https://api.exchangerate-api.com/v4/latest/CNY" // 汇率API的URL
})
    .then((response) => {
        // 记录请求完成日志
        $.log("HTTP请求完成，开始解析数据");

        // 解析响应数据
        const data = JSON.parse(response.body);
        $.log(`数据解析成功，基准货币：${base}, 日期：${data.date}`);

        // 获取基准货币的信息
        const source = currencyNames[base];

        // 生成其他货币的汇率信息
        const info = Object.keys(currencyNames).reduce((accumulator, key) => {
            let line = "";
            // 排除基准货币，并检查数据中是否有该货币的汇率
            if (key !== base && data.rates.hasOwnProperty(key)) {
                // 获取汇率并转为浮点数
                const rate = parseFloat(data.rates[key]);
                // 获取目标货币的信息
                const target = currencyNames[key];
                $.log(`汇率计算中：1 ${source[0]} = ${rate} ${target[0]}`);

                // 汇率大于1时，表示1单位基准货币可兑换多少目标货币
                if (rate > 1) {
                    line = `${target[1]} 1${source[0]}兑${roundNumber(rate, digits)}${target[0]}\n`;
                } else {
                    // 汇率小于1时，表示1单位目标货币可兑换多少基准货币
                    line = `${target[1]} 1${target[0]}兑${roundNumber(1 / rate, digits)}${source[0]}\n`;
                }
            }
            // 累加汇率信息
            return accumulator + line;
        }, "");

        // 记录汇率信息生成日志
        $.log("汇率信息生成完成，开始发送通知");

        // 发送通知，展示汇率信息
        $.notify(
            `[今日汇率] 基准：${source[1]} ${source[0]}`,
            `⏰ 更新时间：${data.date}`,
            `📈 汇率情况：\n${info}`
        );
    })
    .then(() => {
        // 记录完成日志
        $.log("通知发送完成，程序结束");
        $.done(); // 请求完成后，调用.done()结束
    });

// 辅助函数：用于对数字进行四舍五入处理
function roundNumber(num, scale) {
    if (!("" + num).includes("e")) {
        // 如果数字不包含科学计数法表示，直接四舍五入
        return +(Math.round(num + "e+" + scale) + "e-" + scale);
    } else {
        // 如果数字包含科学计数法表示，处理后再四舍五入
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
    const e = "undefined" != typeof $task, // 是否为Quantumult X
        t = "undefined" != typeof $loon, // 是否为Loon
        s = "undefined" != typeof $httpClient && !t, // 是否为Surge
        i = "function" == typeof require && "undefined" != typeof $jsbox; // 是否为JSBox
    return {
        isQX: e, // Quantumult X 环境
        isLoon: t, // Loon 环境
        isSurge: s, // Surge 环境
        isNode: "function" == typeof require && !i, // Node.js 环境
        isJSBox: i, // JSBox 环境
        isRequest: "undefined" != typeof $request, // 是否为HTTP请求环境
        isScriptable: "undefined" != typeof importModule // 是否为Scriptable环境
    };
}

// 辅助函数：提供HTTP请求的封装
function HTTP(e = { baseURL: "" }) {
    const { isQX: t, isLoon: s, isSurge: i, isScriptable: n, isNode: o } = ENV();
    const r = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/;
    const u = {};

    // 遍历HTTP方法，创建HTTP请求方法（GET, POST, 等）
    ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"].forEach(l => u[l.toLowerCase()] = (u =>
        (function(u, l) {
            // 如果传入的是字符串，则包装为对象
            l = "string" == typeof l ? { url: l } : l;
            const h = e.baseURL;
            h && !r.test(l.url || "") && (l.url = h ? h + l.url : l.url);
            const a = (l = { ...e, ...l }).timeout;
            const c = { onRequest: () => {}, onResponse: e => e, onTimeout: () => {}, ...l.events };
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