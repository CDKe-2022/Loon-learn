// ==UserScript==
// @name         斗鱼参数提取 (device_register)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  从 device_register 请求和响应中提取 did, install_id, ttreq, 和 token
// @author       You
// @match        https://abvolcapi.douyucdn.cn/service/2/device_register/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("开始处理 device_register 请求/响应...");

    // --- 从请求中提取信息 ---
    let requestHeaders = $request.headers;
    let requestCookiesStr = requestHeaders['Cookie'] || requestHeaders['cookie'] || '';
    let responseDataStr = $response.body;

    // 解析请求 Cookie 字符串
    let requestCookies = {};
    if (requestCookiesStr) {
        requestCookiesStr.split(';').forEach(cookie => {
            let [key, value] = cookie.trim().split('=');
            if (key && value) {
                requestCookies[key] = value;
            }
        });
    }

    // 提取参数
    let did = requestCookies['acf_did'] || '';
    let install_id = requestCookies['install_id'] || '';
    let ttreq = requestCookies['ttreq'] || '';

    console.log("从请求 Cookie 中提取:");
    console.log("  did (来自 acf_did):", did);
    console.log("  install_id:", install_id);
    console.log("  ttreq:", ttreq);

    // --- 从响应体中尝试提取 token ---
    let token = '';
    try {
        let responseData = JSON.parse(responseDataStr);
        // 假设响应结构为 { data: { token: "..." }, ... }
        // 请根据实际响应结构调整这里的取值路径
        token = responseData.data?.token || '';
        if (token) {
            console.log("从响应体中提取 token 成功:", token);
        } else {
            console.log("警告：响应体中未找到 'data.token' 字段。实际响应:", responseDataStr);
        }
    } catch (e) {
        console.log("错误：解析响应体 JSON 失败，无法提取 token。错误:", e, "响应内容:", responseDataStr);
    }

    // --- 验证提取结果 ---
    let allParamsFound = true;
    if (!did) {
        console.log("错误：未能从请求中提取到 'did' (acf_did)。");
        allParamsFound = false;
    }
    if (!install_id) {
        console.log("错误：未能从请求中提取到 'install_id'。");
        allParamsFound = false;
    }
    if (!ttreq) {
        console.log("错误：未能从请求中提取到 'ttreq'。");
        allParamsFound = false;
    }
    if (!token) {
        console.log("错误：未能从响应中提取到 'token'。");
        allParamsFound = false;
    }

    if (allParamsFound) {
        console.log("所有参数提取成功！");
        console.log(`提取到的参数:`);
        console.log(`  did: ${did}`);
        console.log(`  install_id: ${install_id}`);
        console.log(`  ttreq: ${ttreq}`);
        console.log(`  token: ${token}`);

        // --- 保存或使用参数 ---
        // 1. 尝试使用 loon_localstorage (如果 Loon 支持)
        if (typeof $loon_local !== 'undefined' && typeof $loon_local.set !== 'undefined') {
            try {
                $loon_local.set("douyu_did", did);
                $loon_local.set("douyu_install_id", install_id);
                $loon_local.set("douyu_ttreq", ttreq);
                $loon_local.set("douyu_token", token);
                console.log("参数已通过 $loon_local 保存。");
            } catch (e) {
                console.log("通过 $loon_local 保存参数时出错:", e);
            }
        } else {
            console.log("$loon_local 不可用，无法自动保存参数。请手动复制以下信息：");
            console.log(`douyu_did=${did}`);
            console.log(`douyu_install_id=${install_id}`);
            console.log(`douyu_ttreq=${ttreq}`);
            console.log(`douyu_token=${token}`);
        }
    } else {
        console.log("部分参数提取失败，请检查日志。");
    }

    // 结束处理，返回原始响应
    $done({});
})();