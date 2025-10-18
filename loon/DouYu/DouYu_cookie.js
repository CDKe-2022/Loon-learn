// ==UserScript==
// @name         斗鱼参数提取 (device_register - Response)
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  从 device_register 响应中提取 did, install_id, ttreq。注意：请求体因格式原因无法解析。
// @author       Assistant
// @match        https://abvolcapi.douyucdn.cn/service/2/device_register/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    console.log("[斗鱼参数提取-响应] 开始处理 device_register 响应...");

    // --- 从请求头 (通过 $request 获取，因为脚本是 http-response 类型) 中提取信息 ---
    // 注意：在 http-response 脚本中，$request 代表原始的 HTTP 请求
    let requestHeaders = $request.headers;
    let requestCookiesStr = requestHeaders['Cookie'] || requestHeaders['cookie'] || '';
    // let originalRequestBody = $request.body; // 不能使用，因为是 octet-stream 格式

    // 解析请求 Cookie 字符串 (这里获取的是请求中的 Cookie，包含 acf_did)
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
    // 注意：acf_did 通常在请求的 Cookie 中，而不是响应中
    let did = requestCookies['acf_did'] || ''; // 这是请求中的 did
    let install_id = requestCookies['install_id'] || ''; // 这是请求中的 install_id
    let ttreq = requestCookies['ttreq'] || ''; // 这是请求中的 ttreq

    console.log("[斗鱼参数提取-响应] 从请求 Cookie 中提取:");
    console.log("  did (来自 acf_did):", did ? "Found" : "Not Found");
    console.log("  install_id:", install_id ? "Found" : "Not Found");
    console.log("  ttreq:", ttreq ? "Found" : "Not Found");

    // --- 从响应体 (通过 $response 获取) 中尝试提取 token (如果需要) ---
    // 注意：由于原始信息未明确 token 来源，这里保留尝试逻辑，但可能无果
    let token = '';
    let responseDataStr = $response.body; // 现在 $response.body 是有效的

    try {
        let responseData = JSON.parse(responseDataStr);
        // 假设响应结构为 { data: { token: "..." }, ... }
        // 请根据实际响应结构调整这里的取值路径
        token = responseData.data?.token || '';
        if (token) {
            console.log("[斗鱼参数提取-响应] 从响应体中提取 token 成功: Found");
        } else {
            console.log("[斗鱼参数提取-响应] 警告：响应体中未找到 'data.token' 字段。实际响应可能不包含 token。");
            // console.log("[斗鱼参数提取-响应] 实际响应:", responseDataStr); // 可选：打印响应用于调试
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
    // Token 不强制要求在此处找到，因为可能在其他接口或由 acf_auth 解析

    if (allParamsFound) {
        console.log("[斗鱼参数提取-响应] 关键参数提取成功！");

        // --- 保存参数到本地存储 ---
        // 1. 尝试使用 loon_localstorage (如果 Loon 支持)
        if (typeof $loon_local !== 'undefined' && typeof $loon_local.set !== 'undefined') {
            try {
                $loon_local.set("douyu_did", did);
                $loon_local.set("douyu_install_id", install_id);
                $loon_local.set("douyu_ttreq", ttreq);
                if (token) {
                   $loon_local.set("douyu_token_from_device_resp", token); // 如果找到了，也存起来
                   console.log("[斗鱼参数提取-响应] 参数 (包括可能的token) 已通过 $loon_local 保存。");
                } else {
                   console.log("[斗鱼参数提取-响应] 参数已通过 $loon_local 保存。");
                }
            } catch (e) {
                console.log("[斗鱼参数提取-响应] 通过 $loon_local 保存参数时出错:", e);
            }
        } else {
            console.log("[斗鱼参数提取-响应] $loon_local 不可用，无法自动保存参数。请手动复制关键信息。");
            console.log(`[斗鱼参数提取-响应] did: ${did}`);
            console.log(`[斗鱼参数提取-响应] install_id: ${install_id}`);
            console.log(`[斗鱼参数提取-响应] ttreq: ${ttreq}`);
            if (token) { console.log(`[斗鱼参数提取-响应] token (from resp): ${token}`); }
        }
    } else {
        console.log("[斗鱼参数提取-响应] 部分关键参数提取失败，请检查日志。");
    }

    // 结束处理，返回原始响应
    $done({});
})();
