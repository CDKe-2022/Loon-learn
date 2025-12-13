/*
斗鱼每日签到（精准优化版）
Loon平台专用脚本
准确显示鱼丸、经验和连续签到天数
*/

// ==================== 配置区（需要你根据实际情况修改）====================

// 你的斗鱼账号cookie信息（从抓包中获取，替换下面的示例值）
const DY_COOKIE = {
    dy_cookie: "7f769bde26dec62456cda9d721239212", // 替换为你的实际值
    acf_auth: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbiI6IjE2MDE1MzM3OF8xMV9lNzk5NTRkMmQ2ZTA0ZjUxXzJfOTA1NTIyNTUiLCJ1aWQiOiIxNjAxNTMzNzgiLCJ0aW1lIjoxNzY1NTM5MDI5fQ.Fy-jmadBiDQOmKVZmkgdqOMhUibk5VaMEN3dvNvdpIM", // 替换为你的实际值
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

const signUrl = "https://apiv2.douyucdn.cn/h5nc/sign/sendSign";

// 构造cookie字符串
function buildCookieString() {
    return `dy_cookie=${DY_COOKIE.dy_cookie}; acf_auth=${DY_COOKIE.acf_auth}; acf_uid=${DY_COOKIE.acf_uid}; install_id=${DY_COOKIE.install_id}; ttreq=${DY_COOKIE.ttreq}`;
}

// 签到主函数
function doSign() {
    console.log("📱 开始执行斗鱼签到...");
    
    // 构造请求头
    const headers = {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
        "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
        "Origin": "https://apiv2.douyucdn.cn",
        "Cookie": buildCookieString()
    };
    
    // 构造请求体
    const body = `client_sys=ios&did=${DEVICE_ID}&token=${USER_TOKEN}`;
    
    // 构造请求参数
    const params = {
        url: signUrl,
        headers: headers,
        body: body,
        timeout: 10000 // 10秒超时
    };
    
    // 发送POST请求
    $httpClient.post(params, function(err, response, data) {
        if (err) {
            const message = `❌ 签到请求失败！\n\n错误详情: ${err}`;
            console.log(message);
            if (ENABLE_NOTIFICATION) {
                $notification.post("斗鱼签到异常", "", message);
            }
            $done();
            return;
        }
        
        try {
            // 解析响应数据
            const resp = JSON.parse(data);
            
            // 处理结果
            if (resp.error === "0") {
                const dataObj = resp.data;
                
                // 获取关键数据（根据你的反馈修正）
                const today = dataObj.sign_today || "今日";
                const addedFishBall = dataObj.sign_siln || 0; // 增加的鱼丸
                const addedExp = dataObj.sign_exp || 0;       // 增加的经验值
                const continuousDays = dataObj.sign_rd || 0;  // 连续签到天数（根据你的反馈）
                
                // 构建简洁准确的通知消息
                let message = `✅ 斗鱼签到成功！\n\n`;
                message += `📅 签到日期: ${today}\n`;
                message += `🥏 本次获得: ${addedFishBall} 鱼丸\n`;
                message += `⭐ 本次获得: ${addedExp} 经验值\n`;
                message += `🔥 连续签到: ${continuousDays} 天`;
                
                console.log(message);
                if (ENABLE_NOTIFICATION) {
                    $notification.post("斗鱼签到成功", `+${addedFishBall}鱼丸 +${addedExp}经验`, message);
                }
            } 
            else if (resp.error === "6305") {
                // 今日已签到的特殊处理
                const message = `ℹ️ 今日已签到\n\n` +
                              `今日签到已完成，无需重复签到\n` +
                              `请明天再来领取鱼丸和经验哦~`;
                
                console.log(message);
                if (ENABLE_NOTIFICATION) {
                    $notification.post("斗鱼签到提醒", "今日已签到", message);
                }
            }
            else {
                const errorMsg = resp.msg || "未知错误";
                const message = `❌ 斗鱼签到失败！\n\n` +
                              `错误信息: ${errorMsg}\n` +
                              `错误码: ${resp.error}`;
                
                console.log(message);
                if (ENABLE_NOTIFICATION) {
                    $notification.post("斗鱼签到失败", "", message);
                }
            }
        } catch (parseError) {
            const message = `❌ 响应解析失败！\n\n` +
                          `原始响应: ${data}\n` +
                          `错误详情: ${parseError.message}`;
            
            console.log(message);
            if (ENABLE_NOTIFICATION) {
                $notification.post("斗鱼签到解析失败", "", message);
            }
        }
        
        // 所有操作完成后释放资源
        $done();
    });
}

// ==================== 执行入口 ====================

// 检查必要配置
if (!DY_COOKIE || !DEVICE_ID || !USER_TOKEN) {
    console.log("❌ 配置错误：请检查DY_COOKIE、DEVICE_ID、USER_TOKEN是否已正确设置");
    if (ENABLE_NOTIFICATION) {
        $notification.post("斗鱼签到配置错误", "", "请检查脚本配置是否正确设置");
    }
    $done();
} else {
    // 执行签到
    doSign();
}