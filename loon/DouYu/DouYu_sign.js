// ==UserScript==
// @name         斗鱼签到
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  在Loon环境下执行斗鱼签到
// @author       You
// @match        https://apiv2.douyucdn.cn/*
// @grant        none
// ==/UserScript==

/**
 * Loon 环境下的斗鱼签到脚本
 * 请将你的 cookie 信息配置到 Loon 的配置文件或脚本环境中
 * 需要 acf_auth, acf_uid, install_id, ttreq 这几个 cookie 值
 */
 
// --- 配置区域 (如果 Loon 环境无法自动获取 cookie，请手动配置) ---
// 注意：在 Loon 中，通常会自动处理请求上下文的 Cookie，手动配置优先级更高
// let manual_cookies = {
//     "acf_auth": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJ0b2tlbiI6IjE2MDE1MzM3OF8xMV9hM2YwMDZkMjgxZjkyNTg2XzJfOTA1NTIyNDYiLCJ1aWQiOiIxNjAxNTMzNzgiLCJ0aW1lIjoxNzYwNzIxNzUwfQ.tqr-5lVJWykNZ7sOjawveM_mJaXIqxPlfDOlvddffpc",
//     "acf_uid": "160153378",
//     "install_id": "7115098983546002189",
//     "ttreq": "1$508472763815a2a32e38db62af46f8a8ec4e6d3c"
// };
// --- 配置区域结束 ---

// 从 Loon 上下文获取请求的 Cookie
let rawCookie = $request.headers['Cookie'] || $request.headers['cookie'];
let cookies = {};

if (rawCookie) {
    // 解析 Cookie 字符串
    rawCookie.split(';').forEach(cookie => {
        let [key, value] = cookie.trim().split('=');
        if (key && value) {
            cookies[key] = value;
        }
    });
}

// 优先使用手动配置的 Cookie，否则使用从请求中解析的
// let final_cookies = manual_cookies || cookies;
// 修正：如果手动配置了，则使用手动配置，否则使用解析的
let final_cookies = typeof(manual_cookies) !== 'undefined' ? manual_cookies : cookies;

// 提取必要的 Cookie 值
let acf_auth = final_cookies['acf_auth'];
let acf_uid = final_cookies['acf_uid'];
let install_id = final_cookies['install_id'];
let ttreq = final_cookies['ttreq'];

if (!acf_auth || !acf_uid) {
    console.log("错误：Cookie 信息不完整，缺少 acf_auth 或 acf_uid。");
    // 在 Loon 脚本中，$done 用于结束请求处理
    $done({response: {body: JSON.stringify({error: "1", msg: "Cookie 信息不完整"})}});
    return;
}

// 从 acf_auth 中解析 token
// acf_auth 是一个 JWT (JSON Web Token)，我们需要解析其 payload 部分来获取 token
// JWT 结构: header.payload.signature
let token = "";
try {
    let parts = acf_auth.split('.');
    if (parts.length === 3) {
        // Base64 解码 payload
        let payload = parts[1];
        // 在 Base64 URL 安全编码中，'-' 替换 '+'，'_' 替换 '/'
        let base64_payload = payload.replace(/-/g, '+').replace(/_/g, '/');
        // 补齐 Base64 长度（如果需要）
        while (base64_payload.length % 4) {
            base64_payload += '=';
        }
        let decoded_payload = atob(base64_payload);
        let parsed_payload = JSON.parse(decoded_payload);
        token = parsed_payload.token || "";
    }
} catch (e) {
    console.log("错误：解析 acf_auth Cookie 失败。", e);
    $done({response: {body: JSON.stringify({error: "1", msg: "解析 Cookie 失败"})}});
    return;
}

if (!token) {
    console.log("错误：无法从 acf_auth 中提取 token。");
    $done({response: {body: JSON.stringify({error: "1", msg: "无法提取 token"})}});
    return;
}


// 构建请求
let url = 'https://apiv2.douyucdn.cn/h5nc/sign/sendSign';
let headers = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    'Sec-Fetch-Site': 'same-origin',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Mode': 'cors',
    'Origin': 'https://apiv2.douyucdn.cn',
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS',
    'Referer': 'https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0',
    'Sec-Fetch-Dest': 'empty',
    // 重新构建 Cookie 字符串
    'Cookie': `acf_auth=${acf_auth}; acf_uid=${acf_uid}; install_id=${install_id}; ttreq=${ttreq}`
};

// 构建请求体
let body_data = {
    'client_sys': 'ios',
    'did': 'd2699126c76fbe037a3cb50200001621', // did 可能是设备ID，可以固定，也可以动态生成
    'token': token
};

// 将对象转换为 x-www-form-urlencoded 格式
let formBody = [];
for (let property in body_data) {
    let encodedKey = encodeURIComponent(property);
    let encodedValue = encodeURIComponent(body_data[property]);
    formBody.push(encodedKey + '=' + encodedValue);
}
let body = formBody.join('&');

let request = {
    url: url,
    method: 'POST',
    headers: headers,
    body: body
};

// 发送请求
console.log("开始执行斗鱼签到请求...");
$httpClient.post(request, (error, response, data) => {
    if (error) {
        console.log("请求失败:", error);
        $done({response: {body: JSON.stringify({error: "1", msg: "网络请求失败", details: error})}});
    } else {
        console.log("签到请求响应状态码:", response.status);
        console.log("签到请求原始响应:", data); // 打印原始响应用于调试
        try {
            let result = JSON.parse(data);
            if (result.error === "0") {
                console.log("签到成功!");
                console.log("获得经验:", result.data.sign_exps);
                console.log("连续签到天数:", result.data.sign_cnt);
                console.log("总签到天数:", result.data.sign_sum);
                console.log("今日获得经验:", result.data.sign_exp);
                $done({response: {body: JSON.stringify(result)}});
            } else {
                console.log("签到失败，错误码:", result.error, "消息:", result.msg);
                $done({response: {body: JSON.stringify(result)}});
            }
        } catch (e) {
            console.log("解析响应数据失败:", e);
            console.log("响应内容:", data);
            $done({response: {body: JSON.stringify({error: "1", msg: "解析响应失败", details: e, raw_response: data})}});
        }
    }
});