// ==UserScript==
// @name         斗鱼签到
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  在Loon环境下执行斗鱼签到，优先使用 persistentStore 的 did，其次使用手动配置。
// @author       Assistant
// @match        https://apiv2.douyucdn.cn/*
// @grant        none
// ==/UserScript==

/**
 * Loon 环境下的斗鱼签到脚本
 * 优先从 persistentStore 获取参数，其次使用手动配置。
 * 会从 acf_auth Cookie 解析 token。
 */

console.log("[斗鱼签到] 开始处理签到请求...");

// --- 手动配置区域 (如果 persistentStore 读取失败，请在此配置) ---
let manual_params = {
    // "douyu_did": "d2699126c76fbe037a3cb50200001621", // 填入从日志中复制的 did
    // "douyu_install_id": "7115098983546002189",        // 填入从日志中复制的 install_id
    // "douyu_ttreq": "1$508472763815a2a32e38db62af46f8a8ec4e6d3c" // 填入从日志中复制的 ttreq
};
// --- 手动配置区域结束 ---

// 从 Loon 上下文获取请求的 Cookie
let rawCookie = $request.headers['Cookie'] || $request.headers['cookie'];
let cookies = {};

if (rawCookie) {
    rawCookie.split(';').forEach(cookie => {
        let [key, value] = cookie.trim().split('=');
        if (key && value) {
            cookies[key] = value;
        }
    });
}

let acf_auth = cookies['acf_auth'];
let acf_uid = cookies['acf_uid'];

if (!acf_auth || !acf_uid) {
    console.log("[斗鱼签到] 错误：请求 Cookie 信息不完整，缺少 acf_auth 或 acf_uid。");
    $done({response: {body: JSON.stringify({error: "1", msg: "Cookie 信息不完整"})}});
    return;
}

let token = "";
try {
    let parts = acf_auth.split('.');
    if (parts.length === 3) {
        let payload = parts[1];
        let base64_payload = payload.replace(/-/g, '+').replace(/_/g, '/');
        while (base64_payload.length % 4) {
            base64_payload += '=';
        }
        let decoded_payload = atob(base64_payload);
        let parsed_payload = JSON.parse(decoded_payload);
        token = parsed_payload.token || "";
    }
} catch (e) {
    console.log("[斗鱼签到] 错误：解析 acf_auth Cookie 失败。", e);
    $done({response: {body: JSON.stringify({error: "1", msg: "解析 Cookie 失败"})}});
    return;
}

if (!token) {
    console.log("[斗鱼签到] 错误：无法从 acf_auth 中提取 token。");
    $done({response: {body: JSON.stringify({error: "1", msg: "无法提取 token"})}});
    return;
}

// 获取 did: 优先从 persistentStore 读取，其次使用手动配置
let stored_did = $persistentStore.read("douyu_did");
if (stored_did) {
    console.log("[斗鱼签到] 从 persistentStore 获取 did:", stored_did);
} else {
    console.log("[斗鱼签到] 未能从 persistentStore 获取 did。");
    // 尝试使用手动配置
    if (typeof(manual_params) !== 'undefined' && manual_params['douyu_did']) {
        stored_did = manual_params['douyu_did'];
        console.log("[斗鱼签到] 使用手动配置的 did:", stored_did);
    } else {
        console.log("[斗鱼签到] 错误：未能获取到 'douyu_did' 参数，persistentStore 和手动配置均为空。");
        $done({response: {body: JSON.stringify({error: "1", msg: "缺少 did 参数，请先运行参数提取脚本或检查手动配置"})}});
        return;
    }
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
    'Cookie': rawCookie // 使用原始请求的 Cookie
};

// 解析并修改原始请求体
let originalBody = $request.body || "";
let bodyParams = {};
originalBody.split('&').forEach(param => {
    let [key, value] = param.split('=');
    if (key && value) {
        bodyParams[decodeURIComponent(key)] = decodeURIComponent(value);
    }
});

bodyParams['did'] = stored_did;
bodyParams['token'] = token;

let formBody = Object.keys(bodyParams).map(key => `${encodeURIComponent(key)}=${encodeURIComponent(bodyParams[key])}`).join('&');

let request = {
    url: url,
    method: 'POST',
    headers: headers,
    body: formBody
};

console.log("[斗鱼签到] 构建的请求体:", formBody);

console.log("[斗鱼签到] 开始执行斗鱼签到请求...");
$httpClient.post(request, (error, response, data) => {
    if (error) {
        console.log("[斗鱼签到] 请求失败:", error);
        $done({response: {body: JSON.stringify({error: "1", msg: "网络请求失败", details: error})}});
    } else {
        console.log("[斗鱼签到] 签到请求响应状态码:", response.status);
        try {
            let result = JSON.parse(data);
            if (result.error === "0") {
                console.log("[斗鱼签到] 签到成功!");
                console.log("[斗鱼签到] 获得经验:", result.data.sign_exps);
                console.log("[斗鱼签到] 连续签到天数:", result.data.sign_cnt);
                console.log("[斗鱼签到] 总签到天数:", result.data.sign_sum);
                console.log("[斗鱼签到] 今日获得经验:", result.data.sign_exp);
                console.log("[斗鱼签到] 签到日期:", result.data.sign_today);
            } else {
                console.log("[斗鱼签到] 签到失败，错误码:", result.error, "消息:", result.msg);
            }
            $done({response: {body: data}});
        } catch (e) {
            console.log("[斗鱼签到] 解析响应数据失败:", e);
            console.log("[斗鱼签到] 响应内容:", data);
            $done({response: {body: JSON.stringify({error: "1", msg: "解析响应失败", details: e, raw_response: data})}});
        }
    }
});
