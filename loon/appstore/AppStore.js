const url = "https://gofans.cn/limited/ios";
const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.150 Safari/537.36"
};

// 判断运行环境并执行相应的请求
if (typeof $task !== 'undefined') {
    $task.fetch({ url: url, headers: headers }).then(response => {
        handleResponse(response.body);
    }, reason => {
        console.log('获取应用信息失败:', reason.error);
        $done();
    });
} else if (typeof $httpClient !== 'undefined' && typeof $notification !== 'undefined') {
    $httpClient.get({ url: url, headers: headers }, function (error, response, body) {
        if (error) {
            console.log('获取应用信息失败:', error);
            $done();
            return;
        }
        handleResponse(body);
    });
} else if (typeof $request !== 'undefined' && typeof $notify !== 'undefined') {
    $httpClient.get({ url: url, headers: headers }, function (error, response, body) {
        if (error) {
            console.log('获取应用信息失败:', error);
            $done();
            return;
        }
        handleResponse(body, $request.headers);
    });
} else {
    console.log('未知的脚本运行环境');
    $done();
}

// 处理响应数据并生成通知内容
function handleResponse(body, requestHeaders) {
    const appList = parseAppList(body);
    const freeAppList = appList.filter(app => app.price === "Free");
    const appCount = requestHeaders ? parseInt(requestHeaders['appCount']) || 8 : 8;

    let notificationContent = '';
    for (let i = 0; i < freeAppList.length && i < appCount; i++) {
        const app = freeAppList[i];
        const description = truncateDescription(app.description, 50); // 增加描述长度至50
        notificationContent += `🆓 ${app.name}\n原价：￥${app.originalPrice}\n描述：${description}\n\n`;
    }

    if (typeof $notify !== 'undefined') {
        $notify("AppStore 限免APP", '', notificationContent);
    } else if (typeof $notification !== 'undefined') {
        $notification.post("AppStore 限免APP", '', notificationContent);
    } else {
        console.log('未知的通知函数');
    }
    
    console.log(notificationContent);
    $done();
}

// 解析HTML获取应用列表
function parseAppList(html) {
    const regex = /<div[^>]+class="column[^"]+"[^>]*>[\s\S]*?<strong[^>]+class="title[^"]*"[^>]*>(.*?)<\/strong>[\s\S]*?<b[^>]*>(.*?)<\/b>[\s\S]*?<div[^>]+class="price-original[^"]*"[^>]*>[^<]*<del[^>]*>(.*?)<\/del>[\s\S]*?<p[^>]+class="intro[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
    const appList = [];
    let match;

    while ((match = regex.exec(html)) !== null) {
        const name = match[1].trim();
        const price = match[2].trim();
        const originalPrice = parseFloat(match[3]).toFixed(1);
        const description = match[4].replace(/<.*?>/g, '').replace(/\n+/g, ' ').trim();
        appList.push({ name, price, originalPrice, description });
    }
    
    return appList;
}

// 截断描述文字
function truncateDescription(description, maxLength) {
    return description.length > maxLength ? description.substring(0, maxLength) + '…' : description;
}