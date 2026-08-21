/**
 * 起点 Cookie 抓取脚本（Loon http-response）
 * 触发：打开起点App → 进入福利中心等H5页面
 * 存储：$persistentStore 键名 QDREADER_COOKIE（与原脚本一致）
 */

// ① 读取请求头里的 Cookie
let cookieStr = '';
let h = $request.headers || {};
if (h['Cookie']) cookieStr = h['Cookie'];
else if (h['cookie']) cookieStr = h['cookie'];

// ② 解析响应体，拿 UserId
let userId = '';
try {
    let body = JSON.parse($response.body);
    if (body && body.Data && body.Data.UserId) {
        userId = String(body.Data.UserId);
    }
} catch (e) {
    console.log('响应体解析失败: ' + e.message);
}

// ③ 构造与原脚本相同的输出格式，存入 QDREADER_COOKIE
if (cookieStr && userId) {
    let result = {};
    result[userId] = cookieStr;

    $persistentStore.write(JSON.stringify(result), 'QDREADER_COOKIE');

    $notification.post(
        '起点 Cookie 获取成功',
        'UserId: ' + userId,
        '已写入持久化存储键名: QDREADER_COOKIE'
    );

    console.log('===== 完整输出 =====');
    console.log(JSON.stringify(result, null, 2));
} else {
    $notification.post(
        '起点 Cookie 获取失败',
        '',
        'Cookie: ' + (cookieStr ? '✓ 已获取' : '✗ 未获取') +
        ' | UserId: ' + (userId || '✗ 未获取（可能未登录）')
    );
}

$done({});
