/*
斗鱼每日签到（精准修正版）
Loon平台专用脚本
准确显示：总签到次数、本月签到、连续签到、经验值
已签到时不显示获得奖励
*/

// ==================== 配置区（需要你根据实际情况修改）====================

// 你的斗鱼账号cookie信息（从抓包中获取，替换下面的示例值）
const DY_COOKIE = {
    acf_auth: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbiI6IjE2MDE1MzM3OF8xMV9kYjZlY2JmNTM5YTFkOGNmXzJfOTA1NTIyNTUiLCJ1aWQiOiIxNjAxNTMzNzgiLCJ0aW1lIjoxNzY2MTk3Mzg0fQ.CvpvmlK1LaQvQGn_T8l_60ZIxrNtLpHrJmg0M8_N77A", // 替换为你的实际值
    acf_uid: "160153378", // 替换为你的实际值
    install_id: "7408064071515282189", // 替换为你的实际值
    ttreq: "1$459d6e7caf8664972ff2f91b8cdb0c08a1b691b7" // 替换为你的实际值
};

// 设备ID（从请求体中获取，替换为你的实际值）
const DEVICE_ID = "d2699126c76fbe037a3cb50200001621";

// 用户token（从请求体中获取，替换为你的实际值）
const USER_TOKEN = "160153378_11_e79954d2d6e04f51_2_90552255";

// 是否开启通知（true为开启，false为关闭）
const ENABLE_NOTIFICATION = true;

// ==================== 脚本逻辑 ====================

const signUrl = "https://apiv2.douyucdn.cn/h5nc/sign/sendSign"; // 签到API
const getSignUrl = "https://apiv2.douyucdn.cn/h5nc/sign/getSign"; // 查询签到状态API

// 构造cookie字符串
function buildCookieString() {
    return `acf_auth=${DY_COOKIE.acf_auth}; acf_uid=${DY_COOKIE.acf_uid}; install_id=${DY_COOKIE.install_id}; ttreq=${DY_COOKIE.ttreq}`;
}

// 查询签到状态
function getSignInfo(callback) {
    console.log("🔍 查询签到状态...");
    
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
        "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
        "Origin": "https://apiv2.douyucdn.cn",
        "Cookie": buildCookieString()
    };
    
    const body = `token=${USER_TOKEN}`;
    
    const params = {
        url: getSignUrl,
        headers: headers,
        body: body,
        timeout: 10000
    };
    
    $httpClient.post(params, function(err, response, data) {
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
                console.log(`❌ 查询签到状态失败: ${resp.msg || '未知错误'} (错误码: ${resp.error})`);
                callback(false, null);
            }
        } catch (parseError) {
            console.log(`❌ 响应解析失败: ${parseError.message}`);
            callback(false, null);
        }
    });
}

// 签到主函数
function doSign(callback) {
    console.log("📱 开始执行斗鱼签到...");
    
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
        "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
        "Origin": "https://apiv2.douyucdn.cn",
        "Cookie": buildCookieString()
    };
    
    const body = `client_sys=ios&did=${DEVICE_ID}&token=${USER_TOKEN}`;
    
    const params = {
        url: signUrl,
        headers: headers,
        body: body,
        timeout: 10000
    };
    
    $httpClient.post(params, function(err, response, data) {
        if (err) {
            console.log(`❌ 签到请求失败: ${err}`);
            callback(false, null, "network_error");
            return;
        }
        
        try {
            const resp = JSON.parse(data);
            console.log("📱 签到响应:", JSON.stringify(resp));
            
            if (resp.error === "0") {
                console.log("✅ 斗鱼签到成功");
                callback(true, resp.data, "success");
            } 
            else if (resp.error === "6305") {
                console.log("ℹ️ 今日已签到，准备查询详细状态");
                callback(false, null, "already_signed");
            }
            else {
                console.log(`❌ 斗鱼签到失败: ${resp.msg || '未知错误'} (错误码: ${resp.error})`);
                callback(false, null, resp.error);
            }
        } catch (parseError) {
            console.log(`❌ 响应解析失败: ${parseError.message}`);
            callback(false, null, "parse_error");
        }
    });
}

// 显示签到结果
function showSignResult(isSigned, signData, operationType) {
    let message = "";
    let title = "";
    let subtitle = "";
    
    const today = signData?.sign_today || new Date().toISOString().split('T')[0];
    const addedFishBall = signData?.sign_siln || 0;    // 今日获得鱼丸
    const addedExp = signData?.sign_exp || 0;          // 今日获得经验值
    const continuousDays = signData?.sign_rd || 0;     // 连续签到天数
    const totalSignDays = signData?.sign_sum || 0;     // 总签到次数（修正）
    const monthSignDays = signData?.sign_md || 0;      // 本月签到次数（修正）
    const totalExp = signData?.sign_exps || 0;         // 总经验值（修正）
    
    if (isSigned && operationType === "success") {
        // 签到成功 - 显示获得的奖励
        title = "斗鱼签到成功";
        subtitle = `+${addedFishBall}鱼丸 +${addedExp}经验`;
        message = `✅ 斗鱼签到成功！\n\n`;
        message += `📅 签到日期: ${today}\n`;
        message += `🥏 本次获得: ${addedFishBall} 鱼丸\n`;
        message += `⭐ 本次获得: ${addedExp} 经验值\n`;
        message += `🔥 连续签到: ${continuousDays} 天\n`;
        message += `📅 本月签到: ${monthSignDays} 天\n`;
        message += `📊 总签到次数: ${totalSignDays} 次\n`;
        message += `📈 总经验值: ${totalExp}`;
    } 
    else if (operationType === "already_signed") {
        // 已签到 - 不显示获得的奖励
        title = "斗鱼签到状态";
        subtitle = `已连续签到${continuousDays}天`;
        message = `ℹ️ 今日已签到\n\n`;
        message += `📅 今日签到: ${today}\n`;
        message += `🔥 连续签到: ${continuousDays} 天\n`;
        message += `📅 本月签到: ${monthSignDays} 天\n`;
        message += `📊 总签到次数: ${totalSignDays} 次\n`;
        message += `📈 总经验值: ${totalExp}`;
    }
    else {
        // 其他情况 - 显示当前状态
        title = "斗鱼签到状态";
        subtitle = `连续${continuousDays}天`;
        message = `📅 今日: ${today}\n`;
        message += `🔥 连续签到: ${continuousDays} 天\n`;
        message += `📅 本月签到: ${monthSignDays} 天\n`;
        message += `📊 总签到次数: ${totalSignDays} 次\n`;
        message += `📈 总经验值: ${totalExp}`;
    }
    
    console.log(message);
    if (ENABLE_NOTIFICATION) {
        $notification.post(title, subtitle, message);
    }
}

// 主流程控制
function main() {
    console.log("🚀 开始斗鱼签到流程...");
    
    // 第一步：尝试签到
    doSign(function(success, signData, status) {
        if (success) {
            // 签到成功，直接显示结果
            showSignResult(true, signData, "success");
            $done();
        } 
        else if (status === "already_signed") {
            // 已签到，查询详细状态
            getSignInfo(function(querySuccess, queryData) {
                if (querySuccess) {
                    showSignResult(false, queryData, "already_signed");
                } else {
                    // 查询失败，显示基本信息
                    const fallbackData = {
                        sign_today: new Date().toISOString().split('T')[0],
                        sign_siln: 0,
                        sign_exp: 0,
                        sign_rd: 0,
                        sign_sum: 0,
                        sign_md: 0,
                        sign_exps: 0
                    };
                    showSignResult(false, fallbackData, "query_failed");
                }
                $done();
            });
        }
        else {
            // 签到失败，尝试查询状态
            getSignInfo(function(querySuccess, queryData) {
                if (querySuccess) {
                    showSignResult(false, queryData, "check_status");
                } else {
                    const errorMsg = status === "network_error" ? "网络请求失败" : 
                                   status === "parse_error" ? "响应解析失败" : 
                                   `错误码: ${status}`;
                    
                    const message = `❌ 斗鱼签到失败！\n\n` +
                                  `错误信息: ${errorMsg}\n` +
                                  `建议检查cookie是否失效`;
                    
                    console.log(message);
                    if (ENABLE_NOTIFICATION) {
                        $notification.post("斗鱼签到失败", "", message);
                    }
                }
                $done();
            });
        }
    });
}

// ==================== 执行入口 ====================

// 检查必要配置
if (!DY_COOKIE || !USER_TOKEN) {
    console.log("❌ 配置错误：请检查DY_COOKIE、USER_TOKEN是否已正确设置");
    if (ENABLE_NOTIFICATION) {
        $notification.post("斗鱼签到配置错误", "", "请检查脚本配置是否正确设置");
    }
    $done();
} else {
    // 执行主流程
    main();
}