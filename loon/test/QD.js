/*
📖 起点读书 - 自动任务 (Loon 单文件版1.0)

功能: 签到 / 看广告 / 抽奖 / 兑换章节卡 / 领取礼物 / 消息盒子
只需 Cookie 即可运行，无需 rewrite 拦截

[Script]
cron "30 9 * * *" script-path=qidian_all.js, tag=起点读书, enabled=true

[说明]
首次使用：在 Loon 的持久化存储中设置 qd_cookie 为你的完整 Cookie
获取方式：抓包 h5.if.qidian.com 任意请求的 Cookie 头
*/

// ==================== 配置区 ====================
const CONFIG = {
    // 持久化存储键名
    COOKIE_KEY: 'qd_cookie',
    DEBUG_KEY: 'qd_debug',

    // 通知
    NOTIFY_TITLE: '起点读书',

    // 任务开关（设为 false 可关闭对应任务）
    TASKS: {
        checkin: true,        // 每日签到
        watchAdv: true,       // 看广告（福利中心）
        dailyTask: true,      // 每日任务
        lottery: true,        // 抽奖
        exchange: true,       // 兑换章节卡
        chapterCard: true,    // 章节卡信息
        messageBox: true,     // 消息盒子（大咖荐书）
    },

    // 网络
    TIMEOUT: 10000,
    MAX_RETRY: 3,
    RETRY_DELAY: 3000,

    // 广告
    ADV_INTERVAL_MIN: 2000,   // 每次广告间隔最小ms
    ADV_INTERVAL_MAX: 8000,   // 每次广告间隔最大ms
};

// ==================== 日志工具 ====================
const Logger = {
    debug(...args) { console.log('🐛 ' + args.join(' ')); },
    info(...args) { console.log('ℹ️ ' + args.join(' ')); },
    warn(...args) { console.log('⚠️ ' + args.join(' ')); },
    error(...args) { console.log('❌ ' + args.join(' ')); },
    success(...args) { console.log('✅ ' + args.join(' ')); },
};

// ==================== 工具函数 ====================
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomDelay(min = CONFIG.ADV_INTERVAL_MIN, max = CONFIG.ADV_INTERVAL_MAX) {
    const delay = min + Math.floor(Math.random() * (max - min));
    Logger.info(`⏳ 等待 ${(delay / 1000).toFixed(1)}s`);
    return wait(delay);
}

function safeStr(val, fallback = '') {
    return (val === undefined || val === null || val === '') ? fallback : String(val);
}

function safeNum(val, fallback = 0) {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
}

// ==================== Cookie 解析 ====================
class CookieJar {
    constructor(raw) {
        this._map = new Map();
        this.parse(raw);
    }

    parse(raw) {
        if (typeof raw !== 'string' || !raw) return this;
        const parts = raw.split(';');
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (!part) continue;
            const eqIdx = part.indexOf('=');
            const key = eqIdx === -1 ? part : part.slice(0, eqIdx);
            const val = eqIdx === -1 ? '' : part.slice(eqIdx + 1);
            if (!key) continue;
            let decoded;
            try { decoded = decodeURIComponent(val); } catch { decoded = val; }
            this._map.set(key, decoded);
        }
        return this;
    }

    get(name) {
        if (!name) return null;
        return this._map.has(name) ? this._map.get(name) : null;
    }

    set(name, value) {
        if (!name) return this;
        this._map.set(name, value == null ? '' : String(value));
        return this;
    }

    has(name) {
        return !!name && this._map.has(name);
    }

    toString() {
        const arr = [];
        for (const [k, v] of this._map) {
            arr.push(k + '=' + v);
        }
        return arr.join('; ');
    }
}

// ==================== Base64 解码兼容层 ====================
function base64Decode(str) {
    if (!str) return '';
    if (typeof atob === 'function') {
        try { return decodeURIComponent(escape(atob(str))); } catch (e) {}
    }
    if (typeof Buffer !== 'undefined') {
        try { return Buffer.from(str, 'base64').toString('utf-8'); } catch (e) {}
    }
    // Fallback 手动解码
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    for (let block = 0, char1, char2, char3, idx = 0; idx < str.length;) {
        char1 = chars.indexOf(str.charAt(idx++));
        char2 = chars.indexOf(str.charAt(idx++));
        char3 = chars.indexOf(str.charAt(idx++));
        const b1 = char1 >> 2;
        const b2 = ((char1 & 3) << 4) | (char2 >> 4);
        output += String.fromCharCode(b1);
        if (char2 !== 64) output += String.fromCharCode(b2);
        if (char3 !== 64) {
            const b3 = ((char2 & 15) << 2) | (char3 >> 6);
            const b4 = char3 & 63;
            output += String.fromCharCode(b3);
            if (char3 !== 64) output += String.fromCharCode(b4);
        }
    }
    try { return decodeURIComponent(escape(output)); } catch { return output; }
}

function decodeUidFromQdheader(qdheader) {
    if (!qdheader) return '';
    try {
        const decoded = base64Decode(qdheader);
        const parts = decoded.split('|');
        return safeStr(parts[0]);
    } catch {
        return '';
    }
}

// ==================== 解析 Cookie 数据 ====================
function parseCookieData(cookieRaw) {
    const jar = new CookieJar(safeStr(cookieRaw, ''));
    const qdh = safeStr(jar.get('qdh') || jar.get('qdheader_qdh') || jar.get('_qdh'));
    const qdheader = safeStr(jar.get('qdheader') || jar.get('qd_header'));

    if (qdh) jar.set('qdh', qdh);
    if (qdheader) jar.set('qdheader', qdheader);

    return {
        jar,
        cookieString: jar.toString(),
        qdh,
        qdheader,
        uid: decodeUidFromQdheader(safeStr(jar.get('qdh') || jar.get('qdheader'))) || safeStr(jar.get('ywguid')),
        guid: safeStr(jar.get('ywguid')),
        qimei: safeStr(jar.get('qimei')),
        qimei36: safeStr(jar.get('qimei36') || jar.get('qimei')),
    };
}

// ==================== HTTP 请求封装 ====================
function httpRequest(options) {
    return new Promise((resolve, reject) => {
        const reqOpts = {
            url: options.url,
            method: options.method || 'GET',
            headers: options.headers || {},
            timeout: options.timeout || CONFIG.TIMEOUT,
        };

        if (options.body) reqOpts.body = options.body;
        if (options.params) {
            const qs = Object.entries(options.params)
                .filter(([, v]) => v !== undefined && v !== null && v !== '')
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            if (qs) reqOpts.url += (reqOpts.url.includes('?') ? '&' : '?') + qs;
        }

        $httpClient[reqOpts.method.toLowerCase()](reqOpts, (error, response, data) => {
            if (error) {
                reject(new Error(error.message || error));
                return;
            }
            let body = data;
            try { body = JSON.parse(data); } catch {}
            resolve({
                ok: response.status >= 200 && response.status < 300,
                status: response.status,
                headers: response.headers || {},
                data: body,
                raw: data,
            });
        });
    });
}

async function httpRequestWithRetry(options, retries = CONFIG.MAX_RETRY) {
    let lastError;
    for (let i = 0; i <= retries; i++) {
        if (i > 0) {
            Logger.warn(`🔄 第 ${i}/${retries} 次重试...`);
            await wait(CONFIG.RETRY_DELAY);
        }
        try {
            return await httpRequest(options);
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}

// ==================== 签名模块（核心） ====================
const SIGN_URL = 'https://h5.if.qidian.com/argus/api/v2/video/adv/sign';

async function getSign(cookieData, targetUrl, method, data) {
    const signBody = JSON.stringify({
        qdh: cookieData.qdh,
        qdheader: cookieData.qdheader,
        url: targetUrl,
        method: method,
        data: data || {},
        uid: cookieData.uid,
        guid: cookieData.guid,
        qimei: cookieData.qimei,
        qimei36: cookieData.qimei36,
    });

    let lastError;
    for (let i = 0; i <= CONFIG.MAX_RETRY; i++) {
        if (i > 0) {
            Logger.warn(`🔄 签名重试 ${i}/${CONFIG.MAX_RETRY}: ${lastError?.message || lastError}`);
            await wait(CONFIG.RETRY_DELAY);
        }
        try {
            const resp = await httpRequest({
                url: SIGN_URL,
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: signBody,
            });
            const result = resp.data;
            if (!result || result.Result !== 0 || !result.Data) {
                throw new Error('签名响应异常: ' + JSON.stringify(result));
            }
            return result.Data;
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}

// ==================== 默认请求头 ====================
const DEFAULT_HEADERS = {
    'Host': 'h5.if.qidian.com',
    'Accept': '*/*',
    'Accept-Language': 'zh-CN,zh-Hans;q=0.9',
    'Connection': 'keep-alive',
    'User-Agent': 'QDReader/9.9.9',
    'Referer': 'https://h5.if.qidian.com/new/welfareCenter/?_viewmode=0',
};

// ==================== API 客户端 ====================
class QidianClient {
    constructor(cookieData) {
        this.cookieData = cookieData;
    }

    async _request(url, method, params) {
        const signHeaders = await getSign(this.cookieData, url, method, params);
        const headers = {
            ...DEFAULT_HEADERS,
            ...signHeaders,
            'Cookie': this.cookieData.cookieString,
        };

        const options = { url, method, headers, timeout: CONFIG.TIMEOUT };
        if (method === 'GET') {
            options.params = params;
        } else {
            const body = Object.entries(params || {})
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join('&');
            options.body = body;
            headers['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        const resp = await httpRequestWithRetry(options);
        const biz = this._parseBiz(resp);
        if (this._isAuthExpired(biz)) throw new AuthExpiredError();
        resp.biz = biz;
        return resp;
    }

    _parseBiz(resp) {
        const status = resp.status || 0;
        const body = resp.data;
        const result = body?.Result;
        return {
            ok: resp.ok && (result === undefined || String(result) === '0'),
            status,
            result,
            message: (result === 403 || result === '403') ? '登录状态已失效，请重新获取Cookie' : safeStr(body?.Message || body?.Msg),
            data: body?.Data ?? body ?? null,
        };
    }

    _isAuthExpired(biz) {
        const msg = safeStr(biz.message);
        return biz.status === 401 || biz.status === 403 || biz.result === 403 || /登录状态已失效|重新登录|未登录|登录过期|cookie|ck/i.test(msg);
    }

    getWeekCheckinInfo(params) { return this._request('https://h5.if.qidian.com/argus/api/v3/checkin/getcurrentweekcheckininfo', 'GET', params); }
    doCheckin(data) { return this._request('https://h5.if.qidian.com/argus/api/v3/checkin/checkin', 'POST', data); }
    getPackageList(params) { return this._request('https://h5.if.qidian.com/argus/api/v3/checkin/packagelist', 'GET', params); }
    getAdvMainPage(params) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/mainPage', 'GET', params); }
    finishWatchAdv(data) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/finishWatch', 'POST', data); }
    getCheckinDetail(params) { return this._request('https://h5.if.qidian.com/argus/api/v3/checkin/detail', 'GET', params); }
    videoCallback(data) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/callback', 'POST', data); }
    doLottery(data) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/lottery', 'POST', data); }
    getExchangePage(params) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/exchangePage', 'GET', params); }
    exchangeGoods(data) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/exchange', 'POST', data); }
    receiveGifts(data) { return this._request('https://h5.if.qidian.com/argus/api/v3/checkin/receiveGifts', 'POST', data); }
    getChapterCardInfo(params) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/chapterCardInfo', 'GET', params); }
    pullMessage(params) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/messageBox/pull', 'GET', params); }
    getRewardDetail(params) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/reward/detail', 'GET', params); }
    rewardCallback(data) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/reward/callback', 'POST', data); }
    rewardAddShelf(data) { return this._request('https://h5.if.qidian.com/argus/api/v2/video/adv/reward/addShelf', 'POST', data); }
}

class AuthExpiredError extends Error {
    constructor() { super('登录状态已失效，请重新获取Cookie'); this.name = 'AuthExpiredError'; }
}

// ==================== 辅助函数 ====================
function taskResult(name, ok, detail) {
    return { name, ok, detail: detail || (ok ? '完成' : '失败') };
}

// 核心修复：还原起点底层的位运算混淆逻辑
function generateSignKey(uid) {
    if (!uid) return '0';
    try {
        const val = BigInt(uid);
        const transformed = (4n * val & 0x7ffffffffffffffcn) ^ 0x113a4fen;
        if (transformed === 0n) return '0';
        let result = '';
        const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let v = transformed;
        while (v > 0n) {
            result = CHARS[Number(v % 62n)] + result;
            v = v / 62n;
        }
        return result;
    } catch (e) {
        Logger.warn(`生成 SignKey 失败: ${e.message}`);
        return '0';
    }
}

function extractOrderId(text) {
    if (!text) return null;
    const match = text.match(/orderId=([a-f0-9]+)/i);
    return match ? match[1] : null;
}

// 核心修复：去除了原先错误加上 30 天的逻辑
function isRecentMessage(createTime) {
    if (!createTime) return false;
    const now = Date.now(); 
    const ts = typeof createTime === 'string' ? new Date(createTime).getTime() : Number(createTime);
    if (!ts || ts <= 0) return false;
    const diff = now - ts;
    return diff >= 0 && diff <= 30 * 24 * 3600 * 1000;
}

function formatDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function notify(subtitle, message) {
    $notification.post(CONFIG.NOTIFY_TITLE, subtitle || '', message || '');
}

// ==================== 任务执行模块 ====================
async function taskCheckin(client) {
    const taskName = '每日签到';
    try {
        const resp = await client.getWeekCheckinInfo();
        const biz = resp.biz;
        if (!biz.ok) return taskResult(taskName, false, biz.message || '获取签到信息失败');
        if (Number(biz.data?.TodayStatus) === 1) return taskResult(taskName, false, '今日已签到，无需重复');
        
        const checkinResp = await client.doCheckin({});
        const checkinBiz = checkinResp.biz;
        const ok = checkinBiz.ok || Number(checkinBiz.result) === 4111;
        return taskResult(taskName, ok, ok ? '签到成功' : checkinBiz.message || '签到失败');
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

async function taskWatchAdv(client) {
    const taskName = '看广告(福利中心)';
    try {
        const resp = await client.getAdvMainPage();
        const biz = resp.biz;
        if (!biz.ok) return taskResult(taskName, false, biz.message || '获取任务列表失败');
        const taskList = biz.data?.DailyBenefitModule?.TaskList;
        if (!taskList || taskList.length === 0) return taskResult(taskName, false, '任务列表为空');
        if (taskList[taskList.length - 1].IsFinished === 1) return taskResult(taskName, true, '已全部完成');

        for (let i = 0; i < taskList.length; i++) {
            const task = taskList[i];
            if (task.IsFinished === 1) continue;
            Logger.info(`[${taskName}] 执行第 ${i + 1}/${taskList.length} 次`);
            const watchResp = await client.finishWatchAdv({
                TaskId: task.TaskId, BanId: '0', BanMessage: '', ChannelId: '',
                CaptchaType: '0', CaptchaTicket: '', CaptchaRandstr: '',
                Gt: '', NewCaptcha: '0', ExtraData: '0', AdId: '', SessionKey: '',
            });
            const watchBiz = watchResp.biz;
            if (!watchBiz.ok && Number(watchBiz.result) !== 4111) {
                return taskResult(taskName, false, `第 ${i + 1} 次失败: ${watchBiz.message}`);
            }
            await randomDelay();
        }
        const checkResp = await client.getAdvMainPage();
        const checkList = checkResp.biz?.data?.DailyBenefitModule?.TaskList;
        const allDone = checkList && checkList.every(t => t.IsFinished === 1);
        return taskResult(taskName, allDone, allDone ? '全部完成' : '部分未完成');
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

async function taskDaily(client) {
    const taskName = '每日任务';
    try {
        const resp = await client.getAdvMainPage();
        const biz = resp.biz;
        if (!biz.ok) return taskResult(taskName, false, biz.message || '获取任务列表失败');

        const bonus = biz.data?.Bonus;
        if (bonus && bonus.TaskId !== undefined) {
            Logger.info(`[限时彩蛋] TaskId: ${bonus.TaskId}`);
            await client.finishWatchAdv({
                TaskId: bonus.TaskId, BanId: '0', BanMessage: '', ChannelId: '', 
                CaptchaType: '0', CaptchaTicket: '', CaptchaRandstr: '', 
                Gt: '', NewCaptcha: '0', ExtraData: '0', AdId: '', SessionKey: '',
            });
            await randomDelay();
        }

        const videoTab = biz.data?.VideoRewardTab?.TaskList;
        if (!videoTab || videoTab.length === 0) return taskResult(taskName, false, '未找到任务列表');
        const dailyTask = videoTab.find(t => t.Type === 'daily');
        if (!dailyTask) return taskResult(taskName, false, '未找到每日任务');
        if (dailyTask.IsFinished === 1) return taskResult(taskName, true, '已完成');

        for (let i = 0; i < 3; i++) {
            Logger.info(`[每日任务] 第 ${i + 1}/3 次`);
            const watchResp = await client.finishWatchAdv({
                TaskId: dailyTask.TaskId, BanId: '0', BanMessage: '', ChannelId: '', 
                CaptchaType: '0', CaptchaTicket: '', CaptchaRandstr: '', 
                Gt: '', NewCaptcha: '0', ExtraData: '0', AdId: '', SessionKey: '',
            });
            const watchBiz = watchResp.biz;
            if (!watchBiz.ok && Number(watchBiz.result) !== 4111) {
                Logger.warn(`[每日任务] 第 ${i + 1} 次失败: ${watchBiz.message}`);
                continue;
            }
            await randomDelay();
        }
        const checkResp = await client.getAdvMainPage();
        const checkTab = checkResp.biz?.data?.VideoRewardTab?.TaskList;
        const done = checkTab?.find(t => t.Type === 'daily')?.IsFinished === 1;
        return taskResult(taskName, done, done ? '完成' : '未完成');
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

async function taskLottery(client) {
    const taskName = '每日抽奖';
    try {
        const resp = await client.getAdvMainPage();
        const biz = resp.biz;
        if (!biz.ok) return taskResult(taskName, false, biz.message || '获取信息失败');
        const lotteryInfo = biz.data?.Lottery;
        if (!lotteryInfo) return taskResult(taskName, false, '无抽奖信息');

        let hasUrge = Number(lotteryInfo.HasVideoUrge) || 0;
        let hasCount = Number(lotteryInfo.HasCount) || 0;
        if (hasCount === 0 && hasUrge === 0) return taskResult(taskName, true, '无抽奖机会');

        for (let i = 0; i < hasUrge; i++) {
            Logger.info(`[抽奖] 激励视频 ${i + 1}/${hasUrge}`);
            const cbResp = await client.videoCallback({
                BanId: '', ChannelId: '0', CaptchaType: '', CaptchaTicket: '',
                CaptchaRandstr: '', Gt: '', AdId: '1001', ExtraData: '1',
            });
            const cbBiz = cbResp.biz;
            if (!cbBiz.ok && Number(cbBiz.result) !== 4111) {
                Logger.warn(`[抽奖] 激励视频失败: ${cbBiz.message}`);
                continue;
            }
            await randomDelay();
        }

        const totalCount = hasCount + hasUrge;
        let successCount = 0;
        const prizes = [];
        for (let i = 0; i < totalCount; i++) {
            Logger.info(`[抽奖] 第 ${i + 1}/${totalCount} 次抽奖`);
            const lotResp = await client.doLottery({ BanId: '', ChannelId: '0', CaptchaTicket: '', CaptchaRandstr: '', Gt: '' });
            const lotBiz = lotResp.biz;
            if (lotBiz.ok || Number(lotBiz.result) === 4111) {
                successCount++;
                const prize = lotBiz.data?.PrizeName || lotBiz.data?.PrizeDesc;
                if (prize) prizes.push(prize);
            } else {
                Logger.warn(`[抽奖] 失败: ${lotBiz.message}`);
            }
            await randomDelay();
        }
        const prizeStr = prizes.length ? ` 获得: ${prizes.join('、')}` : '';
        const ok = successCount === totalCount;
        return taskResult(taskName, ok, ok ? `完成 ${successCount} 次${prizeStr}` : `成功 ${successCount}/${totalCount}${prizeStr}`);
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

async function taskExchange(client) {
    const taskName = '兑换章节卡';
    try {
        const resp = await client.getExchangePage();
        const biz = resp.biz;
        if (!biz.ok) return taskResult(taskName, false, biz.message || '获取信息失败');
        const data = biz.data;
        const balance = Number(data?.Balance) || 0;
        if (balance <= 0) return taskResult(taskName, false, `余额不足(${balance})`);
        const goods = data?.Goods || [];
        if (!goods.length) return taskResult(taskName, false, '商品列表为空');

        let target = null;
        for (const item of goods) {
            const price = Number(item.Price) || 0;
            if (price <= balance && (!target || price > Number(target.Price))) target = item;
        }
        if (!target) return taskResult(taskName, false, `余额不足(${balance})`);
        Logger.info(`[兑换] 目标: ${target.Name}, 价格: ${target.Price}, 章节卡: ${target.ChapterCardCount}`);

        const exResp = await client.exchangeGoods({ GoodsId: target.GoodsId });
        const exBiz = exResp.biz;
        if (Number(exBiz.result) === 4111) return taskResult(taskName, false, '库存不足');
        if (!exBiz.ok) return taskResult(taskName, false, exBiz.message || '兑换失败');
        return taskResult(taskName, true, `兑换 ${target.Name} 成功，章节卡=${target.ChapterCardCount}张`);
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

async function taskChapterCard(client) {
    const taskName = '章节卡信息';
    try {
        const resp = await client.getChapterCardInfo();
        const biz = resp.biz;
        if (!biz.ok) return taskResult(taskName, false, biz.message || '获取失败');
        const cards = biz.data?.ChapterCardList || [];
        if (!cards.length) return taskResult(taskName, true, '无章节卡');

        let totalCards = 0, totalDays = 0;
        for (const card of cards) {
            totalCards += (Number(card.CardCount) || 0) * (Number(card.ValidDays) || 0);
            totalDays += Number(card.ValidDays) || 0;
        }
        let nearestExpiry = '';
        for (const card of cards) {
            const ts = Number(card.ExpireTime) || 0;
            if (ts > 0 && ts < Infinity) {
                const d = new Date(ts);
                nearestExpiry = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            }
        }
        const detail = `总计${totalCards}张，剩余${totalDays}天` + (nearestExpiry ? `，最近到期: ${nearestExpiry}` : '');
        return taskResult(taskName, true, detail);
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

async function taskMessageBox(client, cookieRaw) {
    const taskName = '大咖荐书';
    try {
        const jar = new CookieJar(safeStr(cookieRaw, ''));
        const qdh = safeStr(jar.get('qdh') || jar.get('qdheader_qdh'));
        let uid = '';
        if (qdh) {
            try { uid = safeStr(base64Decode(qdh).split('|')[0]); } catch {}
        }
        if (!uid) uid = safeStr(jar.get('ywguid'));
        if (!uid) return taskResult(taskName, false, '无法获取用户ID');

        const signKey = generateSignKey(uid);
        const msgResp = await client.pullMessage({ sessionKey: signKey, BanId: '0', pg: '1', pz: '10' });
        const msgBiz = msgResp.biz;
        if (!msgBiz.ok) return taskResult(taskName, false, msgBiz.message || '获取消息失败');

        const senders = msgBiz.data?.SenderList;
        if (!senders || !senders.length) return taskResult(taskName, true, '无消息');
        const unread = senders.filter(s => s.RedPoint === 0 && s.SessionKey);
        if (!unread.length) return taskResult(taskName, true, '无未读消息');

        let rewardCount = 0;
        const rewards = [];

        for (const sender of unread) {
            const pullResp = await client.pullMessage({ sessionKey: signKey, BanId: '0', SessionKey: sender.SessionKey, pg: '1', pz: '10' });
            const pullBiz = pullResp.biz;
            if (!pullBiz.ok) continue;

            const msgs = (pullBiz.data?.MessageList || []).filter(m => isRecentMessage(m.CreateTime));
            for (const msg of msgs) {
                const orderId = extractOrderId(msg.Content || msg.ExtJson);
                if (!orderId) continue;
                Logger.info(`[消息盒子] 发现订单: ${orderId}`);

                const detailResp = await client.getRewardDetail({ orderId, BanId: '0' });
                const detailBiz = detailResp.biz;
                if (!detailBiz.ok) continue;

                const rewardData = detailBiz.data || {};
                const chanceCount = Number(rewardData.ChanceCount) || 0;
                const rewardStatus = Number(rewardData.Status) || 0;
                const bookId = rewardData.BookId || '';

                if (rewardData.Status !== undefined && Number(rewardData.Status) !== 0) continue;

                if (chanceCount > 0) {
                    await randomDelay();
                    const cbResp = await client.rewardCallback({ orderId, checkRisk: '1' });
                    const cbBiz = cbResp.biz;
                    if (cbBiz.ok || String(cbBiz.result) === '0') {
                        rewardCount++;
                        rewards.push(rewardData.BookName || orderId);
                    }
                    continue;
                }
                if (rewardStatus === 1 || rewardStatus === 2) {
                    if (!bookId) continue;
                    await randomDelay();
                    try {
                        const shelfResp = await client.rewardAddShelf({ orderId, bookId });
                        if (shelfResp.biz.ok || String(shelfResp.biz.result) === '0') {
                            rewardCount++;
                            rewards.push(rewardData.BookName || orderId);
                        }
                    } catch {}
                    continue;
                }
                if (rewardStatus === 3) {
                    await randomDelay();
                    try {
                        const cbResp = await client.rewardCallback({ orderId, checkRisk: '0' });
                        if (cbResp.biz.ok || String(cbResp.biz.result) === '0') {
                            rewardCount++;
                            rewards.push(rewardData.BookName || orderId);
                        }
                    } catch {}
                }
            }
            await randomDelay();
        }
        if (rewardCount > 0) return taskResult(taskName, true, `领取 ${rewardCount} 个奖励` + (rewards.length ? `: ${rewards.join(', ')}` : ''));
        return taskResult(taskName, true, '无可领取奖励');
    } catch (e) { return taskResult(taskName, false, e?.message || String(e)); }
}

// ==================== 主流程 ====================
(async () => {
    const cookieRaw = $persistentStore.read(CONFIG.COOKIE_KEY);
    if (!cookieRaw) {
        Logger.error('未找到 Cookie，请先设置');
        notify('⚠️ 缺少Cookie', '请在持久化存储中设置 qd_cookie');
        return;
    }

    const cookieData = parseCookieData(cookieRaw);
    if (!cookieData.qdh && !cookieData.qdheader) {
        Logger.error('Cookie 中未找到 qdh 或 qdheader 字段');
        notify('⚠️ Cookie无效', '请重新获取起点读书Cookie');
        return;
    }

    Logger.info('📖 起点读书任务开始执行');
    Logger.info(`👤 UID: ${cookieData.uid}`);
    const client = new QidianClient(cookieData);

    let nickName = '';
    try {
        const userResp = await client.getCheckinDetail({ checkinType: '0' });
        nickName = safeStr(userResp.biz?.data?.UserInfo?.NickName);
        Logger.info(`👤 昵称: ${nickName || '未知'}`);
    } catch {}

    const results = [];
    try {
        if (CONFIG.TASKS.checkin) results.push(await taskCheckin(client));
        if (CONFIG.TASKS.watchAdv) results.push(await taskWatchAdv(client));
        if (CONFIG.TASKS.dailyTask) results.push(await taskDaily(client));
        if (CONFIG.TASKS.lottery) results.push(await taskLottery(client));
        if (CONFIG.TASKS.exchange) results.push(await taskExchange(client));
        if (CONFIG.TASKS.chapterCard) results.push(await taskChapterCard(client));
        if (CONFIG.TASKS.messageBox) results.push(await taskMessageBox(client, cookieRaw));

        try {
            const giftResp = await client.receiveGifts({ checkinType: 0 });
            const giftBiz = giftResp.biz;
            const giftOk = giftBiz.ok || Number(giftBiz.result) === 4111;
            results.push(taskResult('领取礼物', giftOk, giftOk ? '领取成功' : giftBiz.message || '领取失败'));
        } catch {}

    } catch (e) {
        if (e instanceof AuthExpiredError) {
            results.push(taskResult('鉴权', false, e.message));
            notify('⚠️ Cookie已过期', '请重新获取起点读书Cookie');
        } else {
            throw e;
        }
    }

    const successCount = results.filter(r => r.ok).length;
    const lines = [ `👤 ${nickName || '未知'}`, `📅 ${formatDate()}`, `📊 成功 ${successCount}/${results.length}`, '' ];
    for (const r of results) lines.push(`${r.ok ? '✅' : '❌'} ${r.name}: ${r.detail}`);

    const summary = lines.join('\n');
    console.log(summary);
    notify(`任务完成 ${successCount}/${results.length}`, summary);

})().catch(e => {
    Logger.error('脚本执行异常: ' + (e?.message || e));
    notify('脚本异常', e?.message || String(e));
}).finally(() => {
    $done();
});
