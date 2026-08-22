/*
 * 顺丰速运签到脚本（Loon 专用 · 微信小程序 V2 版 · 最终版）
 *
 * 接口信息（2026-08-22 抓包确认）：
 *   - 签到动作：~integralSignV2Service~getTodaySign（幂等，请求体 {}）
 *   - 签到记录：~integralSignV2Service~getSignInfoRecords（查明日奖励）
 *   - signature 按接口路径计算 → 每个接口的请求头需分别捕获、分别使用
 *
 * 使用流程：
 *   1. 微信打开顺丰小程序 → 我的积分页（等待签到日历加载完成，会同时触发两个接口）
 *   2. 收到「Cookie 捕获成功」通知（会累计捕获各接口的签名）
 *   3. 每天定时脚本自动签到
 */

// ============================================================
// 1. 常量
// ============================================================

const SCRIPT_NAME = '顺丰速运';
const KEY_LOGIN = 'sf_login_v4'; // 新键名（存储结构变了）

const API_HOST = 'mcs-mimp-web.sf-express.com';
const PATH_SIGN = 'getTodaySign';
const PATH_INFO = 'getSignInfoRecords';

// ============================================================
// 2. 入口分流
// ============================================================

if (typeof $request !== 'undefined') {
    saveCookie();
} else {
    (async () => {
        console.log(`🔔 ${SCRIPT_NAME} 开始签到`);
        await runSign();
    })().catch(e => {
        console.log(`❌ 执行出错: ${JSON.stringify(e)}`);
        notify('签到执行出错', JSON.stringify(e));
        $done({});
    });
}

// ============================================================
// 3. 捕获模式：按接口路径分别保存凭证
// ============================================================

function saveCookie() {
    const reqHeaders = $request.headers || {};
    const cookieStr = getHeaderVal(reqHeaders, 'Cookie');
    const url = $request.url;

    console.log('[捕获] 命中: ' + url);

    if (!cookieStr) {
        console.log('[捕获] 请求头无Cookie，跳过');
        $done({});
        return;
    }
    if (cookieStr.indexOf('_login_user_id_') === -1 && cookieStr.indexOf('sessionId') === -1) {
        console.log('[捕获] Cookie缺少登录字段，跳过');
        $done({});
        return;
    }

    // 读取现有存储（结构：{ getTodaySign: {...}, getSignInfoRecords: {...} }）
    let store = {};
    try {
        const val = $persistentStore.read(KEY_LOGIN);
        if (val) store = JSON.parse(val) || {};
    } catch (e) { /* 忽略，用空对象重建 */ }

    // 根据URL确定接口标识
    let endpoint = null;
    if (url.indexOf(PATH_SIGN) !== -1) endpoint = PATH_SIGN;
    else if (url.indexOf(PATH_INFO) !== -1) endpoint = PATH_INFO;

    if (!endpoint) {
        console.log('[捕获] 非目标接口（无签名价值），跳过');
        $done({});
        return;
    }

    // 保存该接口的完整请求头
    store[endpoint] = {
        url: url,
        headers: reqHeaders,
        body: $request.body || '',
        savedAt: new Date().toISOString()
    };

    if ($persistentStore.write(JSON.stringify(store), KEY_LOGIN)) {
        const got = Object.keys(store).join(' + ');
        console.log(`[捕获] 已保存 ${endpoint} 的凭证，现有: ${got}`);
        $notification.post(
            SCRIPT_NAME,
            `Cookie 捕获成功 ✅ (${endpoint})`,
            `已捕获接口: ${got}\n` + (got.indexOf(PATH_SIGN) !== -1 ? '签到凭证已就绪' : '再进入积分页可捕获更多接口签名')
        );
    } else {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获失败 ❌', '本地存储写入失败');
    }

    $done({});
}

// ============================================================
// 4. 签到模式：主流程
// ============================================================

async function runSign() {
    // 4.1 读取凭证存储
    let store = {};
    try {
        const val = $persistentStore.read(KEY_LOGIN);
        if (val) store = JSON.parse(val) || {};
    } catch (e) {
        console.log('[诊断] 读取失败: ' + e);
    }

    // 4.2 确定签到接口的凭证（必须要有 getTodaySign 的签名）
    let signOpts = store[PATH_SIGN];
    if (!signOpts) {
        // 兼容提示：可能只捕获到了查询接口
        notify('签到失败', `未找到签到接口凭证（需 ${PATH_SIGN}），\n请重新打开小程序积分页并等待页面完全加载`);
        $done({});
        return;
    }

    console.log(`[诊断] 签到凭证捕获于: ${signOpts.savedAt || '未知时间'}`);

    // 4.3 执行签到（幂等接口）
    const signData = await doSign(signOpts);
    await wait(1000);

    // 4.4 凭证失效判断
    if (!signData || signData.success === false) {
        notify('签到失败', signData ? (signData.errorMessage || '请求被拒') : '请求失败，请重新捕获');
        $done({});
        return;
    }

    // 4.5 查询明日奖励（可选，用查询接口自己的签名）
    let infoData = null;
    if (store[PATH_INFO]) {
        infoData = await getSignInfo(store[PATH_INFO]);
    } else {
        console.log('[提示] 未捕获查询接口凭证，跳过明日奖励查询');
    }

    // 4.6 汇总通知
    showmsg(signData, infoData);
    $done({});
}

// ============================================================
// 5. 接口请求
// ============================================================

function doSign(opts) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralSignV2Service~${PATH_SIGN}`,
            headers: buildHeaders(opts),
            body: '{}'
        }, (error, response, data) => {
            if (error) {
                console.log('签到请求失败: ' + JSON.stringify(error));
                resolve(null);
                return;
            }
            console.log('签到响应: ' + String(data).slice(0, 400));
            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
    });
}

function getSignInfo(opts) {
    return new Promise((resolve) => {
        const now = new Date();
        const start = formatDate(new Date(now.getTime() - 30 * 86400000));
        const end = formatDate(new Date(now.getTime() + 21 * 86400000));

        $httpClient.post({
            url: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralSignV2Service~${PATH_INFO}`,
            headers: buildHeaders(opts),
            body: JSON.stringify({
                startTm: `${start} 00:00:00`,
                endTm: `${end} 23:59:59`
            })
        }, (error, response, data) => {
            if (error) {
                console.log('查询记录失败: ' + JSON.stringify(error));
                resolve(null);
                return;
            }
            console.log('查询记录响应: ' + String(data).slice(0, 300));
            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
    });
}

// ============================================================
// 6. 工具函数
// ============================================================

function buildHeaders(opts) {
    const src = opts.headers || {};
    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
    };

    ['Cookie', 'cookie', 'channel', 'syscode', 'platform', 'signature', 'timestamp',
     'sw8', 'user-agent', 'User-Agent', 'referer', 'Referer', 'origin', 'Origin',
     'accept-language'].forEach(k => {
        if (!src[k]) return;
        if (k.toLowerCase() === 'cookie') {
            headers['Cookie'] = headers['Cookie'] ? headers['Cookie'] + '; ' + src[k] : src[k];
        } else if (k === 'user-agent') {
            headers['User-Agent'] = src[k];
        } else if (k === 'referer') {
            headers['Referer'] = src[k];
        } else if (k === 'origin') {
            headers['Origin'] = src[k];
        } else {
            headers[k] = src[k];
        }
    });

    return headers;
}

function getHeaderVal(headers, name) {
    if (!headers) return '';
    const lower = name.toLowerCase();
    for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === lower) {
            const v = headers[k];
            return Array.isArray(v) ? v.join('; ') : String(v);
        }
    }
    return '';
}

function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(subtitle, content) {
    $notification.post(SCRIPT_NAME, subtitle, content);
}

function showmsg(signData, infoData) {
    const obj = (signData && signData.obj) || {};
    const content = [];

    if (obj.signed) {
        content.push(`连续签到: ${obj.dayCount || 0} 天`);
        if (obj.bubbleText) content.push(`本次奖励: ${obj.bubbleText}`);

        // 明日奖励（查询失败就不显示，不影响签到结果）
        if (infoData && infoData.success && infoData.obj && Array.isArray(infoData.obj.predictAwards)) {
            const tomorrow = infoData.obj.predictAwards.find(
                p => p.dayCount === (obj.dayCount || 0) + 1
            );
            if (tomorrow && tomorrow.awardNum) {
                content.push(`明日奖励: ${tomorrow.awardNum} ${tomorrow.awardType === 'SFP' ? '积分' : '礼品'}`);
            }
        }

        notify('签到: 成功', content.join('\n'));
    } else {
        notify('签到: 异常', '接口返回成功但 signed 为 false，详情见日志');
    }
}
