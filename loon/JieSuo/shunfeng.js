/*
 * 顺丰速运签到脚本（Loon 专用 · 单文件版 · 修复版）
 *
 * 修复内容：
 *   1. 所有接口 URL 硬编码，不再使用捕获到的 URL（避免打到错误接口返回 HTML）
 *   2. 捕获规则使用 http-request 匹配签到接口本身（拿到完整会员 Cookie）
 *   3. 增加诊断日志，便于排查
 *
 * 使用流程：
 *   1. 安装插件 → 打开顺丰APP → 我的 → 会员中心 → 手动点一次签到
 *   2. 收到「Cookie 捕获成功」通知
 *   3. 之后每天定时自动签到
 */

// ============================================================
// 1. 常量
// ============================================================

const SCRIPT_NAME = '顺丰速运';
const KEY_LOGIN = 'sf_login_v2'; // 新键名，避免读到旧脏数据
const API_HOST = 'mcs-mimp-web.sf-express.com';

const API = {
    sign: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage`,
    login: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage`,
    taskQuery: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES`,
    taskFinish: `https://${API_HOST}/mcs-mimp/commonRoutePost/memberEs/taskRecord/finishTask`,
    taskPoint: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~fetchIntegral`,
    loginRedirect: `https://${API_HOST}/mcs-mimp/share/app/shareRedirect`
};

// ============================================================
// 2. 入口：根据环境分流
// ============================================================

if (typeof $request !== 'undefined') {
    // ---------- 捕获模式（http-request 触发） ----------
    saveCookie();
} else {
    // ---------- 签到模式（cron / 手动触发） ----------
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
// 3. 捕获模式：保存 Cookie
// ============================================================

function saveCookie() {
    const headers = $request.headers || {};
    const cookieStr = headers['Cookie'] || headers['cookie'] || headers['COOKIE'];

    console.log('[捕获] 命中请求: ' + $request.url);

    if (!cookieStr) {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获失败 ❌', '请求头中没有 Cookie，请确认已在APP中登录');
        $done({});
        return;
    }

    const session = {
        url: $request.url,           // 仅作记录，签到时不使用
        headers: $request.headers,   // 核心凭证
        body: $request.body || ''    // 签到请求体（含登录凭证）
    };

    if ($persistentStore.write(JSON.stringify(session), KEY_LOGIN)) {
        console.log('[捕获] 登录参数已保存');
        $notification.post(SCRIPT_NAME, 'Cookie 捕获成功 ✅', '已保存登录参数，签到功能已就绪');
    } else {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获失败 ❌', '本地存储写入失败');
    }

    // 原样放行，不干扰APP正常签到
    $done({});
}

// ============================================================
// 4. 签到模式：主流程
// ============================================================

async function runSign() {
    // 4.1 读取登录参数
    let opts;
    try {
        const val = $persistentStore.read(KEY_LOGIN);
        opts = val ? JSON.parse(val) : null;
    } catch (e) {
        opts = null;
    }

    // 诊断日志
    if (opts) {
        console.log('[诊断] 已读取存储，Cookie前80字: ' + String(getCookieStr(opts)).slice(0, 80));
    } else {
        console.log('[诊断] 本地存储为空，未捕获过Cookie');
    }

    if (!opts || !getCookieStr(opts)) {
        notify('签到失败', '未找到登录参数，请打开顺丰APP进入会员中心手动签到一次以捕获Cookie');
        $done({});
        return;
    }

    // 4.2 模拟登录（获取 sign，建立Web登录态）
    const loginData = await loginapp(opts);
    await wait(1000);
    await loginweb(loginData);
    await wait(1000);

    // 4.3 签到
    const signData = await doSign(opts);
    await wait(1000);

    // 4.4 每日任务
    const tasks = await queryDailyTask(opts);
    for (const task of tasks) {
        if (task.status === 2) {
            // 未完成 → 先做任务再领积分
            await doTask(opts, task);
            await wait(500);
            await getPoint(opts, task);
        } else if (task.status === 1) {
            // 已完成未领取 → 直接领积分
            await getPoint(opts, task);
        } else if (task.status === 3) {
            task.result = '积分已领取';
        }
        await wait(500);
    }

    // 4.5 汇总通知
    showmsg(signData, tasks);
    $done({});
}

// ============================================================
// 5. 登录相关（URL 全部硬编码）
// ============================================================

function loginapp(opts) {
    return new Promise((resolve) => {
        // 从捕获的请求头中挑选有用的字段（不带 Cookie，走登录流程）
        const srcHeaders = opts.headers || {};
        const headers = {
            'Content-Type': 'application/json'
        };
        ['token', 'Token', 'x-auth-token', 'sysCode', 'platform',
         'accept-language', 'user-agent', 'User-Agent', 'referer', 'Referer', 'Origin'
        ].forEach(k => {
            if (srcHeaders[k]) headers[k] = srcHeaders[k];
        });

        const req = {
            url: API.login,
            headers: headers,
            body: opts.body || '{"comeFrom": "vioin", "channelFrom": "SFAPP"}'
        };

        $httpClient.post(req, (error, response, data) => {
            if (error) {
                console.log('APP登录失败: ' + JSON.stringify(error));
                resolve(null);
                return;
            }
            // 排查日志：打印原始响应前300字符
            console.log('APP登录原始响应: ' + String(data).slice(0, 300));
            try {
                resolve(JSON.parse(data));
            } catch (e) {
                console.log('APP登录解析失败: ' + e);
                resolve(null);
            }
        });
    });
}

function loginweb(loginData) {
    return new Promise((resolve) => {
        if (!loginData || !loginData.obj || !loginData.obj.sign) {
            console.log('登录响应缺少 sign 字段，跳过Web登录');
            resolve();
            return;
        }

        const sign = encodeURIComponent(loginData.obj.sign);
        $httpClient.get({
            url: `${API.loginRedirect}?sign=${sign}&source=SFAPP&bizCode=647@RnlvejM1R3VTSVZ6d3BNaXJxRFpOUVVtQkp0ZnFpNDBKdytobm5TQWxMeHpVUXVrVzVGMHVmTU5BVFA1bXlwcw==`
        }, (error, response, data) => {
            if (error) {
                console.log('Web登录失败: ' + JSON.stringify(error));
            } else {
                console.log('Web登录成功');
            }
            resolve();
        });
    });
}

// ============================================================
// 6. 签到与任务（URL 全部硬编码）
// ============================================================

function doSign(opts) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: API.sign,
            headers: buildHeaders(opts),
            body: '{"comeFrom": "vioin", "channelFrom": "SFAPP"}'
        }, (error, response, data) => {
            if (error) {
                console.log('签到请求失败: ' + JSON.stringify(error));
                resolve(null);
                return;
            }
            console.log('签到原始响应: ' + String(data).slice(0, 300));
            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
    });
}

function queryDailyTask(opts) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: API.taskQuery,
            headers: buildHeaders(opts),
            body: '{"channelType":"1"}'
        }, (error, response, data) => {
            if (error) {
                console.log('查询任务失败: ' + JSON.stringify(error));
                resolve([]);
                return;
            }
            try {
                const d = JSON.parse(data);
                resolve((d.obj && d.obj.taskTitleLevels) || []);
            } catch (e) {
                console.log('查询任务解析失败: ' + e);
                resolve([]);
            }
        });
    });
}

function doTask(opts, task) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: API.taskFinish,
            headers: buildHeaders(opts),
            body: `{"taskCode":"${task.taskCode}"}`
        }, (error, response, data) => {
            if (error) {
                console.log(`任务 ${task.taskCode} 执行失败: ` + JSON.stringify(error));
            } else {
                console.log(`任务 ${task.taskCode} 执行响应: ` + String(data).slice(0, 200));
            }
            resolve();
        });
    });
}

function getPoint(opts, task) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: API.taskPoint,
            headers: buildHeaders(opts),
            body: `{"strategyId":${task.strategyId},"taskId":"${task.taskId}","taskCode":"${task.taskCode}","channelType":"1"}`
        }, (error, response, data) => {
            if (error) {
                task.result = '失败';
                resolve();
                return;
            }
            try {
                const d = JSON.parse(data);
                task.result = d.success ? '✅ 成功' : (d.errorMessage || '失败');
            } catch (e) {
                task.result = '解析失败';
            }
            resolve();
        });
    });
}

// ============================================================
// 7. 工具函数
// ============================================================

function buildHeaders(opts) {
    const srcHeaders = opts.headers || {};
    const headers = {
        'Content-Type': 'application/json',
        'Cookie': getCookieStr(opts)
    };
    ['token', 'Token', 'x-auth-token', 'sysCode', 'platform',
     'accept-language', 'user-agent', 'User-Agent', 'referer', 'Referer', 'Origin'
    ].forEach(k => {
        if (srcHeaders[k]) headers[k] = srcHeaders[k];
    });
    return headers;
}

function getCookieStr(opts) {
    const h = opts.headers || {};
    return h['Cookie'] || h['cookie'] || h['COOKIE'] || '';
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function notify(subtitle, content) {
    $notification.post(SCRIPT_NAME, subtitle, content);
}

function showmsg(signData, tasks) {
    let subtitle = '签到: ';
    const content = [];

    if (signData && signData.success) {
        const obj = signData.obj || {};
        subtitle += obj.hasFinishSign ? '已签过' : '成功';
        content.push(`连续签到: ${obj.countDay || 0} 天`);
    } else {
        subtitle += '失败';
        content.push(`说明: ${signData ? signData.errorMessage : 'Cookie可能已失效，请重新在APP内签到一次捕获'}`);
    }

    if (tasks && tasks.length > 0) {
        content.push('', '每日任务:');
        for (const t of tasks) {
            content.push(`${t.title}: ${t.result || '未执行'}`);
        }
    }

    notify(subtitle, content.join('\n'));
}
