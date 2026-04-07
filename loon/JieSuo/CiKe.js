// 刺客信条燎原 - 刷资源脚本
// 通过插件参数控制刷资源模式

function modifyResponse() {
    try {
        // 检查URL是否匹配
        var url = $request.url;
        var pattern = /^https:\/\/latest\.live\.acr\.ubisoft\.com\/api\/v1\/extensions\/mission\/rushMapMission(\?.*)?$/;
        
        if (!pattern.test(url)) {
            $done({});
            return;
        }
        
        // 获取传入的参数
        var mode = $argument.mode;
        console.log("当前模式: " + mode);
        
        // 获取响应体
        var body = $response.body;
        var data = JSON.parse(body);
        
        // 根据模式进行不同的修改
        if (mode === "刷钱") {
            // 刷钱模式 - RegionA_Bronze_01 + SC货币10亿
            data.mapMissionId = "RegionA_Bronze_01";
            data.loot = [{"_id":"SC","_amount":1000000000}];
            console.log("刺客信条燎原: 刷钱模式 (SC 10亿)");
            
        } else if (mode === "刷大经验书") {
            // 刷大经验书模式 - BI5大经验书6000
            if (data.loot && Array.isArray(data.loot)) {
                data.loot = data.loot.map(function(item) {
                    if (item._id === "BI5") {
                        item._amount = 6000;
                    }
                    return item;
                });
            }
            console.log("刺客信条燎原: 刷大经验书模式 (BI5 6000)");
            
        } else if (mode === "刷小经验书") {
            // 刷小经验书模式 - BI4和BI3小经验书各999
            if (data.loot && Array.isArray(data.loot)) {
                data.loot = data.loot.map(function(item) {
                    if (item._id === "BI4" || item._id === "BI3") {
                        item._amount = 999;
                    }
                    return item;
                });
            }
            console.log("刺客信条燎原: 刷小经验书模式 (BI4/BI3 999)");
            
        } else if (mode === "刷铁") {
            // 刷铁模式 - RegionB_Silver_05 + CMI2铁10000
            data.mapMissionId = "RegionB_Silver_05";
            data.loot = [{"_id":"CMI2","_amount":10000}];
            console.log("刺客信条燎原: 刷铁模式 (CMI2 10000)");
        }
        
        // 返回修改后的响应
        $done({body: JSON.stringify(data)});
        
    } catch (e) {
        console.log("刺客信条燎原脚本错误: " + e.message);
        $done({});
    }
}

modifyResponse();
