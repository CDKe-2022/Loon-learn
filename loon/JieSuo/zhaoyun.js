/*************************************

赵云与阿斗 · Loon 专用版

功能：
- 金币
- 等级
- 注册时间
- 武器
- 技能
- 头像
- 分享次数

Loon Plugin 参数：
$argument.xxx

*************************************/


// ============================================================
// 1. Loon 参数
// ============================================================

const ARG = $argument || {};


// ============================================================
// 2. 参数工具
// ============================================================

function getArg(key, def) {
    const value = ARG[key];

    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return def;
    }

    return value;
}


function getBool(key, def = false) {

    const value = getArg(key, def);

    return (
        value === true ||
        value === "true" ||
        value === "1"
    );
}


function getNumber(key, def = 0) {

    const value = Number(
        getArg(key, def)
    );

    return Number.isFinite(value)
        ? value
        : def;
}


// ============================================================
// 3. 全局配置
// ============================================================

const ForceValue =
    getBool(
        "ddm_zyyad_forcevalue",
        false
    );


// ============================================================
// 4. 功能开关
// ============================================================

const EnableGold =
    getBool(
        "ddm_zyyad_enablegold",
        true
    );

const EnableLevel =
    getBool(
        "ddm_zyyad_enablelevel",
        true
    );

const EnableRegister =
    getBool(
        "ddm_zyyad_enableregister",
        true
    );

const EnableWeapon =
    getBool(
        "ddm_zyyad_enableweapon",
        true
    );

const EnableSkill =
    getBool(
        "ddm_zyyad_enableskill",
        true
    );

const EnableAvatar =
    getBool(
        "ddm_zyyad_enableavatar",
        true
    );


// ============================================================
// 5. 数值配置
// ============================================================

const Gold =
    getNumber(
        "ddm_zyyad_gold",
        9999999
    );


const Level =
    getNumber(
        "ddm_zyyad_level",
        999
    );


const RegisterDay =
    getNumber(
        "ddm_zyyad_registerday",
        7
    );


const WeaponMode =
    getNumber(
        "ddm_zyyad_weaponmode",
        2
    );


const WeaponCount =
    getNumber(
        "ddm_zyyad_weaponcount",
        50
    );


// ============================================================
// 6. 技能名称 → 游戏 ID
// ============================================================

const SkillID = {

    // 主动 / 通用
    "毛笔": 2,
    "练兵符": 3,
    "神兵符": 4,
    "包子": 5,
    "御敌千里": 6,
    "砚台": 7,
    "陷阱": 8,
    "地雷": 9,
    "速攻符": 10,

    // 被动
    "降妖符": 11,
    "农民": 12,
    "招贤榜": 13,
    "攻速符（全体）": 14,
    "齐头并进": 15,
    "续命丹": 16,
    "大补丸": 17,
    "泥潭": 18,
    "洛阳铲": 19,
    "召唤陨石": 20,

    // 21 = 垃圾桶
    "垃圾桶": 21,

    "升职令": 22,

    // 23 = 行军丹

    "摸金校尉": 24
};


// ============================================================
// 7. 获取主动技能
// ============================================================

const ActiveSkillNames = [
    getArg(
        "ddm_zyyad_active1",
        "神兵符"
    ),

    getArg(
        "ddm_zyyad_active2",
        "速攻符"
    )
];


const ActiveSkill = ActiveSkillNames
    .map(function(name) {
        return SkillID[name] || 0;
    })
    .filter(Boolean);


// ============================================================
// 8. 获取被动技能
// ============================================================

const PassiveSkillNames = [

    getArg(
        "ddm_zyyad_passive1",
        "降妖符"
    ),

    getArg(
        "ddm_zyyad_passive2",
        "农民"
    ),

    getArg(
        "ddm_zyyad_passive3",
        "招贤榜"
    ),

    getArg(
        "ddm_zyyad_passive4",
        "齐头并进"
    ),

    getArg(
        "ddm_zyyad_passive5",
        "洛阳铲"
    ),

    getArg(
        "ddm_zyyad_passive6",
        "摸金校尉"
    )
];


const PassiveSkill = PassiveSkillNames
    .map(function(name) {
        return SkillID[name] || 0;
    })
    .filter(Boolean);


// ============================================================
// 9. 技能黑名单
// ============================================================

const BanSkill = [
    1,  // 推土车
    23  // 行军丹
];


// ============================================================
// 10. 生成技能列表
// ============================================================

const SkillList = [];

const SkillUsed = Object.create(null);


function AddSkill(id) {

    id = Number(id);

    // 无效
    if (!id) {
        return;
    }

    // 最多8个
    if (SkillList.length >= 8) {
        return;
    }

    // 黑名单
    if (BanSkill.includes(id)) {
        return;
    }

    // 去重
    if (SkillUsed[id]) {
        return;
    }

    SkillUsed[id] = true;

    SkillList.push([
        id
    ]);
}


// 主动技能最多2个
ActiveSkill
    .slice(0, 2)
    .forEach(AddSkill);


// 被动技能最多6个
PassiveSkill
    .slice(0, 6)
    .forEach(AddSkill);


// ============================================================
// 11. 默认用户数据
// ============================================================

const current = Date.now();


const UserTemplate = {

    pv: "",
    nk: "",

    lld: 0,

    rt: current,

    ss: 0,
    lst: 0,
    wn: 0,

    st: current,

    lp: [],

    sg: {
        iosBetterMode: true,
        soundVolume: 0,
        showDamageNum: false,
        musicVolume: 0
    },

    afu: false,
    apsc: 0,

    wdg: true,

    ld: 0,
    cld: 1,
    ls: 0,
    wd: 0,

    sac: 0,

    au: "resources/img/mainUI/avatar/avatar15.png",

    op: true,

    ws: 0,
    cs: 1,

    lrt: 0,

    wf: [],

    eq: [
        19,
        13,
        18,
        29,
        6,
        26,
        29,
        18,
        43,
        43,
        43,
        8
    ],

    lts: 0,
    ga: 0,

    mg: [],

    sm: 30,

    hfb: true,

    ot: current,

    aul: Array(16).fill(1),

    ps: [],

    ssc: 0,
    gd: 0,

    wfr: true,

    hfs: true,

    nwi: [],

    fds: 0,

    rr: 1,

    pap: true,

    rc: 1
};


// ============================================================
// 12. 初始化用户数据
// ============================================================

function InitUserData(data) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        data = {};
    }


    Object.keys(UserTemplate)
        .forEach(function(key) {

            if (
                data[key] === undefined ||
                data[key] === null
            ) {

                const value =
                    UserTemplate[key];


                if (Array.isArray(value)) {

                    data[key] =
                        JSON.parse(
                            JSON.stringify(value)
                        );

                } else if (
                    value &&
                    typeof value === "object"
                ) {

                    data[key] =
                        JSON.parse(
                            JSON.stringify(value)
                        );

                } else {

                    data[key] = value;
                }
            }
        });


    return data;
}


// ============================================================
// 13. 安全设置数值
// ============================================================

function setValue(
    data,
    key,
    value
) {

    if (ForceValue) {

        data[key] = value;

        return;
    }


    const old =
        Number(data[key]) || 0;


    // 安全模式：只增加
    if (old < value) {

        data[key] = value;
    }
}


// ============================================================
// 14. 注册时间
// ============================================================

function ModuleRegister(
    data,
    attach
) {

    const target =
        current -
        RegisterDay * 86400000 -
        300000;


    if (
        ForceValue ||
        !data.rt ||
        data.rt > target
    ) {

        data.rt = target;
    }


    if (
        attach &&
        typeof attach === "object"
    ) {

        if (
            ForceValue ||
            !attach.ct ||
            attach.ct > target
        ) {

            attach.ct = target;
        }
    }
}


// ============================================================
// 15. 等级
// ============================================================

function ModuleLevel(data) {

    // 等级
    setValue(
        data,
        "cs",
        Level
    );


    // 昨日等级
    setValue(
        data,
        "ga",
        Level
    );


    // 胜利次数
    setValue(
        data,
        "wn",
        Level
    );


    // 连胜
    setValue(
        data,
        "ws",
        Level
    );


    // 历史最高
    setValue(
        data,
        "ls",
        Level
    );


    // 章节
    setValue(
        data,
        "cld",
        Math.max(
            99,
            Math.ceil(Level / 10)
        )
    );
}


// ============================================================
// 16. 武器列表
// ============================================================

const WeaponList = [

    [1, 50],
    [2, 50],
    [3, 50],
    [4, 50],
    [5, 50],
    [6, 50],
    [7, 50],
    [8, 50],
    [9, 50],
    [11, 50],
    [12, 50],
    [13, 50],
    [14, 50],
    [15, 50],
    [16, 50],
    [17, 50],
    [18, 50],
    [19, 50],
    [20, 50],
    [22, 50],
    [23, 50],
    [24, 50],
    [25, 50],
    [26, 50],
    [27, 50],
    [28, 50],
    [29, 50],
    [30, 50],
    [32, 50],
    [33, 50],
    [34, 50],
    [35, 50],
    [36, 50],
    [37, 50],
    [38, 50],
    [39, 50],
    [40, 50],
    [41, 50],
    [42, 50],
    [43, 50]
];


// ============================================================
// 17. 武器模块
// ============================================================

function ModuleWeapon(data) {

    // 0 = 关闭
    if (WeaponMode === 0) {
        return;
    }


    if (!Array.isArray(data.wf)) {

        data.wf = [];
    }


    // --------------------------------
    // 模式1：补充已有武器
    // --------------------------------

    if (WeaponMode === 1) {

        data.wf.forEach(
            function(item) {

                if (
                    Array.isArray(item) &&
                    item.length > 1
                ) {

                    const old =
                        Number(item[1]) || 0;


                    item[1] =
                        Math.max(
                            old,
                            WeaponCount
                        );
                }
            }
        );

        return;
    }


    // --------------------------------
    // 模式2：导入全部武器
    // --------------------------------

    const WeaponMap = {};


    data.wf.forEach(
        function(item) {

            if (
                Array.isArray(item) &&
                item.length > 1
            ) {

                WeaponMap[item[0]] =
                    item;
            }
        }
    );


    WeaponList.forEach(
        function(item) {

            const id = item[0];
            const count = item[1];


            // 已存在
            if (WeaponMap[id]) {

                WeaponMap[id][1] =
                    ForceValue
                        ? count
                        : Math.max(
                            Number(
                                WeaponMap[id][1]
                            ) || 0,
                            count
                        );

            }

            // 不存在
            else {

                data.wf.push([
                    id,
                    count
                ]);
            }
        }
    );
}


// ============================================================
// 18. 技能模块
// ============================================================

function ModuleSkill(data) {

    if (!Array.isArray(data.ps)) {

        data.ps = [];
    }


    data.ps =
        SkillList.map(
            function(item, index) {

                return [
                    item[0],
                    1,
                    current -
                    (index + 1) *
                    300000
                ];
            }
        );
}


// ============================================================
// 19. 头像模块
// ============================================================

function ModuleAvatar(data) {

    if (
        !Array.isArray(data.aul)
    ) {

        data.aul =
            Array(16).fill(1);

        return;
    }


    data.aul =
        data.aul.map(
            function() {
                return 1;
            }
        );
}


// ============================================================
// 20. 核心模块
// ============================================================

function Module(
    data,
    attach
) {

    if (
        !data ||
        typeof data !== "object"
    ) {
        return;
    }


    // 基础功能
    data.hfb = true;
    data.pap = true;
    data.wfr = true;
    data.sm = 30;


    // ----------------------------
    // 金币
    // ----------------------------

    if (EnableGold) {

        setValue(
            data,
            "gd",
            Gold
        );
    }


    // ----------------------------
    // 注册
    // ----------------------------

    if (EnableRegister) {

        setValue(
            data,
            "lld",
            RegisterDay
        );

        ModuleRegister(
            data,
            attach
        );
    }


    // ----------------------------
    // 等级
    // ----------------------------

    if (EnableLevel) {

        ModuleLevel(data);
    }


    // ----------------------------
    // 武器
    // ----------------------------

    if (EnableWeapon) {

        ModuleWeapon(data);
    }


    // ----------------------------
    // 技能
    // ----------------------------

    if (EnableSkill) {

        ModuleSkill(data);
    }


    // ----------------------------
    // 头像
    // ----------------------------

    if (EnableAvatar) {

        ModuleAvatar(data);
    }
}


// ============================================================
// 21. JSON 工具
// ============================================================

function safeJson(body) {

    try {

        return JSON.parse(
            body || "{}"
        );

    } catch (e) {

        return {};
    }
}


// ============================================================
// 22. 判断请求地址
// ============================================================

const URL =
    $request &&
    $request.url
        ? $request.url
        : "";


// ============================================================
// 23. 请求体处理
// ============================================================
//
// 对应：
// /api/v*/sys/user/data
//
// 原脚本在请求阶段直接修改 body
// ============================================================

if (
    typeof $response === "undefined"
) {

    let requestData =
        safeJson(
            $request.body
        );


    Module(
        requestData,
        null
    );


    $done({
        body: JSON.stringify(
            requestData
        )
    });


    return;
}


// ============================================================
// 24. 响应体处理
// ============================================================

let responseData =
    safeJson(
        $response.body
    );


// ============================================================
// 25. 登录接口
// ============================================================

if (
    /user\/login/.test(URL)
) {

    responseData.data =
        responseData.data || {};


    // ----------------------------
    // userData
    // ----------------------------

    if (
        !responseData.data.userData ||
        typeof responseData.data.userData !== "object"
    ) {

        responseData.data.userData = {};
    }


    responseData.data.userData =
        InitUserData(
            responseData.data.userData
        );


    // ----------------------------
    // attach
    // ----------------------------

    if (
        !responseData.data.attach ||
        typeof responseData.data.attach !== "object"
    ) {

        responseData.data.attach = {};
    }


    // ----------------------------
    // info
    // ----------------------------

    if (
        !responseData.data.info ||
        typeof responseData.data.info !== "object"
    ) {

        responseData.data.info = {};
    }


    Module(
        responseData.data.userData,
        responseData.data.attach
    );


    // 用户类型
    responseData.data.userType = 1;


    // 返回成功
    responseData.code = 0;

    responseData.msg = "Success";
}


// ============================================================
// 26. 用户数据接口
// ============================================================

if (
    /user\/data/.test(URL)
) {

    if (
        responseData.data &&
        responseData.data.userData &&
        typeof responseData.data.userData === "object"
    ) {

        Module(
            responseData.data.userData,
            null
        );
    }
}


// ============================================================
// 27. 分享接口
// ============================================================

if (
    /toutiaoGame\/ZhaoYunAndADou/.test(URL)
) {

    responseData.shareLimitPerDay =
        Math.max(
            Number(
                responseData.shareLimitPerDay
            ) || 0,
            99
        );
}


// ============================================================
// 28. 返回
// ============================================================

$done({
    status: 200,
    body: JSON.stringify(
        responseData
    )
});