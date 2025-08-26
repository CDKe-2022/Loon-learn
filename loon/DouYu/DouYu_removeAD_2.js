const url = $request.url;

try {
  let obj = JSON.parse($response.body);

  // ===== 常量定义 =====
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

  // ===== 工具函数 =====
  // 过滤掉含有 ad 字段的元素
  const removeAds = arr => Array.isArray(arr) ? arr.filter(item => !item.ad) : arr;

  // 删除指定键
  const deleteKeys = (data, keys) => keys.forEach(key => delete data[key]);

  // ===== 接口处理逻辑 =====

  // 1. 推荐页广告过滤
  if (url.includes(URL_PATTERNS.GET_REC_V3) && obj.data) {
    if (obj.data.rec_cont) {
      obj.data.rec_cont = removeAds(obj.data.rec_cont);
    }

    if (obj.data.rec_card) {
      // 兼容 rec_card 是数组或对象
      if (Array.isArray(obj.data.rec_card)) {
        obj.data.rec_card = obj.data.rec_card.map(card => ({
          ...card,
          card_banner: removeAds(card.card_banner)
        }));
      } else {
        Object.keys(obj.data.rec_card).forEach(key => {
          if (obj.data.rec_card[key].card_banner) {
            obj.data.rec_card[key].card_banner = removeAds(obj.data.rec_card[key].card_banner);
          }
        });
      }
    }
  }

  // 2. 删除直播间资源列表里的无用字段
  if (url.includes(URL_PATTERNS.ROOM_RES_LIST) && obj.data) {
    deleteKeys(obj.data, REMOVABLE_KEYS);
  }

  // 3. 配置更新：关闭开关
  if (URL_PATTERNS.FLOW_CONFIG_UPDATE.test(url) && obj.data) {
    Object.keys(FLOW_CONFIG_KEYS).forEach(key => {
      if (obj.data.hasOwnProperty(key)) {
        obj.data[key] = FLOW_CONFIG_KEYS[key];
      }
    });
  }

  $done({ body: JSON.stringify(obj) });

} catch (e) {
  $done({ body: $response.body });
}