let url = $request.url;
let method = $request.method;

if (!$response.body) {
    console.log(`$response.body为undefined:${url}`);
    $done({});
}

let body = JSON.parse($response.body);

if (url.includes("v4/client/getsplashscreen") && method === "GET") {
    console.log('处理开屏广告');
    if (body.Data && body.Data.List) {
        body.Data.List = [];  // 清空广告列表
        console.log('开屏广告已移除');
    } else {
        console.log(`开屏广告列表为空: ${$response.body}`);
    }
}

body = JSON.stringify(body);
$done({ body });