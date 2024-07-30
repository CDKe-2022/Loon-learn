const url = $request.url;
let obj = JSON.parse($response.body);

// 常量定义
const REMOVABLE_KEYS = ["pendant_a", "entrance_d"];
const URL_PATTERNS = {
    GET_REC_V3: "/mgapi/livenc/home/getRecV3",
    ROOM_RES_LIST: "/japi/entrance/roomRes/nc/m/list",
    FLOW_CONFIG_UPDATE: /^\/venus\/config\/static\/update\?aid=ios&client_sys=ios&keyCodeSet=flow_config$/
};
const FLOW_CONFIG_KEYS = {
    "greatGodGameSitterSwitch": 0,
    "followMoreAnchorEntrance": 0,
    "sdklivebanner": 0,
    "homeActFloatSwitch": 0,
    "bringGoodsSwitch": 0,
    "qqGameSwitch": 0
};

// 工具函数：移除广告
function removeAds(data) {
    return data.filter(item => !item.ad);
}

// 工具函数：删除指定的键
function deleteKeys(data, keys) {
    keys.forEach(key => delete data[key]);
}

// 处理推荐内容和推荐卡片
if (url.includes(URL_PATTERNS.GET_REC_V3)) {
    if (obj.data) {
        if (obj.data.rec_cont) {
            obj.data.rec_cont = removeAds(obj.data.rec_cont);
        }
        if (obj.data.rec_card) {
            Object.keys(obj.data.rec_card).forEach(key => {
                if (obj.data.rec_card[key].card_banner) {
                    obj.data.rec_card[key].card_banner = removeAds(obj.data.rec_card[key].card_banner);
                }
            });
        }
    }
}

// 处理直播间资源列表
if (url.includes(URL_PATTERNS.ROOM_RES_LIST)) {
    if (obj.data) {
        deleteKeys(obj.data, REMOVABLE_KEYS);
    }
}

// 处理配置更新
if (URL_PATTERNS.FLOW_CONFIG_UPDATE.test(url)) {
    if (obj.data) {
        Object.keys(FLOW_CONFIG_KEYS).forEach(key => {
            if (obj.data.hasOwnProperty(key)) {
                obj.data[key] = FLOW_CONFIG_KEYS[key];
            }
        });
    }
}

// 返回处理后的响应体
$done({ body: JSON.stringify(obj) });