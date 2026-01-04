// 小黑盒每日签到脚本 - 简化版
const STORE_KEY = "HEYBOX_COOKIE";
const scriptName = "小黑盒签到";
const heyboxId = "91715900"; // 你的固定ID

!(function() {
    // 读取保存的Cookie
    const cookie = $persistentStore.read(STORE_KEY);
    
    if (!cookie) {
        $notification.post(scriptName, "❌ 错误", "未获取到Cookie，请先打开小黑盒APP");
        $done();
        return;
    }
    
    // 生成动态参数
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateRandomString(32);
    const rnd = `${new Date().getHours()}%3A${generateRandomHex(8)}`;
    
    // 构造请求URL
    const url = `https://api.xiaoheihe.cn/task/sign_v3/get_sign_state?x_app=heybox&nonce=${nonce}&os_version=26.2&_time=${timestamp}&version=1.3.376&lang=zh-cn&os_type=iOS&device_id=FAE6C5C1-AD08-4126-880C-9ED2C0E304EC&hkey=5d9533f7&heybox_id=${heyboxId}&x_client_type=mobile&device_info=iPhone13Pro&_rnd=${rnd}&dw=390&x_os_type=iOS&time_zone=Asia/Shanghai`;
    
    // 设置请求头 - 使用完整的Cookie
    const headers = {
        "Cookie": cookie,
        "User-Agent": "xiaoheihe/1.3.376 (com.max.xiaoheihe; build:1667; iOS 26.2.0) Alamofire/5.9.0",
        "Accept": "*/*",
        "Accept-Language": "zh-Hans-GB;q=1.0, en-GB;q=0.9",
        "Referer": "http://api.maxjia.com/",
        "Priority": "u=3, i"
    };
    
    // 发起GET请求
    $httpClient.get({
        url: url,
        headers: headers,
        timeout: 10000
    }, function(error, response, data) {
        if (error) {
            $notification.post(scriptName, "❌ 签到失败", `错误: ${error}`);
            $done();
            return;
        }
        
        try {
            const result = JSON.parse(data);
            
            if (result.status === "ok") {
                if (result.result.state === "ok") {
                    const coin = result.result.sign_in_coin || 0;
                    const streak = result.result.sign_in_streak || 0;
                    $notification.post(scriptName, "✓ 签到成功", `获得 ${coin} H币，连续签到 ${streak} 天`);
                } else if (result.result.state === "already_signed") {
                    const streak = result.result.sign_in_streak || 0;
                    $notification.post(scriptName, "○ 今日已签到", `连续签到 ${streak} 天`);
                } else {
                    $notification.post(scriptName, "✗ 签到失败", result.msg || "未知错误");
                }
            } else {
                $notification.post(scriptName, "✗ 签到失败", result.msg || "请求失败");
            }
        } catch (e) {
            $notification.post(scriptName, "❌ 解析失败", `错误: ${e.message}`);
        }
        
        $done();
    });
})();

// 生成随机字符串
function generateRandomString(length) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 生成随机十六进制字符串
function generateRandomHex(length) {
    const chars = "0123456789ABCDEF";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}