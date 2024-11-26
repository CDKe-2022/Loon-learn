let url = $request.url;
let method = $request.method;

if (!$response.body) {
    console.log(`$response.body为undefined: ${url}`);
    return $done({});
}

let body = JSON.parse($response.body);

const noticeTitle = "起点App脚本错误";
const methods = { GET: "GET", POST: "POST" };
const handleError = (message) => {
    console.log(`body: ${$response.body}`);
    $notification.post(noticeTitle, "起点", message);
};

const processGetSplashScreen = () => {
    console.log('起点-开屏页');
    if (!body.Data.List) {
        handleError("List字段空");
    } else {
        body.Data.List = null;
        console.log('List成功');
    }

    if ('EnableGDT' in body.Data) {
        body.Data.EnableGDT = body.Data.EnableGDT === 1 ? 0 : body.Data.EnableGDT;
        console.log('EnableGDT成功');
    } else {
        handleError("EnableGDT字段为空");
    }
};

const processDeepLinkGetUrl = () => {
    console.log(`起点-不跳转精选页: ${body.Data.ActionUrl}`);
    if (body.Data.ActionUrl) {
        body.Data.ActionUrl = '';
        console.log('成功');
    } else {
        console.log('无需处理');
    }
};

const processGetAdvListBatch = () => {
    console.log('起点-iOS_tab');
    if (!body.Data.iOS_tab) {
        handleError("iOS_tab字段为空");
    } else {
        body.Data.iOS_tab = [];
        console.log('成功');
    }
};

const processGetDailyRecommend = () => {
    console.log('起点-每日导读');
    body.Data.Items = body.Data.Items?.length ? [] : body.Data.Items;
    console.log(body.Data.Items?.length ? '成功' : '每日导读无数据');
};

const processGetHoverAdv = () => {
    console.log('起点-书架悬浮广告');
    body.Data.ItemList = body.Data.ItemList?.length ? [] : body.Data.ItemList;
    console.log(body.Data.ItemList?.length ? `成功 ${body.Data.ItemList.length}` : '无需处理');
};

const processClientGetConf = () => {
    console.log('起点-client/getconf');
    if (!body.Data.ActivityPopup?.Data) {
        handleError("ActivityPopup/Data字段为空");
    } else {
        body.Data.ActivityPopup = null;
        console.log('ActivityPopup(活动弹窗)成功');
    }

    body.Data.WolfEye = body.Data.WolfEye === 1 ? 0 : body.Data.WolfEye;
    console.log(body.Data.WolfEye === 0 ? 'WolfEye修改为0' : `无需修改WolfEye: ${body.Data.WolfEye}`);

    if (body.Data.CloudSetting?.TeenShowFreq === '1') {
        body.Data.CloudSetting.TeenShowFreq = '0';
        console.log('去除青少年模式弹框');
    }

    if (body.Data.ActivityIcon?.Type !== 0) {
        handleError("ActivityIcon/Type字段错误");
    } else {
        if (body.Data.ActivityIcon.EndTime !== 0) {
            body.Data.ActivityIcon.StartTime = 0;
            body.Data.ActivityIcon.EndTime = 0;
            delete body.Data.ActivityIcon.Actionurl;
            delete body.Data.ActivityIcon.Icon;
            console.log('ActivityIcon成功');
        } else {
            console.log('无ActivityIcon配置');
        }
    }

    body.Data.EnableSearchUser = body.Data.EnableSearchUser === "1" ? "1" : "0";
    console.log(body.Data.EnableSearchUser === "1" ? '无需修改搜索用户配置' : '允许搜索用户成功');
};

if (!body.Data) {
    handleError("Data为空");
} else {
    if (url.includes("v4/client/getsplashscreen") && method === methods.GET) {
        processGetSplashScreen();
    } else if (url.includes("v2/deeplink/geturl") && method === methods.GET) {
        processDeepLinkGetUrl();
    } else if (url.includes("v1/adv/getadvlistbatch?positions=iOS_tab") && method === methods.GET) {
        processGetAdvListBatch();
    } else if (url.includes("v2/dailyrecommend/getdailyrecommend") && method === methods.GET) {
        processGetDailyRecommend();
    } else if (url.includes("v1/bookshelf/getHoverAdv") && method === methods.GET) {
        processGetHoverAdv();
    } else if (url.includes("v1/client/getconf") && method === methods.POST) {
        processClientGetConf();
    } else {
        $notification.post(noticeTitle, "起点App路径/请求方法匹配错误:", `${method}, ${url}`);
    }
}

$done({
    body: JSON.stringify(body)
});