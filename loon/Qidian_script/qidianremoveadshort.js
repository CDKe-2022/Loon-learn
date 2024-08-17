let url = $request.url;
let method = $request.method;

if (!$response.body) {
    console.log(`$response.body为undefined:${url}`);
    $done({});
}

let body = JSON.parse($response.body);

if (!body.Data) {
    console.log(`body:${$response.body}`);
    $notification.post("起点App脚本错误", "起点", "Data字段为空");
} else {
    if (url.includes("v4/client/getsplashscreen") && method === "GET") {
        console.log('起点-开屏广告处理');
        if (body.Data.List) {
            body.Data.List = [];  // 清空开屏广告
            console.log('开屏广告已移除');
        }
    } else if (url.includes("v1/bookshelf/getHoverAdv") && method === "GET") {
        console.log('起点-书架悬浮广告处理');
        if (body.Data.ItemList?.length) {
            body.Data.ItemList = [];  // 清空书架悬浮广告
            console.log('书架悬浮广告已移除');
        }
    } else {
        console.log('无需处理的请求:', url);
    }
}

body = JSON.stringify(body);
$done({ body });