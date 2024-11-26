/*
脚本引用 https://raw.githubusercontent.com/app2smile/rules/master/js/qidian.js
*/
// 2024-06-12 10:06:16

const noticeTitle = "起点App脚本错误";
const GET = "GET";
const POST = "POST";

function logAndNotify(title, message, data) {
    console.log(message);
    $notification.post(noticeTitle, title, data || "");
}

function handleSplashScreen(body) {
    console.log("起点-开屏页");
    if (!body.Data.List) {
        logAndNotify("起点", "List字段空", $response.body);
    } else {
        body.Data.List = null;
        console.log("List处理成功");
    }
    if (body.Data.EnableGDT === 1) {
        body.Data.EnableGDT = 0;
        console.log("EnableGDT修改成功");
    } else {
        console.log("无需修改EnableGDT");
    }
}

function handleDeepLink(body) {
    console.log(`起点-不跳转精选页: ${body.Data.ActionUrl || "无数据"}`);
    if (body.Data.ActionUrl) {
        body.Data.ActionUrl = "";
        console.log("ActionUrl清理成功");
    } else {
        console.log("无需处理ActionUrl");
    }
}

function handleAdvList(body) {
    console.log("起点-iOS_tab广告");
    if (body.Data.iOS_tab?.length) {
        body.Data.iOS_tab = [];
        console.log("iOS_tab广告清理成功");
    } else {
        console.log("无需处理iOS_tab");
    }
}

function handleDailyRecommend(body) {
    console.log("起点-每日导读");
    if (body.Data.Items?.length) {
        body.Data.Items = [];
        console.log("每日导读清理成功");
    } else {
        console.log("每日导读无数据");
    }
}

function handleBookshelfHoverAdv(body) {
    console.log("起点-书架悬浮广告");
    if (body.Data.ItemList?.length) {
        body.Data.ItemList = [];
        console.log("书架悬浮广告清理成功");
    } else {
        console.log("无需处理悬浮广告");
    }
}

function handleClientConfig(body) {
    console.log("起点-client/getconf");

    if (!body.Data.ActivityPopup?.Data) {
        logAndNotify("起点-getconf", "ActivityPopup/Data字段为空", $response.body);
    } else {
        body.Data.ActivityPopup = null;
        console.log("ActivityPopup(活动弹窗)清理成功");
    }

    if (body.Data.WolfEye === 1) {
        body.Data.WolfEye = 0;
        console.log("WolfEye修改为0");
    } else {
        console.log("无需修改WolfEye");
    }

    if (body.Data.CloudSetting?.TeenShowFreq === "1") {
        body.Data.CloudSetting.TeenShowFreq = "0";
        console.log("青少年模式弹框清理成功");
    }

    if (body.Data.ActivityIcon?.Type !== 0) {
        logAndNotify("起点-getconf", "ActivityIcon/Type字段错误", $response.body);
    } else {
        if (body.Data.ActivityIcon.EndTime !== 0) {
            body.Data.ActivityIcon = { Type: 0, StartTime: 0, EndTime: 0 };
            console.log("ActivityIcon清理成功");
        } else {
            console.log("无ActivityIcon配置");
        }
    }

    if (body.Data.EnableSearchUser !== "1") {
        body.Data.EnableSearchUser = "1";
        console.log("搜索用户功能开启成功");
    } else {
        console.log("无需修改搜索用户配置");
    }
}

// 主逻辑
let { url, method } = $request;
if (!$response.body) {
    console.log(`响应体为空: ${url}`);
    return $done({});
}

let body = JSON.parse($response.body);

if (!body.Data) {
    logAndNotify("起点", "Data字段为空", $response.body);
} else {
    if (url.includes("v4/client/getsplashscreen") && method === GET) {
        handleSplashScreen(body);
    } else if (url.includes("v2/deeplink/geturl") && method === GET) {
        handleDeepLink(body);
    } else if (url.includes("v1/adv/getadvlistbatch?positions=iOS_tab") && method === GET) {
        handleAdvList(body);
    } else if (url.includes("v2/dailyrecommend/getdailyrecommend") && method === GET) {
        handleDailyRecommend(body);
    } else if (url.includes("v1/bookshelf/getHoverAdv") && method === GET) {
        handleBookshelfHoverAdv(body);
    } else if (url.includes("v1/client/getconf") && method === POST) {
        handleClientConfig(body);
    } else {
        logAndNotify("起点App路径/请求方法匹配错误", `${method}, ${url}`);
    }
}

$done({ body: JSON.stringify(body) });