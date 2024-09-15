const url = $request.url;
let obj;

try {
    obj = JSON.parse($response.body);
} catch (e) {
    console.error("Failed to parse JSON:", e);
    $done({ body: $response.body });
    return;
}

// 判断 URL 中是否包含广告请求相关的标志符
if (url.includes("adposcount") && url.includes("posid=2064444443783014")) {
    
    // 过滤广告逻辑，例如清空广告列表或去除广告内容
    if (obj.data && obj.data["2064444443783014"] && obj.data["2064444443783014"].list) {
        obj.data["2064444443783014"].list = []; // 移除广告列表内容
    }
}

// 返回修改后的响应数据
$done({ body: JSON.stringify(obj) });
