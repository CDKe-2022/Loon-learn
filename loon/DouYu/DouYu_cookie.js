// ==UserScript==
// @name         斗鱼参数提取 (device_register - Response)
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  从 device_register 响应中提取 did, install_id, ttreq。注意：请求体因格式原因无法解析。使用 $persistentStore 保存。
// @author       Assistant
// @match        https://abvolcapi.douyucdn.cn/service/2/device_register/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("[斗鱼参数提取-响应] 开始处理 device_register 响应...");

    // --- 从请求头 (通过 $request 获取，因为脚本是 http-response 类型) 中提取信息 ---
    let requestHeaders = $request.headers;
    let requestCookiesStr = requestHeaders['Cookie'] || requestHeaders['cookie'] || '';

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

    // 提取参数 (主要从请求 Cookie 获取)
    let did = requestCookies['acf_did'] || '';
    let install_id = requestCookies['install_id'] || '';
    let ttreq = requestCookies['ttreq'] || '';

    console.log("[斗鱼参数提取-响应] 从请求 Cookie 中提取:");
    console.log("  did (来自 acf_did):", did ? "Found" : "Not Found");
    console.log("  install_id:", install_id ? "Found" : "Not Found");
    console.log("  ttreq:", ttreq ? "Found" : "Not Found");

    // --- 从响应体 (通过 $response 获取) 中尝试提取 token (如果需要) ---
    let token = '';
    let responseDataStr = $response.body;

    try {
        let responseData = JSON.parse(responseDataStr);
        token = responseData.data?.token || '';
        if (token) {
            console.log("[斗鱼参数提取-响应] 从响应体中提取 token 成功: Found");
        } else {
            console.log("[斗鱼参数提取-响应] 警告：响应体中未找到 'data.token' 字段。实际响应可能不包含 token。");
        }
    } catch (e) {
        console.log("[斗鱼参数提取-响应] 错误：解析响应体 JSON 失败，无法提取 token。错误:", e);
        console.log("[斗鱼参数提取-响应] 响应内容 (可能不是JSON):", responseDataStr);
    }

    // --- 验证提取结果并保存 ---
    let allParamsFound = true;
    if (!did) {
        console.log("[斗鱼参数提取-响应] 错误：未能从请求 Cookie 中提取到 'did' (acf_did)。");
        allParamsFound = false;
    }
    if (!install_id) {
        console.log("[斗鱼参数提取-响应] 错误：未能从请求 Cookie 中提取到 'install_id'。");
        allParamsFound = false;
    }
    if (!ttreq) {
        console.log("[斗鱼参数提取-响应] 错误：未能从请求 Cookie 中提取到 'ttreq'。");
        allParamsFound = false;
    }

    if (allParamsFound) {
        console.log("[斗鱼参数提取-响应] 关键参数提取成功！");

        // --- 保存参数到 persistentStore ---
        let successCount = 0;
        if ($persistentStore.write(did, "douyu_did")) {
            successCount++;
            console.log("[斗鱼参数提取-响应] did 已保存到 persistentStore。");
        } else {
            console.log("[斗鱼参数提取-响应] did 保存到 persistentStore 失败。");
        }

        if ($persistentStore.write(install_id, "douyu_install_id")) {
            successCount++;
            console.log("[斗鱼参数提取-响应] install_id 已保存到 persistentStore。");
        } else {
            console.log("[斗鱼参数提取-响应] install_id 保存到 persistentStore 失败。");
        }

        if ($persistentStore.write(ttreq, "douyu_ttreq")) {
            successCount++;
            console.log("[斗鱼参数提取-响应] ttreq 已保存到 persistentStore。");
        } else {
            console.log("[斗鱼参数提取-响应] ttreq 保存到 persistentStore 失败。");
        }

        if (token && $persistentStore.write(token, "douyu_token_from_device_resp")) {
            successCount++;
            console.log("[斗鱼参数提取-响应] token (from resp) 已保存到 persistentStore。");
        } else if (token) {
            console.log("[斗鱼参数提取-响应] token (from resp) 保存到 persistentStore 失败。");
        }

        if (successCount > 0) {
            console.log(`[斗鱼参数提取-响应] 成功保存 ${successCount} 个参数到 persistentStore。`);
        } else {
            console.log("[斗鱼参数提取-响应] 所有参数保存到 persistentStore 都失败了。");
        }
    } else {
        console.log("[斗鱼参数提取-响应] 部分关键参数提取失败，请检查日志。");
    }

    // 结束处理，返回原始响应
    $done({});
})();
