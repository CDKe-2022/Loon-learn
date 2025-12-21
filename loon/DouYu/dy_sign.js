/*
斗鱼每日签到（精准修正版）
Loon平台专用脚本
准确显示：总签到次数、本月签到、连续签到、经验值
已签到时不显示获得奖励
*/

// ==================== 配置区 ====================

// 从本地存储中读取 acf_auth（由抓 Cookie 脚本写入）
const STORED_ACF_AUTH = $persistentStore.read("douyu_acf_auth");

// 你的斗鱼账号 cookie（除 acf_auth 外其余固定）
const DY_COOKIE = {
  acf_auth: $persistentStore.read("douyu_acf_auth"),
  acf_uid: $persistentStore.read("douyu_acf_uid"),
  install_id: $persistentStore.read("douyu_install_id"),
  ttreq: $persistentStore.read("douyu_ttreq")
};

// 设备ID（固定）
const DEVICE_ID = "d2699126c76fbe037a3cb50200001621";

// 用户token（固定）
const USER_TOKEN = "160153378_11_e79954d2d6e04f51_2_90552255";

// 是否开启通知
const ENABLE_NOTIFICATION = true;

// ==================== 脚本逻辑 ====================

const signUrl = "https://apiv2.douyucdn.cn/h5nc/sign/sendSign";
const getSignUrl = "https://apiv2.douyucdn.cn/h5nc/sign/getSign";

// 构造 Cookie 字符串
function buildCookieString() {
    return `acf_auth=${DY_COOKIE.acf_auth}; acf_uid=${DY_COOKIE.acf_uid}; install_id=${DY_COOKIE.install_id}; ttreq=${DY_COOKIE.ttreq}`;
}

// 校验 acf_auth 是否存在
function checkAcfAuth() {
    if (!DY_COOKIE.acf_auth) {
        const msg = "❌ 未读取到 acf_auth，请先运行抓 Cookie 脚本";
        console.log(msg);
        if (ENABLE_NOTIFICATION) {
            $notification.post("斗鱼签到失败", "", msg);
        }
        $done();
        return false;
    }
    return true;
}

// 查询签到状态
function getSignInfo(callback) {
    console.log("🔍 查询签到状态...");

    const params = {
        url: getSignUrl,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
            "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
            "Origin": "https://apiv2.douyucdn.cn",
            "Cookie": buildCookieString()
        },
        body: `token=${USER_TOKEN}`,
        timeout: 10000
    };

    $httpClient.post(params, function (err, response, data) {
        if (err) {
            console.log(`❌ 查询签到状态失败: ${err}`);
            callback(false, null);
            return;
        }
        try {
            const resp = JSON.parse(data);
            if (resp.error === "0") {
                console.log("✅ 查询签到状态成功");
                callback(true, resp.data);
            } else {
                console.log(`❌ 查询失败: ${resp.msg || "未知错误"} (${resp.error})`);
                callback(false, null);
            }
        } catch (e) {
            console.log(`❌ 响应解析失败: ${e.message}`);
            callback(false, null);
        }
    });
}

// 执行签到
function doSign(callback) {
    console.log("📱 开始执行斗鱼签到...");

    const params = {
        url: signUrl,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
            "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
            "Origin": "https://apiv2.douyucdn.cn",
            "Cookie": buildCookieString()
        },
        body: `client_sys=ios&did=${DEVICE_ID}&token=${USER_TOKEN}`,
        timeout: 10000
    };

    $httpClient.post(params, function (err, response, data) {
        if (err) {
            callback(false, null, "network_error");
            return;
        }
        try {
            const resp = JSON.parse(data);
            if (resp.error === "0") {
                callback(true, resp.data, "success");
            } else if (resp.error === "6305") {
                callback(false, null, "already_signed");
            } else {
                callback(false, null, resp.error);
            }
        } catch (e) {
            callback(false, null, "parse_error");
        }
    });
}

// 显示签到结果
function showSignResult(isSigned, data, type) {
    const today = data?.sign_today || new Date().toISOString().split("T")[0];
    const msg =
        `📅 今日: ${today}\n` +
        `🔥 连续签到: ${data?.sign_rd || 0} 天\n` +
        `📅 本月签到: ${data?.sign_md || 0} 天\n` +
        `📊 总签到次数: ${data?.sign_sum || 0} 次\n` +
        `📈 总经验值: ${data?.sign_exps || 0}`;

    console.log(msg);
    if (ENABLE_NOTIFICATION) {
        $notification.post("斗鱼签到状态", "", msg);
    }
}

// 主流程
function main() {
    doSign(function (success, data, status) {
        if (success) {
            showSignResult(true, data, "success");
            $done();
        } else if (status === "already_signed") {
            getSignInfo(function (ok, info) {
                showSignResult(false, ok ? info : {}, "already_signed");
                $done();
            });
        } else {
            getSignInfo(function (ok, info) {
                showSignResult(false, ok ? info : {}, "check");
                $done();
            });
        }
    });
}

// ==================== 执行入口 ====================

if (!USER_TOKEN) {
    console.log("❌ USER_TOKEN 未配置");
    $done();
} else if (!checkAcfAuth()) {
    // acf_auth 缺失，已处理
} else {
    main();
}