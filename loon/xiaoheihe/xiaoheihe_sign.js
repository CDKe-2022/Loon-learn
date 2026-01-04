// 小黑盒每日签到脚本
// 依赖Cookie捕获脚本获取的cookie

const cookieKey = "heybox_cookie_data";
const scriptName = "小黑盒签到";

!(function() {
    // 从本地存储读取cookie数据
    const cookieDataStr = $persistentStore.read(cookieKey);
    
    if (!cookieDataStr) {
        $notification.post(scriptName, "❌ 签到失败", "未获取到Cookie，请先打开小黑盒APP");
        console.log("未获取到Cookie数据");
        $done();
        return;
    }
    
    try {
        const cookieData = JSON.parse(cookieDataStr);
        const cookie = cookieData.cookie;
        const heyboxId = cookieData.heybox_id;
        
        if (!cookie || !heyboxId) {
            $notification.post(scriptName, "❌ 签到失败", "Cookie数据不完整");
            console.log("Cookie数据不完整");
            $done();
            return;
        }
        
        // 生成动态参数
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = generateRandomString(32);
        const rnd = `${new Date().getHours()}%3A${generateRandomHex(8)}`;
        
        // 构造请求URL
        const url = `https://api.xiaoheihe.cn/task/sign_v3/get_sign_state?x_app=heybox&nonce=${nonce}&os_version=26.2&_time=${timestamp}&version=1.3.376&lang=zh-cn&os_type=iOS&device_id=FAE6C5C1-AD08-4126-880C-9ED2C0E304EC&hkey=5d9533f7&heybox_id=${heyboxId}&x_client_type=mobile&device_info=iPhone13Pro&_rnd=${rnd}&dw=390&x_os_type=iOS&time_zone=Asia/Shanghai`;
        
        // 设置请求头
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
                $notification.post(scriptName, "❌ 签到失败", `网络错误: ${error}`);
                console.log(`签到请求失败: ${error}`);
                $done();
                return;
            }
            
            try {
                const result = JSON.parse(data);
                console.log(`签到响应: ${JSON.stringify(result)}`);
                
                if (result.status === "ok") {
                    if (result.result && result.result.state === "ok") {
                        // 签到成功
                        const coin = result.result.sign_in_coin || 0;
                        const streak = result.result.sign_in_streak || 0;
                        $notification.post(scriptName, "✓ 签到成功", `获得 ${coin} H币，连续签到 ${streak} 天`);
                    } else if (result.result && result.result.state === "already_signed") {
                        // 已签到
                        const streak = result.result.sign_in_streak || 0;
                        $notification.post(scriptName, "○ 今日已签到", `连续签到 ${streak} 天`);
                    } else {
                        // 其他状态
                        const msg = result.msg || "未知状态";
                        $notification.post(scriptName, "✗ 签到失败", msg);
                    }
                } else {
                    const msg = result.msg || "请求失败";
                    $notification.post(scriptName, "✗ 签到失败", msg);
                }
            } catch (parseError) {
                $notification.post(scriptName, "❌ 解析失败", `响应解析错误: ${parseError.message}`);
                console.log(`响应解析错误: ${parseError.message}, 原始数据: ${data}`);
            }
            
            $done();
        });
        
    } catch (error) {
        $notification.post(scriptName, "❌ 脚本异常", `错误: ${error.message}`);
        console.log(`脚本执行异常: ${error.message}`);
        $done();
    }
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