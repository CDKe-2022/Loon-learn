/*
斗鱼每日签到（精准修正版）
Loon平台专用脚本
准确显示：总签到次数、本月签到、连续签到、经验值
已签到时不显示获得奖励
*/

// ==================== 配置区 ====================

// 从本地存储中读取斗鱼账号 cookie
const DY_COOKIE = {
  acf_auth: $persistentStore.read("douyu_acf_auth"),
  acf_uid: $persistentStore.read("douyu_acf_uid"),
  install_id: $persistentStore.read("douyu_install_id"),
  ttreq: $persistentStore.read("douyu_ttreq")
};

// 固定参数
const DEVICE_ID = "d2699126c76fbe037a3cb50200001621";
const USER_TOKEN = "160153378_11_e79954d2d6e04f51_2_90552255";

// 是否开启通知
const ENABLE_NOTIFICATION = true;

// ==================== 工具函数 ====================

// 构造 Cookie 字符串（非关键字段允许为空）
function buildCookieString() {
    return `acf_auth=${DY_COOKIE.acf_auth || ''}; acf_uid=${DY_COOKIE.acf_uid || ''}; install_id=${DY_COOKIE.install_id || ''}; ttreq=${DY_COOKIE.ttreq || ''}`;
}

// 请求参数构造
function makeRequest(url, body) {
    return {
        url: url.trim(),
        headers: {
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "X-Requested-With": "XMLHttpRequest",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
            "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
            "Origin": "https://apiv2.douyucdn.cn",
            "Cookie": buildCookieString()
        },
        body,
        timeout: 10000
    };
}

// Promise 封装
function requestWithPromise(params) {
    return new Promise((resolve, reject) => {
        $httpClient.post(params, (err, response, data) => {
            if (err) {
                reject(new Error(`网络请求失败: ${err}`));
                return;
            }
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                reject(new Error(`响应解析失败: ${e.message}`));
            }
        });
    });
}

// ==================== 展示逻辑 ====================

function formatSignMessage(signData, status) {
    const today = signData?.sign_today || new Date().toISOString().split("T")[0];
    const addedFishBall = signData?.sign_siln || 0;
    const addedExp = signData?.sign_exp || 0;
    const continuousDays = signData?.sign_rd || 0;
    const totalSignDays = signData?.sign_sum || 0;
    const monthSignDays = signData?.sign_md || 0;
    const totalExp = signData?.sign_exps || 0;

    let result = { title: "", subtitle: "", message: "" };

    switch (status) {
        case "success":
            result.title = "斗鱼签到成功";
            result.subtitle = `+${addedFishBall}鱼丸 +${addedExp}经验`;
            result.message =
                `✅ 斗鱼签到成功！\n\n` +
                `📅 签到日期: ${today}\n` +
                `🥏 本次获得: ${addedFishBall} 鱼丸\n` +
                `⭐ 本次获得: ${addedExp} 经验值\n` +
                `🔥 连续签到: ${continuousDays} 天\n` +
                `📅 本月签到: ${monthSignDays} 天\n` +
                `📊 总签到次数: ${totalSignDays} 次\n` +
                `📈 总经验值: ${totalExp}`;
            break;

        case "already_signed":
            result.title = "斗鱼签到状态";
            result.subtitle = `已连续签到 ${continuousDays} 天`;
            result.message =
                `ℹ️ 今日已签到\n\n` +
                `🔥 连续签到: ${continuousDays} 天\n` +
                `📅 本月签到: ${monthSignDays} 天\n` +
                `📊 总签到次数: ${totalSignDays} 次\n` +
                `📈 总经验值: ${totalExp}`;
            break;

        case "already_signed_unknown":
            result.title = "斗鱼签到状态";
            result.subtitle = "已签到（状态获取失败）";
            result.message =
                `⚠️ 今日已签到，但未能获取详细状态\n\n` +
                `📅 日期: ${today}\n` +
                `请稍后再试`;
            break;

        default:
            result.title = "斗鱼签到失败";
            result.subtitle = "状态未知";
            result.message =
                `❌ 签到状态未知\n\n` +
                `📅 日期: ${today}\n` +
                `可能是网络异常或 Cookie 失效`;
    }

    return result;
}

function notify({ title, subtitle, message }) {
    console.log(message);
    if (ENABLE_NOTIFICATION) {
        $notification.post(title, subtitle, message);
    }
}

// ==================== 核心业务 ====================

// 查询签到状态
async function getSignInfo() {
    try {
        const resp = await requestWithPromise(
            makeRequest(
                "https://apiv2.douyucdn.cn/h5nc/sign/getSign",
                `token=${USER_TOKEN}`
            )
        );
        return resp.error === "0" ? resp.data : null;
    } catch {
        return null;
    }
}

// 执行签到
async function doSign() {
    try {
        const resp = await requestWithPromise(
            makeRequest(
                "https://apiv2.douyucdn.cn/h5nc/sign/sendSign",
                `client_sys=ios&did=${DEVICE_ID}&token=${USER_TOKEN}`
            )
        );

        if (resp.error === "0") return { status: "success", data: resp.data };
        if (resp.error === "6305") return { status: "already_signed" };

        return { status: "fail" };
    } catch {
        return { status: "fail" };
    }
}

// ==================== 主流程 ====================

async function main() {
    if (!DY_COOKIE.acf_auth) {
        notify({
            title: "斗鱼签到失败",
            subtitle: "",
            message: "❌ 未检测到 acf_auth，请先运行抓 Cookie 脚本"
        });
        return;
    }

    const signResult = await doSign();

    if (signResult.status === "success") {
        notify(formatSignMessage(signResult.data, "success"));
        return;
    }

    if (signResult.status === "already_signed") {
        const info = await getSignInfo();
        notify(
            info
                ? formatSignMessage(info, "already_signed")
                : formatSignMessage({}, "already_signed_unknown")
        );
        return;
    }

    const info = await getSignInfo();
    notify(
        info
            ? formatSignMessage(info, "already_signed")
            : formatSignMessage({}, "fail")
    );
}

// ==================== 执行入口 ====================

main().finally(() => $done());