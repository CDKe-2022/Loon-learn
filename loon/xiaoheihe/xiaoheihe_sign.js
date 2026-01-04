// 小黑盒每日签到脚本 - 精确模拟原始请求
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
    
    // 生成精确的动态参数
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateNonce(); // 使用更精确的nonce生成
    const rnd = generateRnd(); // 精确的_rnd格式
    
    // 构造请求URL - 严格按照原始顺序
    const url = `https://api.xiaoheihe.cn/task/sign_v3/get_sign_state?x_app=heybox&nonce=${nonce}&os_version=26.2&_time=${timestamp}&version=1.3.376&lang=zh-cn&os_type=iOS&device_id=FAE6C5C1-AD08-4126-880C-9ED2C0E304EC&hkey=5d9533f7&heybox_id=${heyboxId}&x_client_type=mobile&device_info=iPhone13Pro&_rnd=${rnd}&dw=390&x_os_type=iOS&time_zone=Asia/Shanghai`;
    
    // 设置完整的请求头 - 包含所有必需的头字段
    const headers = {
        ":scheme": "https",
        ":method": "GET",
        ":authority": "api.xiaoheihe.cn",
        ":path": `/task/sign_v3/get_sign_state?x_app=heybox&nonce=${nonce}&os_version=26.2&_time=${timestamp}&version=1.3.376&lang=zh-cn&os_type=iOS&device_id=FAE6C5C1-AD08-4126-880C-9ED2C0E304EC&hkey=5d9533f7&heybox_id=${heyboxId}&x_client_type=mobile&device_info=iPhone13Pro&_rnd=${rnd}&dw=390&x_os_type=iOS&time_zone=Asia/Shanghai`,
        "cookie": cookie,
        "accept": "*/*",
        "accept-language": "zh-Hans-GB;q=1.0, en-GB;q=0.9",
        "referer": "http://api.maxjia.com/",
        "sentry-trace": generateSentryTrace(), // 生成sentry-trace
        "baggage": generateBaggage(), // 生成baggage
        "user-agent": "xiaoheihe/1.3.376 (com.max.xiaoheihe; build:1667; iOS 26.2.0) Alamofire/5.9.0",
        "priority": "u=3, i",
        "accept-encoding": "br;q=1.0, gzip;q=0.9, deflate;q=0.8"
    };
    
    console.log(`签到请求URL: ${url}`);
    console.log(`签到完整请求头: ${JSON.stringify(headers)}`);
    
    // 发起GET请求
    $httpClient.get({
        url: url,
        headers: headers,
        timeout: 15000
    }, function(error, response, data) {
        if (error) {
            $notification.post(scriptName, "❌ 签到失败", `网络错误: ${error}`);
            console.log(`网络错误: ${error}`);
            $done();
            return;
        }
        
        console.log(`响应状态: ${response.status}`);
        console.log(`响应头: ${JSON.stringify(response.headers)}`);
        console.log(`响应数据: ${data}`);
        
        try {
            const result = JSON.parse(data);
            
            if (result.status === "ok") {
                if (result.result && result.result.state === "ok") {
                    const coin = result.result.sign_in_coin || 0;
                    const streak = result.result.sign_in_streak || 0;
                    $notification.post(scriptName, "✓ 签到成功", `获得 ${coin} H币，连续签到 ${streak} 天`);
                } else if (result.result && result.result.state === "already_signed") {
                    const streak = result.result.sign_in_streak || 0;
                    $notification.post(scriptName, "○ 今日已签到", `连续签到 ${streak} 天`);
                } else if (result.result && result.result.state === "not_login") {
                    $notification.post(scriptName, "⚠️ Cookie失效", "请重新打开小黑盒APP获取新Cookie");
                } else {
                    $notification.post(scriptName, "✗ 签到失败", result.msg || "未知状态");
                }
            } else {
                // 特殊处理"非法请求"错误
                if (data.includes("非法请求") || data.includes("invalid request")) {
                    $notification.post(scriptName, "✗ 非法请求", "请求头或参数不完整，需要重新获取Cookie");
                } else {
                    $notification.post(scriptName, "✗ 签到失败", result.msg || "请求失败");
                }
            }
        } catch (e) {
            // 处理非JSON响应
            if (data.includes("非法请求") || data.includes("invalid request")) {
                $notification.post(scriptName, "✗ 非法请求", "服务器拒绝了请求，检查请求头完整性");
            } else {
                $notification.post(scriptName, "❌ 解析失败", `错误: ${e.message}\n数据: ${data.substring(0, 100)}`);
            }
        }
        
        $done();
    });
})();

// 生成精确的nonce - 模拟原始格式
function generateNonce() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// 生成精确的_rnd格式 - 14:XXXXXXXX 格式
function generateRnd() {
    const hours = new Date().getHours();
    const hex = generateRandomHex(8);
    return `${hours}%3A${hex}`;
}

// 生成sentry-trace - 模拟原始格式
function generateSentryTrace() {
    const chars = "0123456789abcdef";
    let traceId = "";
    for (let i = 0; i < 32; i++) {
        traceId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    let spanId = "";
    for (let i = 0; i < 16; i++) {
        spanId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${traceId}-${spanId}-0`;
}

// 生成baggage - 模拟原始格式
function generateBaggage() {
    const timestamp = Math.floor(Date.now() / 1000);
    const randomRate = (Math.random() * 0.01).toFixed(6);
    const randomSample = (Math.random() < 0.1).toString();
    const chars = "0123456789abcdef";
    let traceId = "";
    for (let i = 0; i < 32; i++) {
        traceId += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return `sentry-environment=production,sentry-public_key=cd2481795348588c5ea1fe1284a27c0b,sentry-release=com.max.xiaoheihe%401.3.376%2B1667,sentry-sample_rand=${Math.random().toFixed(6)},sentry-sample_rate=${randomRate},sentry-sampled=${randomSample},sentry-trace_id=${traceId},sentry-transaction=DiscoveryPageViewController`;
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