/*************************************

  赵云与阿斗 · Loon 专用版
  作者：@ddm1023
  Loon 规范适配版

  功能：
  - 金币 / 等级 / 注册时间
  - 武器 / 技能 / 头像 / 分享次数

  Loon 配置示例（[Script] 段）：

  http-request ^https?:\/\/.*\/user\/(save|data) script-path=zhaoyun.js,requires-body=true,tag=赵云与阿斗-请求,argument="ddm_zyyad_gold=9999999&ddm_zyyad_level=999"

  http-response ^https?:\/\/.*\/(user\/login|user\/data|toutiaoGame\/ZhaoYunAndADou) script-path=zhaoyun.js,requires-body=true,tag=赵云与阿斗-响应,argument="ddm_zyyad_gold=9999999&ddm_zyyad_level=999"

  argument 支持两种格式：
  1. 查询字符串："ddm_zyyad_gold=9999999&ddm_zyyad_level=999"
  2. JSON 字符串：'{"ddm_zyyad_gold":"9999999"}'

*************************************/

// ============================================================
// 0. Loon 环境守卫
// ============================================================

if (typeof $loon === "undefined") {
    console.log("赵云与阿斗：请在 Loon 环境中运行此脚本");
    $done({});
    return;
}

// ============================================================
// 1. Loon 参数解析（$argument 为 String，需手动解析）
// ============================================================

function parseLoonArgument() {
    if (typeof $argument === "object" && $argument !== null) {
        return $argument;
    }
    if (typeof $argument !== "string" || $argument === "") {
        return {};
    }
    // 尝试 JSON 格式
    try {
        const json = JSON.parse($argument);
        if (typeof json === "object" && json !== null) {
            return json;
        }
    } catch (e) {
        // 尝试查询字符串格式
        const obj = {};
        $argument.split("&").forEach(function (pair) {
            const kv = pair.split("=");
            if (kv.length >= 2) {
                obj[kv[0]] = kv.slice(1).join("=");
            }
        });
        return obj;
    }
    return {};
}

const ARG = parseLoonArgument();

// ============================================================
// 2. 参数读取工具
// ============================================================

function getArg(key, def) {
    const value = ARG[key];
    if (value === undefined || value === null || value === "") {
        return def;
    }
    return value;
}

function getBool(key, def) {
    const value = getArg(key, def);
    return value === true || value === "true" || value === "1";
}

function getNumber(key, def) {
    const value = Number(getArg(key, def));
    return Number.isFinite(value) ? value : def;
}

// ============================================================
// 3. 全局配置（通过 argument 传入）
// ============================================================

const ForceValue     = getBool("ddm_zyyad_forcevalue", false);
const EnableGold     = getBool("ddm_zyyad_enablegold", true);
const EnableLevel    = getBool("ddm_zyyad_enablelevel", true);
const EnableRegister = getBool("ddm_zyyad_enableregister", true);
const EnableWeapon   = getBool("ddm_zyyad_enableweapon", true);
const EnableSkill    = getBool("ddm_zyyad_enableskill", true);
const EnableAvatar   = getBool("ddm_zyyad_enableavatar", true);

// ============================================================
// 4. 数值配置
// ============================================================

const Gold        = getNumber("ddm_zyyad_gold", 9999999);
const Level       = getNumber("ddm_zyyad_level", 999);
const RegisterDay = getNumber("ddm_zyyad_registerday", 7);
const WeaponMode  = parseWeaponMode(getArg("ddm_zyyad_weaponmode", "导入全部武器"));
const WeaponCount = getNumber("ddm_zyyad_weaponcount", 50);

// ============================================================
// 5. 武器模式解析
// ============================================================

function parseWeaponMode(value) {
    if (value === undefined || value === null) return 2;
    const str = String(value).trim();
    if (str === "关闭" || str === "0") return 0;
    if (str === "补充已有武器" || str === "1") return 1;
    if (str === "导入全部武器" || str === "2") return 2;
    return 2;
}

// ============================================================
// 6. 技能 ID 映射表
// ============================================================

const SkillID = {
    "毛笔": 2,       "练兵符": 3,     "神兵符": 4,
    "包子": 5,       "御敌千里": 6,   "砚台": 7,
    "陷阱": 8,       "地雷": 9,       "速攻符": 10,
    "降妖符": 11,    "农民": 12,      "招贤榜": 13,
    "攻速符（全体）": 14, "攻速符(全体)": 14,
    "齐头并进": 15,  "续命丹": 16,    "大补丸": 17,
    "泥潭": 18,      "洛阳铲": 19,    "召唤陨石": 20,
    "垃圾桶": 21,    "升职令": 22,    "摸金校尉": 24
};

// ============================================================
// 7. 技能参数转换
// ============================================================

function parseSkill(value) {
    if (value === undefined || value === null || value === "") return 0;

    if (typeof value === "number") return Number(value) || 0;

    let name = String(value).trim();
    name = name.replace(/^["']|["']$/g, "");

    if (/^\d+$/.test(name)) return Number(name);

    name = name.replace(/（/g, "(").replace(/）/g, ")");

    if (name === "攻速符(全体)") return 14;

    return SkillID[name] || 0;
}

// ============================================================
// 8. 主动 / 被动技能
// ============================================================

const ActiveSkill = [
    parseSkill(getArg("ddm_zyyad_active1", "神兵符")),
    parseSkill(getArg("ddm_zyyad_active2", "速攻符"))
].filter(function (id) { return id > 0; });

const PassiveSkill = [
    parseSkill(getArg("ddm_zyyad_passive1", "降妖符")),
    parseSkill(getArg("ddm_zyyad_passive2", "农民")),
    parseSkill(getArg("ddm_zyyad_passive3", "招贤榜")),
    parseSkill(getArg("ddm_zyyad_passive4", "齐头并进")),
    parseSkill(getArg("ddm_zyyad_passive5", "洛阳铲")),
    parseSkill(getArg("ddm_zyyad_passive6", "摸金校尉"))
].filter(function (id) { return id > 0; });

// ============================================================
// 9. 构造技能列表
// ============================================================

const SkillList = [];
const SkillUsed = Object.create(null);

function AddSkill(id) {
    id = Number(id);
    if (!id) return;
    if (SkillList.length >= 8) return;
    if (BanSkill.includes(id)) return;
    if (SkillUsed[id]) return;
    SkillUsed[id] = true;
    SkillList.push([id]);
}

const BanSkill = [1, 23];

ActiveSkill.slice(0, 2).forEach(AddSkill);
PassiveSkill.slice(0, 6).forEach(AddSkill);

// ============================================================
// 10. 默认用户数据模板
// ============================================================

const current = Date.now();

const UserTemplate = {
    pv: "", nk: "",
    lld: 0, rt: current,
    ss: 0, lst: 0, wn: 0,
    st: current, lp: [],
    sg: {
        iosBetterMode: true,
        soundVolume: 0,
        showDamageNum: false,
        musicVolume: 0
    },
    afu: false, apsc: 0,
    wdg: true,
    ld: 0, cld: 1, ls: 0, wd: 0,
    sac: 0,
    au: "resources/img/mainUI/avatar/avatar15.png",
    op: true,
    ws: 0, cs: 1,
    lrt: 0,
    wf: [],
    eq: [19, 13, 18, 29, 6, 26, 29, 18, 43, 43, 43, 8],
    lts: 0, ga: 0,
    mg: [],
    sm: 30,
    hfb: true,
    ot: current,
    aul: Array(16).fill(1),
    ps: [],
    ssc: 0, gd: 0,
    wfr: true, hfs: true,
    nwi: [],
    fds: 0,
    rr: 1,
    pap: true,
    rc: 1
};

// ============================================================
// 11. 初始化用户数据
// ============================================================

function InitUserData(data) {
    if (!data || typeof data !== "object") {
        data = {};
    }

    Object.keys(UserTemplate).forEach(function (key) {
        if (data[key] === undefined || data[key] === null) {
            const value = UserTemplate[key];
            if (Array.isArray(value)) {
                data[key] = JSON.parse(JSON.stringify(value));
            } else if (value && typeof value === "object") {
                data[key] = JSON.parse(JSON.stringify(value));
            } else {
                data[key] = value;
            }
        }
    });

    return data;
}

// ============================================================
// 12. 安全修改数值
// ============================================================

function setValue(data, key, value) {
    if (ForceValue) {
        data[key] = value;
        return;
    }
    const old = Number(data[key]) || 0;
    if (old < value) {
        data[key] = value;
    }
}

// ============================================================
// 13. 注册时间模块
// ============================================================

function ModuleRegister(data, attach) {
    const target = current - RegisterDay * 86400000 - 300000;

    if (ForceValue || !data.rt || data.rt > target) {
        data.rt = target;
    }

    if (attach && typeof attach === "object") {
        if (ForceValue || !attach.ct || attach.ct > target) {
            attach.ct = target;
        }
    }
}

// ============================================================
// 14. 等级模块
// ============================================================

function ModuleLevel(data) {
    setValue(data, "cs", Level);
    setValue(data, "ga", Level);
    setValue(data, "wn", Level);
    setValue(data, "ws", Level);
    setValue(data, "ls", Level);
    setValue(data, "cld", Math.max(99, Math.ceil(Level / 10)));
}

// ============================================================
// 15. 武器列表
// ============================================================

const WeaponList = [
    [1, 50], [2, 50], [3, 50], [4, 50], [5, 50],
    [6, 50], [7, 50], [8, 50], [9, 50], [11, 50],
    [12, 50], [13, 50], [14, 50], [15, 50], [16, 50],
    [17, 50], [18, 50], [19, 50], [20, 50], [22, 50],
    [23, 50], [24, 50], [25, 50], [26, 50], [27, 50],
    [28, 50], [29, 50], [30, 50], [32, 50], [33, 50],
    [34, 50], [35, 50], [36, 50], [37, 50], [38, 50],
    [39, 50], [40, 50], [41, 50], [42, 50], [43, 50]
];

// ============================================================
// 16. 武器模块
// ============================================================

function ModuleWeapon(data) {
    if (WeaponMode === 0) return;
    if (!Array.isArray(data.wf)) data.wf = [];

    // 模式 1：仅补充已有武器数量
    if (WeaponMode === 1) {
        data.wf.forEach(function (item) {
            if (Array.isArray(item) && item.length > 1) {
                item[1] = Math.max(Number(item[1]) || 0, WeaponCount);
            }
        });
        return;
    }

    // 模式 2：导入全部武器
    const WeaponMap = {};

    data.wf.forEach(function (item) {
        if (Array.isArray(item) && item.length > 1) {
            WeaponMap[item[0]] = item;
        }
    });

    WeaponList.forEach(function (item) {
        const id = item[0];
        const count = item[1];

        if (WeaponMap[id]) {
            WeaponMap[id][1] = ForceValue
                ? count
                : Math.max(Number(WeaponMap[id][1]) || 0, count);
        } else {
            data.wf.push([id, count]);
        }
    });
}

// ============================================================
// 17. 技能模块
// ============================================================

function ModuleSkill(data) {
    if (!data || typeof data !== "object") return;
    if (SkillList.length === 0) {
        console.log("赵云与阿斗：没有有效技能");
        return;
    }

    const now = Date.now();

    const result = SkillList.map(function (item, index) {
        return [
            Number(item[0]),
            1,
            now - (index + 1) * 300000
        ];
    });

    data.ps = result;

    console.log("赵云与阿斗：技能配置 = " + JSON.stringify(result));
}

// ============================================================
// 18. 头像模块
// ============================================================

function ModuleAvatar(data) {
    if (!Array.isArray(data.aul)) {
        data.aul = Array(16).fill(1);
        return;
    }
    data.aul = data.aul.map(function () { return 1; });
}

// ============================================================
// 19. 核心模块（汇总所有修改）
// ============================================================

function Module(data, attach) {
    if (!data || typeof data !== "object") return;

    // 固定项目
    data.hfb = true;
    data.pap = true;
    data.wfr = true;
    data.sm = 30;

    if (EnableGold) {
        setValue(data, "gd", Gold);
    }

    if (EnableRegister) {
        setValue(data, "lld", RegisterDay);
        ModuleRegister(data, attach);
    }

    if (EnableLevel) {
        ModuleLevel(data);
    }

    if (EnableWeapon) {
        ModuleWeapon(data);
    }

    if (EnableSkill) {
        console.log("赵云与阿斗：技能模块开启");
        console.log("主动技能 ID：" + JSON.stringify(ActiveSkill));
        console.log("被动技能 ID：" + JSON.stringify(PassiveSkill));
        console.log("最终技能：" + JSON.stringify(SkillList));
        ModuleSkill(data);
    }

    if (EnableAvatar) {
        ModuleAvatar(data);
    }
}

// ============================================================
// 20. JSON 安全解析
// ============================================================

function safeJson(body) {
    try {
        return JSON.parse(body || "{}");
    } catch (e) {
        console.log("赵云与阿斗：JSON解析失败");
        return {};
    }
}

// ============================================================
// 21. 当前请求 URL（避免与 JS 内建 URL 类冲突）
// ============================================================

const reqURL = ($request && $request.url) ? $request.url : "";

// ============================================================
// 22. http-request 分支（请求体处理）
// ============================================================

if (typeof $response === "undefined") {
    let requestData = safeJson($request.body);

    console.log("赵云与阿斗：请求体处理：" + reqURL);

    Module(requestData, null);

    // Loon http-request 规范：$done({body: ...}) 修改请求体，
    // 省略 url / headers 时保留原值
    $done({
        body: JSON.stringify(requestData)
    });

    return;
}

// ============================================================
// 23. http-response 分支（响应体处理）
// ============================================================

let responseData = safeJson($response.body);

// 23.1 登录接口
if (/user\/login/.test(reqURL)) {
    responseData.data = responseData.data || {};

    if (!responseData.data.userData || typeof responseData.data.userData !== "object") {
        responseData.data.userData = {};
    }

    responseData.data.userData = InitUserData(responseData.data.userData);

    if (!responseData.data.attach || typeof responseData.data.attach !== "object") {
        responseData.data.attach = {};
    }

    if (!responseData.data.info || typeof responseData.data.info !== "object") {
        responseData.data.info = {};
    }

    Module(
        responseData.data.userData,
        responseData.data.attach
    );

    responseData.data.userType = 1;
    responseData.code = 0;
    responseData.msg = "Success";
}

// 23.2 用户数据接口
if (/user\/data/.test(reqURL)) {
    if (
        responseData.data &&
        responseData.data.userData &&
        typeof responseData.data.userData === "object"
    ) {
        Module(responseData.data.userData, null);
    }
}

// 23.3 分享接口
if (/toutiaoGame\/ZhaoYunAndADou/.test(reqURL)) {
    responseData.shareLimitPerDay = Math.max(
        Number(responseData.shareLimitPerDay) || 0,
        99
    );
}

// ============================================================
// 24. 返回修改后的响应
//     Loon 规范：省略 status / headers 时保留原值
// ============================================================

$done({
    body: JSON.stringify(responseData)
});
