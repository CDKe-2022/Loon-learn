/*
 * 顺丰速运签到脚本（Loon 专用 · 微信小程序 V2 版）
 *
 * 接口确认（2026-08-22 抓包）：
 *   - 签到动作：~memberNonactivity~integralSignV2Service~getTodaySign（请求体 {}，幂等）
 *   - 签到记录：~memberNonactivity~integralSignV2Service~getSignInfoRecords
 *   - 认证依赖：signature + timestamp + channel(mypoint) + syscode(MCS-MIMP-CORE)
 *               + platform(MINI_PROGRAM) + sw8 + Cookie(_login_user_id_/sessionId/HWWAFSESID等)
 *
 * 使用流程：
 *   1. 微信打开顺丰小程序 → 我的积分页（触发 integralSignV2Service 请求）
 *   2. 收到「Cookie 捕获成功」通知
 *   3. 每天定时脚本调用 getTodaySign 完成签到
 */

// ============================================================
// 1. 常量
// ============================================================

const SCRIPT_NAME = '顺丰速运';
const KEY_LOGIN = 'sf_login_v3';

const API_HOST = 'mcs-mimp-web.sf-express.com';

const API = {
    // 签到动作（幂等：已签到返回 signed:true）
    doSign: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralSignV2Service~getTodaySign`,
    // 签到记录（用于查询明日奖励）
    signInfo: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralSignV2Service~getSignInfoRecords`
};

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
// 3. 捕获模式：保存完整凭证
// ============================================================

function saveCookie() {
    const reqHeaders = $request.headers || {};
    const cookieStr = getHeaderVal(reqHeaders, 'Cookie');

    console.log('[捕获] 命中: ' + $request.url);

    if (!cookieStr) {
        console.log('[捕获] 请求头无Cookie，跳过');
        $done({});
        return;
    }

    // 校验是否包含关键登录字段
    if (cookieStr.indexOf('_login_user_id_') === -1 && cookieStr.indexOf('sessionId') === -1) {
        console.log('[捕获] Cookie缺少登录字段，跳过');
        $done({});
        return;
    }

    const session = {
        url: $request.url,
        headers: reqHeaders,  // 完整请求头（signature/timestamp/sw8/cookie 等）
        body: $request.body || ''
    };

    if ($persistentStore.write(JSON.stringify(session), KEY_LOGIN)) {
        console.log('[捕获] 凭证已保存，Cookie前100字: ' + cookieStr.slice(0, 100));
        $notification.post(SCRIPT_NAME, 'Cookie 捕获成功 ✅', '已保存V2登录凭证，签到功能已就绪');
    } else {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获失败 ❌', '本地存储写入失败');
    }

    $done({});
}

// ============================================================
// 4. 签到模式：主流程
// ============================================================

async function runSign() {
    // 4.1 读取凭证
    let opts = null;
    try {
        const val = $persistentStore.read(KEY_LOGIN);
        if (val) opts = JSON.parse(val);
    } catch (e) {
        console.log('[诊断] 读取失败: ' + e);
    }

    if (!opts) {
        notify('签到失败', '未找到登录凭证，请打开微信顺丰小程序进入我的积分页触发捕获');
        $done({});
        return;
    }

    // 4.2 执行签到（getTodaySign 幂等接口）
    const signData = await doSign(opts);
    await wait(1000);

    // 4.3 凭证失效判断
    if (!signData || signData.success === false) {
        notify('签到失败', signData ? (signData.errorMessage || '请求被拒') : '请求失败');
        $done({});
        return;
    }

    // 4.4 查询明日奖励（可选，失败不影响签到结果）
    const infoData = await getSignInfo(opts);

    // 4.5 汇总通知
    showmsg(signData, infoData);
    $done({});
}

// ============================================================
// 5. 接口请求
// ============================================================

function doSign(opts) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: API.doSign,
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
            url: API.signInfo,
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

// 构建请求头：完整继承捕获请求的认证头
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

// 统一取 header 值（兼容数组形式的多个 cookie）
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

        // 明日奖励（来自 getSignInfoRecords 的 predictAwards）
        if (infoData && infoData.obj && Array.isArray(infoData.obj.predictAwards)) {
            const tomorrow = (obj.predictAwards && obj.predictAwards.find(
                p => p.dayCount === (obj.dayCount || 0) + 1
            )) || infoData.obj.predictAwards.find(
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
