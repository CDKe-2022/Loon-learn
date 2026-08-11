/**
 * WPS · 每日签到 + 福利中心(打卡/抽奖/会员试用申请/限量爆款领取)+ 小程序每日打卡,送积分与会员时长
 * Loon 专用版 v1.2 (优化版)
 *
 * 优化点:
 * 1. 引入 $crypto 原生哈希加速(带纯 JS 兜底),提升整点执行性能
 * 2. 活动 ID 支持通过 Loon 插件参数 (argument) 热更新,无需改源码
 * 3. 登录校验异步化,让位给「限量爆款」抢整点,大幅提升超级会员抢购成功率
 * 4. 增强 JSON 解析与参数读取的容错率
 *
 * @Author: MaYIHEI <https://github.com/MaYIHEI/paperclip>
 * @Channel: Telegram 频道 https://t.me/mayihei
 * @Version: 1.2
 * @Updated: 2026-08-11
 *
 * ===== Loon =====
 * [MITM]
 * hostname = personal-act.wps.cn, personal-bus.wps.cn, personal-bus.wpscdn.cn, account.wps.cn
 * [Script]
 * http-request ^https:\/\/personal-act\.wps\.cn\/activity-rubik\/activity\/page_info tag=WPS Cookie, script-path=wps.cookie.js, requires-body=false, img-url=https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/wps.png, enable=true
 * cron "0 10 * * *" script-path=wps.js, tag=WPS签到, img-url=https://raw.githubusercontent.com/MaYIHEI/pin/refs/heads/main/app/wps.png, enable=true
 */

const CK_KEY = "wps_sid";

const SCRIPT_VERSION = "1.2"; 
const HTTP_TIMEOUT_MS = 15000; 
const TASK_TIMEOUT_MS = 45000; 
console.log(`[INFO] 脚本版本 ${SCRIPT_VERSION}`);

// 参数读取:优先取插件通过 argument 传入的值(支持 JSON 字符串与对象),没有时回退到持久化存储
function readRaw(k) {
    let arg = $argument;
    if (typeof arg === "string") {
        try { arg = JSON.parse(arg); } catch (e) { arg = {}; }
    }
    if (typeof arg === "object" && arg !== null && Object.prototype.hasOwnProperty.call(arg, k)) {
        return arg[k];
    }
    return $persistentStore.read(k);
}

function readFlag(k, defaultValue) {
    const v = readRaw(k);
    if (v === undefined || v === null || v === "") return defaultValue;
    if (typeof v === "boolean") return v;
    const s = String(v).trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(s)) return true;
    if (["false", "0", "no", "off"].includes(s)) return false;
    return defaultValue;
}

function taskOff(k) {
    return !readFlag(k, true);
}

function debug(content) {
    if (!readFlag("wps_debug", false)) return;
    console.log(`[DEBUG] ${typeof content === "string" ? content : JSON.stringify(content)}`);
}

let _taskIdx = 0, _taskTotal = 0;
function step(tag, msg) {
    const prefix = _taskTotal ? `[STEP] (${_taskIdx}/${_taskTotal}) ${tag}` : `[STEP] ${tag}`;
    console.log(`${prefix} → ${msg}`);
}

async function runManagedTask(tag, run) {
    try {
        await Promise.race([
            run(),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`任务超时(${Math.floor(TASK_TIMEOUT_MS / 1000)}s)`)), TASK_TIMEOUT_MS)
            ),
        ]);
    } catch (e) {
        const msg = String(e && e.message ? e.message : e);
        if (/任务超时/.test(msg)) {
            console.log(`[WARN] ${tag} 超时: ${msg}`);
            addResult("warn", tag, "超时", { reason: msg });
            return;
        }
        throw e;
    }
}

// ===== 接口 =====
const ISLOGIN = "https://account.wps.cn/api/v3/islogin";        
const ENC_KEY = "https://personal-bus.wps.cn/sign_in/v1/encrypt/key"; 
const DAY_INFO = "https://personal-bus.wps.cn/sign_in/v1/day_info";
const SIGN_IN = "https://personal-bus.wps.cn/sign_in/v1/sign_in";
const COMPONENT = "https://personal-act.wps.cn/activity-rubik/activity/component_action";
const PAGE_INFO = "https://personal-act.wps.cn/activity-rubik/activity/page_info"; 

const CLOCK_INFO = "https://personal-bus.wps.cn/activity/clock_in/v1/info";
const CLOCK_IN = "https://personal-bus.wps.cn/activity/clock_in/v1/clock_in";
const CLOCK_REWARD = "https://personal-bus.wps.cn/activity/clock_in/v1/reward"; 
const CLOCK_CONF = "https://personal-act.wpscdn.cn/srcapi/act/rubik-service/honeycomb-adapter/client/module-info?pid=113&mg_id=47736&id=48312";

// ===== 活动配置区 (支持 argument 热更新) =====
const ACTIVITY_PROFILE = {
    flzx: {
        name: "福利中心",
        // 优先从 Loon 插件参数读取，方便换期热更新；否则使用默认值
        activity_number: readRaw("activity_number") || "HD2025031721339450",
        page_number: readRaw("page_number") || "YM2025060910400185",
        position: "ios_flzx_grzxsdjg3001",
        components: {
            fragment: { name: "打卡领会员", component_number: "ZJ2025061815352884", component_node_id: "FN1769668388sb3w", type: 42 },
            lottery: { name: "天天抽奖", component_number: "ZJ2025092916519174", component_node_id: "FN1779447163CApn", type: 45, session_id: 3002 },
            trial: { name: "会员试用", component_number: "ZJ2025041115207603", component_node_id: "FN1744359116PWbV", type: 32 },
            hot: { name: "限量爆款", component_number: "ZJ2025041115200788", component_node_id: "FN1744358694RbIn", type: 31 },
        },
    },
};
const ACTIVITY = ACTIVITY_PROFILE.flzx;
const COMPONENTS = ACTIVITY.components;

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WpsiOS/26.6.1";
const MINI_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49(0x18003123) NetType/WIFI Language/zh_CN miniProgram";

const ACTION_GAP = [5, 10];

let results = []; 

function addResult(status, tag, message, extra) {
    results.push({
        status: status || "info",
        tag: tag || "未命名任务",
        message: message || "",
        extra: extra || {},
    });
}

function statusEmoji(status) {
    switch (status) {
        case "success": return "✅";
        case "warn": return "⚠️";
        case "error": return "❌";
        default: return "ℹ️";
    }
}

function renderResultsSummary() {
    const counts = { success: 0, warn: 0, error: 0, info: 0 };
    for (const item of results) counts[item.status] = (counts[item.status] || 0) + 1;
    const lines = [];
    const headline = [
        counts.success ? `成功${counts.success}` : "",
        counts.warn ? `警告${counts.warn}` : "",
        counts.error ? `异常${counts.error}` : "",
        counts.info ? `提示${counts.info}` : "",
    ].filter(Boolean).join("  ");
    if (headline) lines.push(headline);
    for (const item of results) {
        lines.push(`${statusEmoji(item.status)} ${item.tag}${item.message ? `:${item.message}` : ""}`);
    }
    return lines.join("\n");
}

function buildComponentUniq(comp) {
    return {
        activity_number: ACTIVITY.activity_number,
        page_number: ACTIVITY.page_number,
        component_number: comp.component_number,
        component_node_id: comp.component_node_id,
    };
}

function summarizeComponents(list, limit) {
    return (list || []).slice(0, limit || 8).map((c) => {
        const no = c && c.number ? c.number : "?";
        const node = c && c.component_node_id ? c.component_node_id : "?";
        const keys = c ? Object.keys(c).filter((k) => !["number", "component_node_id"].includes(k)).slice(0, 4).join("|") : "";
        return `${no}/${node}${keys ? `[${keys}]` : ""}`;
    }).join(" ; ");
}

const COMPONENT_PROBE_FIELDS = {
    hot: "privilege_select",
    fragment: "fragment_collect",
    lottery: "lottery_v2",
    trial: "divide_prize",
};

function describeComponent(c) {
    const no = c && c.number ? c.number : "?";
    const node = c && c.component_node_id ? c.component_node_id : "?";
    const keys = c ? Object.keys(c).filter((k) => !["number", "component_node_id"].includes(k)).slice(0, 6).join("|") : "";
    return `number=${no}, node=${node}${keys ? `, fields=${keys}` : ""}`;
}

function probeComponentCandidates(list, key) {
    const comp = COMPONENTS[key] || {};
    const field = COMPONENT_PROBE_FIELDS[key];
    const all = Array.isArray(list) ? list : [];
    const exactNumber = all.filter((c) => c && c.number === comp.component_number);
    const exactNode = all.filter((c) => c && c.component_node_id === comp.component_node_id);
    const byField = field ? all.filter((c) => c && typeof c[field] === "object") : [];
    const sections = [];
    if (exactNumber.length) sections.push(`同 number -> ${exactNumber.slice(0, 5).map(describeComponent).join(" ; ")}`);
    if (exactNode.length) sections.push(`同 node -> ${exactNode.slice(0, 5).map(describeComponent).join(" ; ")}`);
    if (byField.length) sections.push(`同字段 ${field} -> ${byField.slice(0, 5).map(describeComponent).join(" ; ")}`);
    if (!sections.length && all.length) sections.push(`前几个组件 -> ${all.slice(0, 8).map(describeComponent).join(" ; ")}`);
    return sections.join(" || ");
}

function formatActivityIssue(code, extra) {
    const detail = extra ? `，${extra}` : "";
    switch (code) {
        case "page_info_request_failed":
            return { step: "活动页状态请求失败", result: `活动可能换期(page_info 请求失败${detail})` };
        case "page_info_non_json":
            return { step: "活动页状态返回异常", result: `活动可能换期(page_info 非 JSON${detail})` };
        case "page_info_result_not_ok":
            return { step: "活动页状态未通过", result: `活动可能换期(page_info result 非 ok${detail})` };
        case "page_info_structure_changed":
            return { step: "活动页结构变化", result: `活动可能换期(page_info 结构变化${detail})` };
        case "component_missing":
            return { step: "未找到活动组件", result: `活动可能换期(缺少组件${detail})` };
        case "component_structure_changed":
            return { step: "活动组件结构变化", result: `活动可能换期(组件结构变化${detail})` };
        default:
            return { step: "活动配置异常", result: `活动可能换期(${code}${detail})` };
    }
}

function reportActivityIssue(tag, code, extra, detail, list) {
    const msg = formatActivityIssue(code, extra);
    step(tag, msg.step);
    addResult("warn", tag, msg.result, { code, detail, extra });
    if (detail) debug(`${tag} ${code}: ${detail}`);
    if (Array.isArray(list) && list.length) debug(`${tag} 组件候选: ${summarizeComponents(list, 10)}`);
}

function ensureComponentShape(tag, key, node, fieldName, list) {
    if (node && node[fieldName] && typeof node[fieldName] === "object") return node[fieldName];
    const comp = COMPONENTS[key];
    reportActivityIssue(tag, "component_structure_changed", `${comp.name || key} 缺少 ${fieldName}`, JSON.stringify(node || {}).slice(0, 240), list);
    const probe = probeComponentCandidates(list, key);
    if (probe) debug(`${tag} 探测日志: ${probe}`);
    return null;
}

function resolveActivityComponent(tag, list, key) {
    const comp = COMPONENTS[key];
    const node = findComp(list, comp.component_number, comp.component_node_id);
    if (node) return node;
    reportActivityIssue(
        tag,
        "component_missing",
        `${comp.name || key} ${comp.component_number}/${comp.component_node_id}`,
        `预期组件不存在`,
        list
    );
    const probe = probeComponentCandidates(list, key);
    if (probe) debug(`${tag} 探测日志: ${probe}`);
    return null;
}

if (readFlag("wps_clear", false)) {
    $persistentStore.write("", CK_KEY);
    $persistentStore.write("false", "wps_clear");
    $notification.post("WPS", "", "✅ Cookie 已清除，请重新抓取；若来自插件开关，请手动关闭“清除Cookie”");
    $done();
} else {
    main().catch((e) => {
        console.log(`[ERROR] 主流程异常: ${e}`);
        $notification.post("WPS", "❌ 运行异常", String(e));
    }).finally(() => $done());
}

async function main() {
    const sid = $persistentStore.read(CK_KEY);
    if (!sid) {
        $notification.post("WPS", "🚫 缺少 Cookie", "请先开启 cookie 抓取脚本,打开 WPS APP 进任意活动页停留 1 秒");
        return;
    }

    // 异步登录校验：不阻塞后续任务，让 taskHot 能够抢整点
    let loginFailedHard = false;
    const loginPromise = (async () => {
        let uid, lastErr;
        for (let attempt = 0; attempt < 2 && !uid; attempt++) {
            if (attempt > 0) await sleep(3000);
            try {
                console.log(`[STEP] 登录校验 → 请求 islogin${attempt > 0 ? `(重试 ${attempt + 1}/2)` : ""}`);
                const r = await httpReq("GET", ISLOGIN);
                const j = safeJson(r.body);
                if (!j || j.result !== "ok" || !j.userid) {
                    $notification.post("WPS", "🚫 登录态失效", "wps_sid 已过期,请重新抓取(打开 WPS 进活动页)");
                    console.log(`[ERROR] islogin 非 ok: ${(r.body || "").slice(0, 200)}`);
                    loginFailedHard = true; // 标记明确失效
                    return null;
                }
                uid = j.userid;
                console.log(`[INFO] user_id 已获取(${String(uid).slice(0, 3)}***)`);
            } catch (e) {
                lastErr = e; 
                console.log(`[WARN] islogin 网络错误(${attempt + 1}/2): ${e}`);
            }
        }
        if (!uid) {
            $notification.post("WPS", "⚠️ 网络异常", "islogin 请求超时(非 Cookie 失效),稍后会自动重试或手动运行一次");
            console.log(`[ERROR] islogin 重试后仍失败: ${lastErr}`);
            return null;
        }
        return uid;
    })();

    // 任务清单：签到任务改为接收 uid 参数，避免闭包陷阱
    const tasks = [
        ["wps_task_hot", "限量爆款", () => taskHot()],
        ["wps_task_trial", "会员试用", () => taskTrial()],
        ["wps_task_signin", "每日签到", (uid) => taskSignIn(uid)],
        ["wps_task_fragment", "打卡领会员", () => taskFragment()],
        ["wps_task_lottery", "天天抽奖", () => taskLottery()],
        ["wps_task_clockin", "小程序打卡", () => taskClockIn()],
    ];
    
    console.log(`[INFO] 任务开关 ${tasks.map(([k]) => `${k.slice(9)}=${JSON.stringify(readRaw(k))}`).join(" ")}`);

    const activeTasks = tasks.filter(([k]) => !taskOff(k));
    _taskTotal = activeTasks.length;

    let ran = 0;
    let cachedUid = null;
    
    for (const [key, label, run] of tasks) {
        if (taskOff(key)) continue;                    
        _taskIdx = ++ran;
        if (ran > 1) await sleep(jitter(ACTION_GAP)); 
        
        // 执行签到任务前，等待登录结果
        if (key === "wps_task_signin" && !cachedUid) {
            cachedUid = await loginPromise;
            if (!cachedUid) {
                addResult("error", "每日签到", "登录态获取失败，跳过");
                if (loginFailedHard) {
                    console.log("[INFO] 登录态明确失效，终止后续任务");
                    break; // 熔断：Cookie 失效时不再执行后续打卡抽奖等任务
                }
                continue;
            }
        }
        
        const taskFn = key === "wps_task_signin" ? () => run(cachedUid) : run;
        await runManagedTask(label, taskFn);
    }
    if (!ran) addResult("info", "任务开关", "所有任务均已关闭");

    console.log(`[STEP] 全部任务完成,共执行 ${ran} 项`);
    $notification.post("WPS 任务汇总", "", renderResultsSummary());
}

// ============ 任务:每日签到(请求体加密)============
async function taskSignIn(uid) {
    const tag = "每日签到";
    try {
        step(tag, "查询签到状态");
        const di = await httpReq("GET", DAY_INFO);
        const info = (safeJson(di.body).data || {}).info || {};
        if (info.has_sign) {
            step(tag, "今日已签到,跳过");
            addResult("success", tag, "已签到");
            return;
        }

        step(tag, "获取加密公钥");
        const ek = await httpReq("GET", ENC_KEY);
        const pubKeyB64 = (safeJson(ek.body) || {}).data;
        if (!pubKeyB64) throw new Error(`公钥获取失败: ${(ek.body || "").slice(0, 120)}`);

        step(tag, "加密请求体(AES+RSA)");
        const aesKey = genAesKey();
        const plain = JSON.stringify({ user_id: uid, platform: 32 }); 
        const extra = aesEncrypt(plain, aesKey, aesKey.substring(0, 16));
        const token = rsaEncryptB64(aesKey, pubKeyB64);

        step(tag, "提交签到");
        const body = JSON.stringify({ encrypt: true, extra, pay_origin: "ios_ucs_rwzx sign", channel: "" });
        const r = await httpReq("POST", SIGN_IN, { body, token });
        const j = safeJson(r.body);
        if (j && j.result === "ok") {
            const names = ((j.data || {}).rewards || []).map((x) => x.reward_name).filter(Boolean);
            step(tag, `完成 ✅${names.length ? " " + names.join("/") : ""}`);
            addResult("success", tag, `成功${names.length ? " " + names.join("/") : ""}`, { rewards: names });
        } else {
            const st = classify(j && (j.ext_msg || j.msg), "已签到");
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t);
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
        }
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

// ============ 任务:福利中心通用组件动作(明文 base64)============
async function taskComponent(tag, comp, action, payload, doneLabel) {
    try {
        const uniq = buildComponentUniq(comp);
        const reqObj = { component_uniq_number: uniq, component_type: comp.type, component_action: action };
        for (const k in payload) reqObj[k] = payload[k];

        const r = await httpReq("POST", COMPONENT, { body: JSON.stringify(reqObj) });
        const j = safeJson(r.body);
        if (!j) {
            addResult("error", tag, "无响应");
            debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
            return;
        }
        if (j.result !== "ok") {
            const st = classify(j.msg || j.ext_msg, doneLabel);
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t);
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
            return;
        }
        const inner = (j.data || {})[action.split(".")[0]] || {};
        if (inner.success === true) {
            addResult("success", tag, `成功${inner.reward_name ? " " + inner.reward_name : ""}`);
        } else {
            let reason = inner.reason || "";
            if (!reason && inner.error_code === 10005) reason = "次数用完";
            if (!reason) reason = j.msg || (inner.error_code ? `code ${inner.error_code}` : "");
            const st = classify(reason, doneLabel);
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t, { reason });
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
        }
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

// ============ 福利中心 page_info 复用助手 ============
async function fetchPageInfo() {
    const filter = encodeURIComponent(JSON.stringify({ cs_from: "", mk_key: "", position: ACTIVITY.position }));
    const url = `${PAGE_INFO}?activity_number=${ACTIVITY.activity_number}&page_number=${ACTIVITY.page_number}&filter_params=${filter}`;
    try {
        const pi = await httpReq("GET", url);
        const pj = safeJson(pi.body);
        if (!pj) return { ok: false, code: "page_info_non_json", detail: (pi.body || "").slice(0, 300) };
        if (pj.result !== "ok") return { ok: false, code: "page_info_result_not_ok", detail: (pi.body || "").slice(0, 300) };
        if (!Array.isArray(pj.data)) return { ok: false, code: "page_info_structure_changed", detail: (pi.body || "").slice(0, 300) };
        return { ok: true, list: pj.data };
    } catch (e) {
        return { ok: false, code: "page_info_request_failed", detail: String(e) };
    }
}

function findComp(list, number, node) {
    return (list || []).find((c) => c && c.number === number && (!node || c.component_node_id === node)) || null;
}

// ============ 任务:限量爆款 ============
async function taskHot() {
    const tag = "限量爆款";
    const comp = COMPONENTS.hot;
    try {
        step(tag, "获取活动页状态");
        const page = await fetchPageInfo();
        if (!page.ok) {
            reportActivityIssue(tag, page.code, `${ACTIVITY.name} page_info`, page.detail);
            return;
        }
        const node = resolveActivityComponent(tag, page.list, "hot");
        if (!node) return;
        const ps = ensureComponentShape(tag, "hot", node, "privilege_select", page.list) || {};
        const details = ps.privilege_select_details || [];
        if (!details.length) {
            reportActivityIssue(tag, "component_structure_changed", "限量爆款缺少 privilege_select_details", JSON.stringify(node).slice(0, 260), page.list);
            return;
        }

        if (ps.select_reach_limit) { step(tag, "今日已领取"); addResult("success", tag, "已领取(今日已选)"); return; }

        const score = (d) => (d.privilege_type === "privilege" ? 10000 : 0) + (d.hours || 0) * 100 + (d.nums || 0);
        const ranked = details.slice().sort((a, b) => score(b) - score(a));
        step(tag, `${ranked.length}个可选,按价值排序逐个抢`);

        let done = false;
        for (let i = 0; i < ranked.length; i++) {
            const d = ranked[i];
            step(tag, `尝试第${i + 1}档: ${d.title || "pid " + d.privilege_id}`);
            const reqObj = {
                component_uniq_number: buildComponentUniq(comp),
                component_type: comp.type,
                component_action: "privilege_select.exec",
                privilege_select: { group_id: d.group_id, privilege_id: d.privilege_id },
            };
            const r = await httpReq("POST", COMPONENT, { body: JSON.stringify(reqObj) });
            const j = safeJson(r.body);
            const inner = (j && j.data && j.data.privilege_select) || {};
            if (j && j.result === "ok" && inner.success === true) {
                step(tag, `抢到 ✅ ${d.title || "pid " + d.privilege_id}`);
                addResult("success", tag, `成功 ${d.title || "pid " + d.privilege_id}`);
                done = true;
                break;
            }
            debug(`${tag} ${d.title}(pid ${d.privilege_id})未中: ${(r.body || "").slice(0, 200)}`);
        }
        if (!done) addResult("warn", tag, "未领到(超级会员已秒光、其余也没抢到)");
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

// ============ 任务:福利中心打卡免费领会员 ============
async function taskFragment() {
    const tag = "打卡领会员";
    const comp = COMPONENTS.fragment;
    try {
        const today = beijingDate();
        step(tag, "获取活动页状态");
        const page = await fetchPageInfo();
        if (!page.ok) {
            reportActivityIssue(tag, page.code, `${ACTIVITY.name} page_info`, page.detail);
            return;
        }
        const node = resolveActivityComponent(tag, page.list, "fragment");
        if (!node) return;
        const fc = ensureComponentShape(tag, "fragment", node, "fragment_collect", page.list);
        if (!fc) return;
        const seriesId = fc.sign_series_id || "";
        const records = fc.sign_records || [];
        debug(`${tag} 读到 series_id=${seriesId || "(空)"} records=${records.map((r) => r.sign_date + ":" + r.sign_status).join(",")}`);

        const todayRec = records.find((r) => r && r.sign_date === today);
        if (todayRec && todayRec.sign_status === "signed") {
            step(tag, "今日已打卡,跳过");
            addResult("success", tag, "已打卡");
            return;
        }

        const isNew = !seriesId;
        step(tag, `提交打卡${isNew ? "(新序列)" : "(复用序列 " + seriesId.slice(-6) + ")"}`);
        const reqObj = {
            component_uniq_number: buildComponentUniq(comp),
            component_type: comp.type,
            component_action: "fragment_collect.sign_in",
            fragment_collect: { sign_date: today, series_id: seriesId, is_new_sign_series: isNew },
        };
        const r = await httpReq("POST", COMPONENT, { body: JSON.stringify(reqObj) });
        const j = safeJson(r.body);
        if (!j) {
            addResult("error", tag, "无响应");
            debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
            return;
        }
        if (j.result !== "ok") {
            const st = classify(j.msg || j.ext_msg, "已打卡");
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t);
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
            return;
        }
        const inner = (j.data || {}).fragment_collect || {};
        if (inner.success === true) {
            step(tag, `打卡成功 ✅${isNew ? "(新序列)" : ""}`);
            addResult("success", tag, `成功${isNew ? "(新序列)" : ""}`);
        } else {
            const st = classify(inner.reason || j.msg, "已打卡");
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t);
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
        }
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

// ============ 任务:天天抽奖 ============
async function taskLottery() {
    const tag = "天天抽奖";
    const comp = COMPONENTS.lottery;
    try {
        step(tag, "获取活动页状态");
        const page = await fetchPageInfo();
        if (!page.ok) {
            reportActivityIssue(tag, page.code, `${ACTIVITY.name} page_info`, page.detail);
            return;
        }
        const node = resolveActivityComponent(tag, page.list, "lottery");
        if (!node) return;
        const lv = ensureComponentShape(tag, "lottery", node, "lottery_v2", page.list) || {};
        const sessions = lv.lottery_list || [];
        const sess = sessions.find((s) => s && s.session_status === "IN_PROGRESS") || sessions[0];
        const sessionId = (sess && sess.session_id) || comp.session_id;
        const times = (sess && sess.times) || 0;

        if (times < 1) {
            step(tag, "今日暂无免费次数");
            addResult("success", tag, "今日暂无免费次数");
            return;
        }

        step(tag, `有${times}次免费机会,开始抽奖`);
        const reqObj = {
            component_uniq_number: buildComponentUniq(comp),
            component_type: comp.type,
            component_action: "lottery_v2.exec",
            lottery_v2: { session_id: sessionId },
        };
        const r = await httpReq("POST", COMPONENT, { body: JSON.stringify(reqObj) });
        const j = safeJson(r.body);
        const inner = (j && j.data && j.data.lottery_v2) || {};
        if (j && j.result === "ok" && inner.success === true) {
            addResult("success", tag, `成功${inner.reward_name ? " " + inner.reward_name : ""}`);
        } else {
            let reason = inner.send_msg || "";
            if (!reason && inner.error_code === 10005) reason = "次数用完";
            const st = classify(reason || (j && j.msg), "已完成");
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t, { reason });
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
        }
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

// ============ 任务:会员免费试用 ============
async function taskTrial() {
    const tag = "会员试用";
    try {
        const comp = COMPONENTS.trial;
        const base = {
            activity_number: ACTIVITY.activity_number,
            page_number: ACTIVITY.page_number,
            component_number: comp.component_number,
            component_node_id: comp.component_node_id,
        };
        const callTrial = async (action, extra) => {
            const reqObj = { component_uniq_number: base, component_type: comp.type, component_action: action };
            for (const k in extra) reqObj[k] = extra[k];
            const r = await httpReq("POST", COMPONENT, { body: JSON.stringify(reqObj) });
            return safeJson(r.body);
        };
        const short = (t) => String(t || "奖品").replace(/超级会员/g, ""); 

        step(tag, "预览当天奖品");
        const pv = await callTrial("divide_prize.preview", {});
        const details = (((pv || {}).data || {}).divide_prize || {}).divide_prize_details || [];
        if (!details.length || details.every((d) => d.has_join)) {
            step(tag, "全部已申请,跳过");
            addResult("success", tag, "全部已申请");
            return;
        }

        const todo = details.filter((d) => !d.has_join && (d.stock == null || d.stock > 0));
        step(tag, `${details.length}档奖品, ${todo.length}档待申领`);

        const parts = [];
        let allGood = true;
        let acted = 0;
        for (const d of details) {
            const name = short(d.title);
            if (d.has_join) { parts.push(`${name}已申请`); continue; }
            if (d.stock != null && d.stock <= 0) { parts.push(`${name}已领完`); allGood = false; continue; }
            if (acted > 0) await sleep(jitter(ACTION_GAP));
            acted++;
            step(tag, `申领 ${name}`);
            const su = await callTrial("divide_prize.sign_up", {
                divide_prize: { cycle_id: d.cycle_id, session_id: `${d.session_id}_${beijingDate()}` },
            });
            const inner = ((su || {}).data || {}).divide_prize || {};
            if (su && su.result === "ok" && inner.success === true) {
                parts.push(`${name}✓`);
            } else {
                const st = classify(inner.reason || (su && su.msg), "已申请");
                parts.push(`${name}${st.t}`);
                if (st.e !== "✅") { allGood = false; debug(`${tag} ${d.title}: ${JSON.stringify(su).slice(0, 200)}`); }
            }
        }
        step(tag, allGood ? "全部申领完成 ✅" : `完成(有${parts.filter(p => p.includes("已领完") || p.includes("没资格")).length}项异常)`);
        addResult(allGood ? "success" : "warn", tag, allGood ? "全部已申请" : parts.join(" "));
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

// ============ 任务:小程序每日打卡 ============
async function taskClockIn() {
    const tag = "小程序打卡";
    try {
        const sid = $persistentStore.read(CK_KEY);

        step(tag, "错峰等待中(避后端尖峰)");
        await sleep(jitter([3, 10]));

        step(tag, "获取动态盐 ss");
        let ss = "", cfBody = "";
        for (let i = 0; i < 2 && !ss; i++) {
            if (i > 0) await sleep(2000);
            const cf = await rawReq("GET", CLOCK_CONF, {});
            cfBody = cf.body || "";
            ss = (((safeJson(cfBody) || {}).data || {}).value || {}).ss;
        }

        step(tag, "获取动态密钥 s_key(最多重试4次)");
        let s_key = "", infBody = "";
        const backoff = [0, 3000, 6000, 9000];
        for (let i = 0; i < backoff.length && !s_key; i++) {
            if (backoff[i]) await sleep(backoff[i]);
            const inf = await rawReq("GET", `${CLOCK_INFO}?client_type=1&page_index=0&page_size=10`, { sid });
            infBody = inf.body || "";
            s_key = ((safeJson(infBody) || {}).data || {}).s_key;
            if (!s_key) debug(`${tag} info 重试 ${i + 1}/${backoff.length}: ${infBody.slice(0, 120)}`);
        }

        if (!ss || !s_key) {
            const which = !ss ? "ss" : "s_key";
            step(tag, `取 ${which} 失败,降级处理`);
            const src = !ss ? cfBody : infBody;
            const m = ((safeJson(src) || {}).msg) || src.slice(0, 60) || `缺 ${which}`;
            addResult("warn", tag, `接口异常(取 ${which} 失败:${m})`, { which, raw: src.slice(0, 120) });
            debug(`${tag} info: ss=${!!ss} s_key=${!!s_key} cf=${cfBody.slice(0, 120)} inf=${infBody.slice(0, 120)}`);
            return;
        }

        const bodyStr = canonicalJSON({ client_type: 1 });
        const date = new Date().toUTCString();
        step(tag, "签名并提交打卡");
        const signature = hmacSha256Hex(s_key + md5Hex(bodyStr) + date, ss);

        const r = await rawReq("POST", CLOCK_IN, { sid, body: bodyStr, date, signature });
        const j = safeJson(r.body);
        if (j && j.result === "ok") {
            const d = j.data || {};
            const rw = d.reward_name || (d.prize && d.prize.name) || (d.reward && d.reward.name) || "";
            step(tag, `打卡完成 ✅${rw ? " " + rw : ""}`);
            addResult("success", tag, `成功${rw ? " " + rw : ""}`);
        } else {
            const st = classify(j && j.msg, "已打卡");
            addResult(st.e === "✅" ? "success" : "warn", tag, st.t);
            if (st.e !== "✅") debug(`${tag} 响应: ${(r.body || "").slice(0, 300)}`);
        }

        step(tag, "检查昨日打卡奖励");
        await claimClockInRewards(tag, infBody, sid, s_key, ss);
    } catch (e) {
        addResult("error", tag, "异常", { error: String(e) });
        console.log(`[ERROR] ${tag}: ${e}`);
    }
}

async function claimClockInRewards(tag, infBody, sid, s_key, ss) {
    try {
        const list = (((safeJson(infBody) || {}).data || {}).reward_list || {}).list || [];
        const pend = list.filter((rw) => rw && rw.reward_status === 1);
        debug(`奖励表(${list.length}): ${list.map((rw) => `${rw.reward_id}=${rw.reward_status}`).join(" ") || "空"}`);
        if (!pend.length) {
            step(tag, list.length ? "昨日奖励暂无可领(未到开放时间)" : "未取到奖励列表");
            addResult(list.length ? "info" : "warn", list.length ? "昨日奖励" : "领奖", list.length ? "暂无可领(未到开放时间)" : "未取到奖励列表");
            return;
        }

        step(tag, `${pend.length}个奖励待领,逐个领取`);
        const got = [], fail = [];
        for (const rw of pend) {
            const body = canonicalJSON({ client_type: 1, reward_id: rw.reward_id, clock_in_time: rw.clock_in_time });
            const date = new Date().toUTCString();
            const signature = hmacSha256Hex(s_key + md5Hex(body) + date, ss);
            const name = rw.sku_name || rw.mb_name || "奖励";
            step(tag, `领取奖励 ${name}`);
            const r = await rawReq("POST", CLOCK_REWARD, { sid, body, date, signature });
            const j = safeJson(r.body);
            if (j && j.result === "ok" && (j.data || {}).reward_status === true) got.push(name);
            else { fail.push(name); debug(`领奖 ${name}(${rw.reward_id}) 失败: ${(r.body || "").slice(0, 200)}`); }
            await sleep(jitter(ACTION_GAP)); 
        }
        if (got.length) addResult("success", "领昨日奖励", got.join("、"));
        if (fail.length) addResult("warn", "待领奖励未领成功(可去小程序手动领)", fail.join("、"));
    } catch (e) {
        console.log(`[ERROR] 领昨日奖励: ${e}`);
    }
}

function rawReq(method, url, { sid, body, date, signature } = {}) {
    const headers = { "User-Agent": MINI_UA, "Accept": "*/*", "X-CSRFToken": "1234567890" };
    if (sid) headers["Cookie"] = `wps_sid=${sid};csrf=1234567890`;
    if (body) headers["Content-Type"] = "application/json";
    if (signature) headers["Signature"] = signature;
    if (date) headers["Date"] = date;
    return new Promise((resolve, reject) => {
        const cb = (err, resp, data) =>
            err ? reject(err) : resolve({ status: (resp && (resp.status || resp.statusCode)) || 0, body: data || "" });
        const req = { url, headers, timeout: HTTP_TIMEOUT_MS };
        if (body) req.body = body;
        method === "POST" ? $httpClient.post(req, cb) : $httpClient.get(req, cb);
    });
}

function canonicalJSON(obj) {
    const sorted = Object.keys(obj).sort().reduce((a, k) => ((a[k] = obj[k]), a), {});
    return JSON.stringify(sorted);
}

// ============ HTTP(携带 wps_sid;签到带 token 头)============
function httpReq(method, url, { body, token } = {}) {
    const sid = $persistentStore.read(CK_KEY);
    const headers = {
        "User-Agent": UA,
        "Cookie": `wps_sid=${sid}; wps_sids=${sid}`, // 保留 wps_sids 以防 WPS 老旧网关校验
        "Origin": "https://personal-act.wps.cn",
        "Referer": "https://personal-act.wps.cn/",
    };
    if (body) headers["Content-Type"] = "application/json";
    if (token) headers["token"] = token;
    return new Promise((resolve, reject) => {
        const req = { url, headers, timeout: HTTP_TIMEOUT_MS };
        if (body) req.body = body;
        const cb = (err, resp, data) => {
            if (err) return reject(err);
            resolve({ status: (resp && (resp.status || resp.statusCode)) || 0, body: data || "" });
        };
        method === "POST" ? $httpClient.post(req, cb) : $httpClient.get(req, cb);
    });
}

// 增强型 safeJson：防止 undefined/null 导致 JSON.parse 崩溃
function safeJson(s) {
    if (typeof s !== "string") return null;
    try { return JSON.parse(s); } catch (e) { return null; }
}

function classify(msg, doneLabel) {
    const m = String(msg || "");
    if (!m) return { e: "⚠️", t: "未成功" };
    if (/已签|has sign/i.test(m)) return { e: "✅", t: "已签到" };
    if (/Duplicate entry|已领取|已申领|已参与|已参加|已报名|已完成|重复|repeat|already/i.test(m)) return { e: "✅", t: doneLabel || "已完成" };
    if (/无.*次数|没有.*次数|次数.*(用完|不足|为0)|达到?.*上限|已达.*上限|超(出|过).*次数|reach limit|out of limit|上限/i.test(m)) return { e: "✅", t: "已达上限" };
    if (/售罄|领完|抢完|发完|抢光|领光|out of stock|库存(不足)?|no stock|sold out|stock/i.test(m)) return { e: "⚠️", t: "已领完" };
    if (/资格|不满足|未满足|不符合|无权限|没有权限|没有资格|not (match|qualified)|不在.*(范围|名单)|未达条件/i.test(m)) return { e: "⚠️", t: "没资格" };
    return { e: "⚠️", t: m.length > 30 ? m.slice(0, 30) + "…" : m };
}

function beijingDate() {
    const d = new Date(Date.now() + 8 * 3600 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function jitter([min, max]) {
    return Math.floor((min + Math.random() * (max - min)) * 1000);
}

function genAesKey() {
    const cs = "0123456789abcdefghijklmnopqrstuvwxyz";
    let s = "";
    for (let i = 0; i < 22; i++) s += cs[Math.floor(Math.random() * 36)];
    return s + Math.floor(Date.now() / 1000);
}

// ============ 纯 JS 加密工具(AES-CBC-Pkcs7 + RSA PKCS#1 v1.5,BigInt 实现)============
function modpow(base, exp, mod) {
    let result = 1n;
    base %= mod;
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}

function rsaEncryptB64(msg, pemB64) {
    const pem = bytesUtf8(b64dec(pemB64));
    const der = b64dec(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, ""));
    let p = 0;
    p++; 
    let sl = der[p++];
    if (sl & 0x80) p += sl & 0x7f; 
    const readInt = () => {
        p++; 
        let l = der[p++];
        if (l & 0x80) {
            let nb = l & 0x7f;
            l = 0;
            for (let i = 0; i < nb; i++) l = (l << 8) | der[p++];
        }
        let v = 0n;
        for (let i = 0; i < l; i++) v = (v << 8n) | BigInt(der[p++]);
        return v;
    };
    const n = readInt(), e = readInt();
    let k = 0, nn = n;
    while (nn > 0n) { k++; nn >>= 8n; } 

    const m = utf8Bytes(msg);
    const psLen = k - 3 - m.length;
    if (psLen < 8) throw new Error("RSA 明文过长");
    const block = [0x00, 0x02];
    for (let i = 0; i < psLen; i++) block.push(1 + Math.floor(Math.random() * 255)); 
    block.push(0x00);
    for (const b of m) block.push(b);

    let mm = 0n;
    for (const b of block) mm = (mm << 8n) | BigInt(b);
    let hex = modpow(mm, e, n).toString(16);
    while (hex.length < k * 2) hex = "0" + hex;
    const cb = [];
    for (let i = 0; i < hex.length; i += 2) cb.push(parseInt(hex.substr(i, 2), 16));
    return b64enc(cb);
}

const _SB = [], _ISB = [];
(function () {
    const p = [], l = [];
    let x = 1;
    for (let i = 0; i < 256; i++) {
        p[i] = x;
        x ^= (x << 1) ^ (x & 0x80 ? 0x11b : 0);
        p[i] &= 0xff;
    }
    for (let i = 0; i < 255; i++) l[p[i]] = i;
    let si = 0;
    for (let i = 0; i < 256; i++) {
        let xx = si ? p[255 - l[si]] : 0;
        let t = xx;
        for (let r = 0; r < 4; r++) {
            t = ((t << 1) | (t >>> 7)) & 0xff;
            xx ^= t;
        }
        xx = (xx ^ 0x63) & 0xff;
        _SB[si] = xx;
        _ISB[xx] = si;
        si = si ? p[(l[si] + 1) % 255] : 1;
    }
})();
const _RCON = [1, 2, 4, 8, 16, 32, 64, 128, 27, 54];
function _xt(a) { return ((a << 1) ^ (a & 0x80 ? 0x11b : 0)) & 0xff; }
function _mul(a, b) {
    let r = 0;
    for (; b; b >>= 1) {
        if (b & 1) r ^= a;
        a = _xt(a);
    }
    return r;
}
function _keyExp(key) {
    const Nk = key.length / 4, Nr = Nk + 6, w = [];
    for (let i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
    for (let i = Nk; i < 4 * (Nr + 1); i++) {
        let t = w[i - 1].slice();
        if (i % Nk === 0) {
            t.push(t.shift());
            t = t.map((b) => _SB[b]);
            t[0] ^= _RCON[i / Nk - 1];
        } else if (Nk > 6 && i % Nk === 4) {
            t = t.map((b) => _SB[b]);
        }
        w[i] = w[i - Nk].map((b, j) => b ^ t[j]);
    }
    return { w, Nr };
}
function _enc(inp, ks) {
    let s = [[], [], [], []];
    for (let i = 0; i < 16; i++) s[i % 4][i >> 2] = inp[i];
    const ar = (k) => {
        for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[r][c] ^= k[c][r];
    };
    ar(ks.w.slice(0, 4));
    for (let rd = 1; rd < ks.Nr; rd++) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r][c] = _SB[s[r][c]];
        for (let r = 1; r < 4; r++) {
            const row = s[r].slice();
            for (let c = 0; c < 4; c++) s[r][c] = row[(c + r) % 4];
        }
        for (let c = 0; c < 4; c++) {
            const a = [s[0][c], s[1][c], s[2][c], s[3][c]];
            s[0][c] = _mul(a[0], 2) ^ _mul(a[1], 3) ^ a[2] ^ a[3];
            s[1][c] = a[0] ^ _mul(a[1], 2) ^ _mul(a[2], 3) ^ a[3];
            s[2][c] = a[0] ^ a[1] ^ _mul(a[2], 2) ^ _mul(a[3], 3);
            s[3][c] = _mul(a[0], 3) ^ a[1] ^ a[2] ^ _mul(a[3], 2);
        }
        ar(ks.w.slice(4 * rd, 4 * rd + 4));
    }
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) s[r][c] = _SB[s[r][c]];
    for (let r = 1; r < 4; r++) {
        const row = s[r].slice();
        for (let c = 0; c < 4; c++) s[r][c] = row[(c + r) % 4];
    }
    ar(ks.w.slice(4 * ks.Nr, 4 * ks.Nr + 4));
    const out = [];
    for (let i = 0; i < 16; i++) out[i] = s[i % 4][i >> 2];
    return out;
}
function utf8Bytes(str) {
    const out = [];
    for (const ch of unescape(encodeURIComponent(str))) out.push(ch.charCodeAt(0));
    return out;
}
function bytesUtf8(b) {
    let s = "";
    for (const x of b) s += String.fromCharCode(x);
    return decodeURIComponent(escape(s));
}
const _B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function b64enc(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
        s += _B64[b0 >> 2] + _B64[((b0 & 3) << 4) | (b1 >> 4)];
        s += i + 1 < bytes.length ? _B64[((b1 & 15) << 2) | (b2 >> 6)] : "=";
        s += i + 2 < bytes.length ? _B64[b2 & 63] : "=";
    }
    return s;
}
function b64dec(str) {
    const out = [];
    let buf = 0, bits = 0;
    for (const c of str) {
        if (c === "=") break;
        const v = _B64.indexOf(c);
        if (v < 0) continue;
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push((buf >> bits) & 0xff);
        }
    }
    return out;
}
function aesEncrypt(plain, keyStr, ivStr) {
    const ks = _keyExp(utf8Bytes(keyStr));
    const data = utf8Bytes(plain);
    const pad = 16 - (data.length % 16);
    for (let i = 0; i < pad; i++) data.push(pad);
    let prev = utf8Bytes(ivStr);
    const out = [];
    for (let i = 0; i < data.length; i += 16) {
        const blk = data.slice(i, i + 16).map((b, j) => b ^ prev[j]);
        prev = _enc(blk, ks);
        out.push(...prev);
    }
    return b64enc(out);
}

// ============ 哈希工具 (优先使用原生 $crypto，失败自动回退纯 JS) ============
function md5Hex(str) {
    if (typeof $crypto !== "undefined" && $crypto.md5) {
        try { return $crypto.md5(str, "string", "hex"); } catch (e) {}
    }
    // Fallback: 纯 JS MD5
    const rol = (n, c) => (n << c) | (n >>> (32 - c));
    const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
        5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
        4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
        6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
    const K = [0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
        0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
        0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
        0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
        0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
        0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
        0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
        0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391];
    let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
    const m = utf8Bytes(str);
    const origLen = m.length;
    m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    const bitLen = origLen * 8;
    for (let i = 0; i < 8; i++) m.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);
    for (let off = 0; off < m.length; off += 64) {
        const M = [];
        for (let i = 0; i < 16; i++)
            M[i] = (m[off + i * 4]) | (m[off + i * 4 + 1] << 8) | (m[off + i * 4 + 2] << 16) | (m[off + i * 4 + 3] << 24);
        let A = a0, B = b0, C = c0, D = d0;
        for (let i = 0; i < 64; i++) {
            let F, g;
            if (i < 16) { F = (B & C) | (~B & D); g = i; }
            else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
            else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
            else { F = C ^ (B | ~D); g = (7 * i) % 16; }
            F = (F + A + K[i] + M[g]) >>> 0;
            A = D; D = C; C = B;
            B = (B + rol(F, s[i])) >>> 0;
        }
        a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
    }
    const hexLE = (n) => { let h = ""; for (let i = 0; i < 4; i++) h += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0"); return h; };
    return hexLE(a0) + hexLE(b0) + hexLE(c0) + hexLE(d0);
}

function sha256Bytes(bytes) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    let h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const m = bytes.slice();
    const origLen = m.length;
    m.push(0x80);
    while (m.length % 64 !== 56) m.push(0);
    const bitLen = origLen * 8;
    for (let i = 7; i >= 0; i--) m.push(Math.floor(bitLen / Math.pow(2, 8 * i)) & 0xff);
    const rotr = (n, c) => (n >>> c) | (n << (32 - c));
    for (let off = 0; off < m.length; off += 64) {
        const w = [];
        for (let i = 0; i < 16; i++)
            w[i] = ((m[off + i * 4] << 24) | (m[off + i * 4 + 1] << 16) | (m[off + i * 4 + 2] << 8) | (m[off + i * 4 + 3])) >>> 0;
        for (let i = 16; i < 64; i++) {
            const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
            const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
        for (let i = 0; i < 64; i++) {
            const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const t2 = (S0 + maj) >>> 0;
            hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
        h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    const out = [];
    for (const x of h) out.push((x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff);
    return out;
}

const bytesToHex = (b) => b.map((x) => x.toString(16).padStart(2, "0")).join("");

function hmacSha256Hex(msgStr, keyStr) {
    if (typeof $crypto !== "undefined" && $crypto.hmac) {
        try { return $crypto.hmac(msgStr, keyStr, "sha256", "string", "hex"); } catch (e) {}
    }
    // Fallback: 纯 JS HMAC
    let key = utf8Bytes(keyStr);
    if (key.length > 64) key = sha256Bytes(key);
    while (key.length < 64) key.push(0);
    const o = [], i = [];
    for (let j = 0; j < 64; j++) { o.push(key[j] ^ 0x5c); i.push(key[j] ^ 0x36); }
    const inner = sha256Bytes(i.concat(utf8Bytes(msgStr)));
    return bytesToHex(sha256Bytes(o.concat(inner)));
}
