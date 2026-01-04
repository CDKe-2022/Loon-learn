// 小黑盒每日签到脚本 - 使用分别存储的Cookie参数
const cookieKey = "heybox_cookie_params";
const scriptName = "小黑盒签到";
const heyboxId = "91715900"; // 固定的heybox_id

!(function() {
    // 从本地存储读取cookie参数
    const cookieDataStr = $persistentStore.read(cookieKey);
    
    if (!cookieDataStr) {
        $notification.post(scriptName, "❌ 签到失败", "未获取到Cookie参数，请先打开小黑盒APP");
        console.log("未获取到Cookie参数数据");
        $done();
        return;
    }
    
    try {
        const cookieData = JSON.parse(cookieDataStr);
        const params = cookieData.params;
        
        if (!params || params.length === 0) {
            $notification.post(scriptName, "❌ 签到失败", "Cookie参数数据不完整");
            console.log("Cookie参数数据不完整");
            $done();
            return;
        }
        
        // 重新组合Cookie，按原始顺序
        const cookie = params.map(p => `${p.name}=${p.value}`).join('; ');
        console.log(`重组的Cookie: ${cookie}`);
        
        // 生成动态参数
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = generateRandomString(32);
        const rnd = `${new Date().getHours()}%3A${generateRandomHex(8)}`;
        
        // 构造请求URL - 使用固定的heybox_id
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
        
        console.log(`签到请求URL: ${url}`);
        console.log(`签到请求头: ${JSON.stringify(headers)}`);
        
        // 发起GET请求
        $httpClient.get({
            url: url,
            headers: headers,
            timeout: 15000 // 增加超时时间
        }, function(error, response, data) {
            if (error) {
                $notification.post(scriptName, "❌ 签到失败", `网络错误: ${error}`);
                console.log(`签到请求失败: ${error}`);
                $done();
                return;
            }
            
            try {
                console.log(`签到响应状态: ${response.status}`);
                console.log(`签到响应头: ${JSON.stringify(response.headers)}`);
                
                if (typeof data === 'string') {
                    console.log(`签到响应数据: ${data.substring(0, 200)}...`); // 只打印前200字符
                    
                    let result;
                    try {
                        result = JSON.parse(data);
                    } catch (parseError) {
                        // 尝试修复JSON格式问题
                        const cleanedData = data.replace(/[\x00-\x1F\x7F]/g, '');
                        try {
                            result = JSON.parse(cleanedData);
                        } catch (secondError) {
                            throw new Error(`JSON解析失败: ${parseError.message}, 修复后仍失败: ${secondError.message}`);
                        }
                    }
                    
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
                        } else if (result.result && result.result.state === "not_login") {
                            // 未登录，需要重新获取Cookie
                            $notification.post(scriptName, "⚠️ 需要重新登录", "Cookie已失效，请重新打开小黑盒APP获取新Cookie");
                        } else {
                            // 其他状态
                            const msg = result.msg || "未知状态";
                            $notification.post(scriptName, "✗ 签到失败", msg);
                        }
                    } else {
                        const msg = result.msg || "请求失败";
                        $notification.post(scriptName, "✗ 签到失败", msg);
                    }
                } else {
                    $notification.post(scriptName, "❌ 数据格式错误", "响应不是字符串格式");
                    console.log(`响应数据格式错误: ${typeof data}, 内容: ${data}`);
                }
            } catch (parseError) {
                $notification.post(scriptName, "❌ 解析失败", `响应解析错误: ${parseError.message}`);
                console.log(`响应解析错误: ${parseError.message}, 原始数据: ${data}`);
            }
            
            $done();
        });
        
    } catch (error) {
        $notification.post(scriptName, "❌ 脚本异常", `错误: ${error.message}`);
        console.log(`脚本执行异常: ${error.message}\n堆栈: ${error.stack}`);
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