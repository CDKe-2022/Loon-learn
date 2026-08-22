/*
 * 顺丰速运自动签到脚本
 * Loon 专用版
 * 适配自 chavyleung/scripts
 * 日期：2025-07-07
 */

// ============================================================
// 1. Loon 环境守卫与通知函数
// ============================================================

if (typeof $loon === "undefined") {
    console.log("顺丰速运签到脚本：请在 Loon 环境中运行");
    $done({});
}

// 通知函数（简化版）
function notify(title, subtitle, content) {
    $notification.post(title, subtitle, content);
}

// ============================================================
// 2. 全局配置（常量）
// ============================================================

const SCRIPT_NAME = '顺丰速运';
const LOGIN_KEY = 'chavy_login_sfexpress';

// ============================================================
// 3. 工具函数：读取本地存储的登录参数
// ============================================================

function getLoginOpts() {
    try {
        const val = $persistentStore.read(LOGIN_KEY);
        return val ? JSON.parse(val) : null;
    } catch (e) {
        console.log('登录参数解析失败: ' + e);
        return null;
    }
}

// ============================================================
// 4. 核心函数：发起登录请求
// ============================================================

function loginapp() {
    return new Promise((resolve) => {
        const loginOpts = getLoginOpts();
        if (!loginOpts) {
            console.log('未找到登录参数，请先获取 Cookie');
            resolve();
            return;
        }

        // 移除请求头中的 Cookie，避免干扰
        if (loginOpts.headers && loginOpts.headers.Cookie) {
            delete loginOpts.headers.Cookie;
        }

        // 使用 Loon 原生 $httpClient 发起 POST 请求
        $httpClient.post(loginOpts, (error, response, data) => {
            if (error) {
                console.log('APP登录失败: ' + JSON.stringify(error));
                resolve();
                return;
            }

            try {
                const respData = JSON.parse(data);
                console.log('APP登录响应: ' + JSON.stringify(respData));
                resolve(respData);
            } catch (e) {
                console.log('APP登录响应解析失败: ' + e);
                resolve();
            }
        });
    });
}

// ============================================================
// 5. 核心函数：登录Web版（获取登录态）
// ============================================================

function loginweb(loginData) {
    return new Promise((resolve) => {
        if (!loginData || !loginData.obj || !loginData.obj.sign) {
            console.log('APP登录响应中缺少 sign 字段，无法登录Web版');
            resolve();
            return;
        }

        const sign = encodeURIComponent(loginData.obj.sign);
        const loginOpts = {
            url: `https://mcs-mimp-web.sf-express.com/mcs-mimp/share/app/shareRedirect?sign=${sign}&source=SFAPP&bizCode=647@RnlvejM1R3VTSVZ6d3BNaXJxRFpOUVVtQkp0ZnFpNDBKdytobm5TQWxMeHpVUXVrVzVGMHVmTU5BVFA1bXlwcw==`
        };

        // 使用 Loon 原生 $httpClient 发起 GET 请求
        $httpClient.get(loginOpts, (error, response, data) => {
            if (error) {
                console.log('Web登录失败: ' + JSON.stringify(error));
                resolve();
                return;
            }
            console.log('Web登录成功');
            resolve();
        });
    });
}

// ============================================================
// 6. 核心函数：执行签到操作
// ============================================================

function sign() {
    return new Promise((resolve) => {
        const signOpts = {
            url: 'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskSignPlusService~automaticSignFetchPackage',
            body: '{"comeFrom": "vioin", "channelFrom": "SFAPP"}',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // 使用 Loon 原生 $httpClient 发起 POST 请求
        $httpClient.post(signOpts, (error, response, data) => {
            if (error) {
                console.log('签到请求失败: ' + JSON.stringify(error));
                resolve(null);
                return;
            }

            try {
                const respData = JSON.parse(data);
                console.log('签到响应: ' + JSON.stringify(respData));
                resolve(respData);
            } catch (e) {
                console.log('签到响应解析失败: ' + e);
                resolve(null);
            }
        });
    });
}

// ============================================================
// 7. 核心函数：查询每日任务
// ============================================================

function queryDailyTask() {
    return new Promise((resolve) => {
        const taskOpts = {
            url: 'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~queryPointTaskAndSignFromES',
            body: '{"channelType":"1"}',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // 使用 Loon 原生 $httpClient 发起 POST 请求
        $httpClient.post(taskOpts, (error, response, data) => {
            if (error) {
                console.log('查询任务失败: ' + JSON.stringify(error));
                resolve([]);
                return;
            }

            try {
                const respData = JSON.parse(data);
                if (respData.obj && respData.obj.taskTitleLevels) {
                    resolve(respData.obj.taskTitleLevels);
                } else {
                    resolve([]);
                }
            } catch (e) {
                console.log('查询任务解析失败: ' + e);
                resolve([]);
            }
        });
    });
}

// ============================================================
// 8. 核心函数：执行单个任务
// ============================================================

async function doTask(task) {
    return new Promise((resolve) => {
        if (!task || !task.taskCode) {
            resolve();
            return;
        }

        const taskOpts = {
            url: 'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonRoutePost/memberEs/taskRecord/finishTask',
            body: `{"taskCode":"${task.taskCode}"}`,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // 使用 Loon 原生 $httpClient 发起 POST 请求
        $httpClient.post(taskOpts, (error, response, data) => {
            if (error) {
                console.log(`任务 ${task.taskCode} 执行失败: ` + JSON.stringify(error));
                resolve();
                return;
            }

            try {
                const respData = JSON.parse(data);
                console.log(`任务 ${task.taskCode} 执行响应: ` + JSON.stringify(respData));
            } catch (e) {
                console.log(`任务 ${task.taskCode} 响应解析失败: ` + e);
            }
            resolve();
        });
    });
}

// ============================================================
// 9. 核心函数：领取任务积分
// ============================================================

async function getPoint(task) {
    return new Promise((resolve) => {
        if (!task || !task.taskCode || !task.strategyId) {
            resolve();
            return;
        }

        const pointOpts = {
            url: 'https://mcs-mimp-web.sf-express.com/mcs-mimp/commonPost/~memberNonactivity~integralTaskStrategyService~fetchIntegral',
            body: `{"strategyId":${task.strategyId},"taskId":"${task.taskId}","taskCode":"${task.taskCode}","channelType":"1"}`,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        // 使用 Loon 原生 $httpClient 发起 POST 请求
        $httpClient.post(pointOpts, (error, response, data) => {
            if (error) {
                console.log(`任务 ${task.taskCode} 领取积分失败: ` + JSON.stringify(error));
                task.result = '失败';
                resolve();
                return;
            }

            try {
                const respData = JSON.parse(data);
                if (respData.success) {
                    task.result = '成功';
                } else {
                    task.result = respData.errorMessage || '失败';
                }
            } catch (e) {
                task.result = '解析失败';
            }
            resolve();
        });
    });
}

// ============================================================
// 10. 主流程：顺序执行所有签到步骤
// ============================================================

(async () => {
    console.log(`🔔 ${SCRIPT_NAME}, 开始执行！`);

    // 步骤1：APP登录
    const loginData = await loginapp();
    await wait(1000);

    // 步骤2：Web登录（建立登录态）
    await loginweb(loginData);
    await wait(1000);

    // 步骤3：执行签到
    const signData = await sign();
    await wait(1000);

    // 步4：处理每日任务
    const tasks = await queryDailyTask();
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        if (task.status === 1) {
            // 任务已完成，但未领取积分
            await getPoint(task);
        } else if (task.status === 2) {
            // 任务未完成，需先执行任务再领取积分
            await doTask(task);
            await getPoint(task);
        } else if (task.status === 3) {
            // 积分已领取
            task.result = '积分已领取！';
        } else {
            task.result = '未知状态';
        }
    }

    // 步骤5：发送通知
    showmsg(signData, tasks);

    console.log(`✅ ${SCRIPT_NAME} 执行完成！`);
    $done({});
})().catch(e => {
    console.log(`❌ ${SCRIPT_NAME} 执行出错: ` + JSON.stringify(e));
    $done({});
});

// ============================================================
// 11. 通知函数：显示签到结果
// ============================================================

function showmsg(signData, tasks) {
    let subtitle = '签到: ';
    let content = [];

    if (signData && signData.success) {
        if (signData.obj && signData.obj.hasFinishSign) {
            subtitle += '重复';
            content.push(`说明: 连续签到${signData.obj.countDay}天`);
        } else {
            subtitle += '成功';
            Loon 脚本规范要点content.push(`说明: 连续签到${signData.obj.countDay}天`);
        }
    } else {
        subtitle += '失败';
        const errmsg = signData ? signData.errorMessage : '未知错误';
        content.push(`说明: ${errmsg}`);
    }

    content.push('', '每日任务:');
    for (let i = 0; i < tasks.length; i++) {
        const name = tasks[i].title;
        const result = tasks[i].result || '未执行';
        content.push(`${name}: ${result}`);
    }

    notify(SCRIPT_NAME, subtitle, content.join('\n'));
}

// ============================================================
// 12. 等待函数（用于步骤间延时）
// ============================================================

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
