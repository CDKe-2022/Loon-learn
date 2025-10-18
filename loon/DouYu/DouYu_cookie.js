// ==UserScript==
// @name         斗鱼参数提取器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  从请求和响应中提取斗鱼签到所需的参数
// @author       You
// @match        https://apiv2.douyucdn.cn/H5nc/welcome/to*
// @grant        none
// ==/UserScript==

/**
 * Loon 环境下的斗鱼参数提取脚本
 * 监听对 /H5nc/welcome/to 的请求和响应，从中提取 acf_auth, acf_uid, install_id, ttreq, 和 token
 */

(function() {
    'use strict';

    console.log("斗鱼参数提取器已启动，正在监听请求和响应...");

    // 1. 从请求 URL 中提取 token
    let requestUrl = $request.url;
    let urlParams = new URLSearchParams(new URL(requestUrl).search);
    let extracted_token = urlParams.get('token');
    console.log(`从请求URL中提取到 token: ${extracted_token}`);

    // 2. 从请求头中提取 install_id 和 ttreq
    let requestHeaders = $request.headers;
    let install_id = null;
    let ttreq = null;

    // Cookie 字符串可能包含多个 cookie，需要解析
    let rawRequestCookie = requestHeaders['Cookie'] || requestHeaders['cookie'];
    if (rawRequestCookie) {
        let requestCookies = {};
        rawRequestCookie.split(';').forEach(cookie => {
            let [key, value] = cookie.trim().split('=');
            if (key && value) {
                requestCookies[key] = value;
            }
        });
        install_id = requestCookies['install_id'];
        ttreq = requestCookies['ttreq'];
    }
    console.log(`从请求头中提取到 install_id: ${install_id}`);
    console.log(`从请求头中提取到 ttreq: ${ttreq}`);

    // 3. 从响应头中提取 Set-Cookie 信息，获取 acf_auth 和 acf_uid
    let responseHeaders = $response.headers;
    let acf_auth = null;
    let acf_uid = null;

    // Set-Cookie 可能是字符串或数组
    let setCookieHeaders = responseHeaders['Set-Cookie'] || responseHeaders['set-cookie'];
    if (setCookieHeaders) {
        // 确保它是数组
        if (typeof setCookieHeaders === 'string') {
            setCookieHeaders = [setCookieHeaders];
        }
        // 遍历所有 Set-Cookie 条目
        for (let cookieLine of setCookieHeaders) {
            // 简单解析，只取第一部分（key=value）
            let [cookiePair] = cookieLine.split(';');
            let [key, value] = cookiePair.trim().split('=');
            if (key === 'acf_auth') {
                acf_auth = value;
            } else if (key === 'acf_uid') {
                acf_uid = value;
            }
        }
    }
    console.log(`从响应头中提取到 acf_auth: ${acf_auth}`);
    console.log(`从响应头中提取到 acf_uid: ${acf_uid}`);

    // 4. 汇总并打印所有参数
    let extractedParams = {
        acf_auth: acf_auth,
        acf_uid: acf_uid,
        install_id: install_id,
        ttreq: ttreq,
        token: extracted_token
    };

    console.log("--- 提取到的所有参数 ---");
    for (let [key, value] of Object.entries(extractedParams)) {
        console.log(`${key}: ${value}`);
    }
    console.log("------------------------");

    // 5. 检查是否有缺失的参数
    let missingParams = [];
    for (let [key, value] of Object.entries(extractedParams)) {
        if (!value) {
            missingParams.push(key);
        }
    }

    if (missingParams.length > 0) {
        console.log(`警告：以下参数未能提取到: ${missingParams.join(', ')}`);
    } else {
        console.log("所有参数提取成功！");
    }

    // 6. 将参数信息附加到响应体中（可选，用于调试或通知）
    // 创建一个简单的 HTML 页面来展示参数
    let htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>参数提取结果</title>
    <style>
        body { font-family: Arial, sans-serif; }
        .param { margin: 5px 0; }
        .param-key { font-weight: bold; }
        .warning { color: red; }
    </style>
</head>
<body>
    <h2>斗鱼参数提取结果</h2>
    ${
        missingParams.length > 0 ?
        `<p class="warning">警告：以下参数未能提取到: ${missingParams.join(', ')}</p>` :
        '<p style="color: green;">所有参数提取成功！</p>'
    }
    ${
        Object.entries(extractedParams).map(([key, value]) => 
            `<div class="param"><span class="param-key">${key}:</span> ${value || '<span style="color: red;">(未找到)</span>'}</div>`
        ).join('')
    }
</body>
</html>
`;

    // 7. 结束请求处理，返回修改后的响应
    $done({
        response: {
            status: 200, // 通常 302 会被处理，这里返回 200 以显示结果页面
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'no-cache'
            },
            body: htmlContent
        }
    });
})();