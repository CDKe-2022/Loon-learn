/*
 * 顺丰速运签到脚本（Loon 专用 · 单文件版）
 * 
 * 一个文件两种角色：
 *   1. http-request 触发 → 捕获 Cookie 并保存
 *   2. cron 定时触发 → 自动签到 + 领积分
 * 
 * 首次使用：打开顺丰APP → 会员中心 → 手动点一次签到 → 捕获成功通知
 * 之后：每天定时自动签到，Cookie 失效会通知重新捕获
 */

// ============================================================
// 1. 常量
// ============================================================

const SCRIPT_NAME = '顺丰速运';
const KEY_LOGIN = 'chavy_login_sfexpress';
const API_HOST = 'mcs-mimp-web.sf-express.com';

// ============================================================
// 2. 入口：根据环境分流
// ============================================================

if (typeof $request !== 'undefined') {
    // ---------- 捕获模式（http-request 触发） ----------
    saveCookie();
} else {
    // ---------- 签到模式（cron 手动/定时触发） ----------
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
    const hasCookie = headers['Cookie'] || headers['cookie'] || headers['COOKIE'];

    if (!hasCookie) {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获失败 ❌', '请求头中没有 Cookie，请先在APP中登录');
        $done({});
        return;
    }

    const session = {
        url: $request.url,
        headers: $request.headers,
        body: $request.body || ''
    };

    if ($persistentStore.write(JSON.stringify(session), KEY_LOGIN)) {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获成功 ✅', '已保存登录参数，签到功能已就绪');
        console.log('[捕获] 登录参数已保存');
    } else {
        $notification.post(SCRIPT_NAME, 'Cookie 捕获失败 ❌', '本地存储写入失败');
    }

    // 原样放行，不干扰APP
    $done({});
}

// ============================================================
// 4. 签到模式：主流程
// ============================================================

async function runSign() {
    // 4.1 读取登录参数
    let loginOpts;
    try {
        const val = $persistentStore.read(KEY_LOGIN);
        loginOpts = val ? JSON.parse(val) : null;
    } catch (e) {
        loginOpts = null;
    }

    if (!loginOpts) {
        notify('签到失败', '未找到登录参数，请先在顺丰APP内手动点一次签到以捕获Cookie');
        $done({});
        return;
    }

    // 4.2 模拟登录
    const loginData = await loginapp(loginOpts);
    await wait(1000);
    await loginweb(loginData);
    await wait(1000);

    // 4.3 签到
    const signData = await doSign(loginOpts);
    await wait(1000);

    // 4.4 每日任务
    const tasks = await queryDailyTask(loginOpts);
    for (const task of tasks) {
        if (task.status === 2) {
            await doTask(loginOpts, task);
            await getPoint(loginOpts, task);
        } else if (task.status === 1) {
            await getPoint(loginOpts, task);
        } else if (task.status === 3) {
            task.result = '积分已领取';
        }
    }

    // 4.5 汇总通知
    showmsg(signData, tasks);
    $done({});
}

// ============================================================
// 5. 登录相关
// ============================================================

function loginapp(opts) {
    return new Promise((resolve) => {
        const req = JSON.parse(JSON.stringify(opts)); // 深拷贝
        if (req.headers) delete req.headers.Cookie;   // 原版逻辑：登录时移除Cookie

        $httpClient.post(req, (error, response, data) => {
            if (error) {
                console.log('APP登录失败: ' + JSON.stringify(error));
                resolve(null);
                return;
            }
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
            console.log('缺少 sign，跳过Web登录');
            resolve();
            return;
        }

        const sign = encodeURIComponent(loginData.obj.sign);
        $httpClient.get({
            url: `https://${API_HOST}/mcs-mimp/share/app/shareRedirect?sign=${sign}&source=SFAPP&bizCode=647@RnlvejM1R3VTSVZ6d3BNaXJxRFpOUVVtQkp0ZnFpNDBKdytobm5TQWxMeHpVUXVrVzVGMHVmTU5BVFA1bXlwcw==`
        }, (error) => {
            if (error) console.log('Web登录失败: ' + JSON.stringify(error));
            else console.log('Web登录成功');
            resolve();
        });
    });
}

// ============================================================
// 6. 签到与任务
// ============================================================

function doSign(opts) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage`,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': getCookieStr(opts)
            },
            body: '{"comeFrom": "vioin", "channelFrom": "SFAPP"}'
        }, (error, response, data) => {
            if (error) { console.log('签到失败: ' + JSON.stringify(error)); resolve(null); return; }
            try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
        });
    });
}

function queryDailyTask(opts) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES`,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': getCookieStr(opts)
            },
            body: '{"channelType":"1"}'
        }, (error, response, data) => {
            if (error) { console.log('查询任务失败'); resolve([]); return; }
            try {
                const d = JSON.parse(data);
                resolve((d.obj && d.obj.taskTitleLevels) || []);
            } catch (e) { resolve([]); }
        });
    });
}

function doTask(opts, task) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: `https://${API_HOST}/mcs-mimp/commonRoutePost/memberEs/taskRecord/finishTask`,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': getCookieStr(opts)
            },
            body: `{"taskCode":"${task.taskCode}"}`
        }, (error, response, data) => {
            if (error) console.log(`任务 ${task.taskCode} 执行失败`);
            resolve();
        });
    });
}

function getPoint(opts, task) {
    return new Promise((resolve) => {
        $httpClient.post({
            url: `https://${API_HOST}/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~fetchIntegral`,
            headers: {
                'Content-Type': 'application/json',
                'Cookie': getCookieStr(opts)
            },
            body: `{"strategyId":${task.strategyId},"taskId":"${task.taskId}","taskCode":"${task.taskCode}","channelType":"1"}`
        }, (error, response, data) => {
            if (error) { task.result = '失败'; resolve(); return; }
            try {
                const d = JSON.parse(data);
                task.result = d.success ? '✅ 成功' : (d.errorMessage || '失败');
            } catch (e) { task.result = '解析失败'; }
            resolve();
        });
    });
}

// ============================================================
// 7. 工具函数
// ============================================================

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
        content.push(`说明: ${signData ? signData.errorMessage : 'Cookie可能已失效，请重新捕获'}`);
    }

    if (tasks.length > 0) {
        content.push('', '每日任务:');
        for (const t of tasks) {
            content.push(`${t.title}: ${t.result || '未执行'}`);
        }
    }

    notify(subtitle, content.join('\n'));
}
