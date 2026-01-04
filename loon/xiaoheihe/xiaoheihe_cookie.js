// 小黑盒Cookie捕获脚本
// 用于捕获并存储动态变化的cookie

const cookieName = "heybox_cookie";
const cookieKey = "heybox_cookie_data";

if ($request && $request.headers && $request.headers["Cookie"]) {
    const cookie = $request.headers["Cookie"];
    const url = $request.url;
    
    // 从URL中提取heybox_id
    const heyboxIdMatch = url.match(/heybox_id=(\d+)/);
    const heyboxId = heyboxIdMatch ? heyboxIdMatch[1] : "";
    
    if (heyboxId && cookie) {
        // 存储cookie和heybox_id
        const cookieData = {
            cookie: cookie,
            heybox_id: heyboxId,
            timestamp: Date.now()
        };
        
        const success = $persistentStore.write(JSON.stringify(cookieData), cookieKey);
        
        if (success) {
            $notification.post("小黑盒", "Cookie捕获成功", `账户ID: ${heyboxId}`);
            console.log(`小黑盒Cookie捕获成功: heybox_id=${heyboxId}`);
        } else {
            $notification.post("小黑盒", "Cookie捕获失败", "存储失败");
            console.log("小黑盒Cookie存储失败");
        }
    }
}

$done();