// 斗鱼签到 Loon 脚本（经验+鱼丸显示版）

const SIGN_URL = "https://apiv2.douyucdn.cn/h5nc/sign/sendSign";
const KEY_COOKIE = "dy_cookie";
const KEY_BODY = "dy_body";

const isGetCookie = typeof $request != "undefined";

// ======= 获取 Cookie =======
if (isGetCookie) {
    let cookie = $request.headers["Cookie"] || $request.headers["cookie"];
    let body = $request.body;

    if (cookie) {
        $persistentStore.write(cookie, KEY_COOKIE);
        console.log("🎉 已成功获取斗鱼 Cookie");
    }

    if (body) {
        $persistentStore.write(body, KEY_BODY);
        console.log("📌 已保存签到请求 Body");
    }

    $notification.post("斗鱼签到", "Cookie 获取成功", "");
    $done({});
    return;
}

// ======= 开始签到 =======
!(async () => {
    let cookie = $persistentStore.read(KEY_COOKIE);
    let body = $persistentStore.read(KEY_BODY);

    if (!cookie) {
        $notification.post("斗鱼签到", "❌ 缺少 Cookie", "请先打开签到页面获取");
        return $done();
    }

    if (!body) {
        $notification.post("斗鱼签到", "❌ 缺少 Body", "请重新获取");
        return $done();
    }

    const headers = {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "cookie": cookie,
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
        "origin": "https://apiv2.douyucdn.cn",
        "referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
    };

    $httpClient.post(
        {
            url: SIGN_URL,
            headers: headers,
            body: body
        },
        function (error, response, data) {
            if (error) {
                $notification.post("斗鱼签到", "❌ 请求失败", error.toString());
                return $done();
            }

            try {
                let obj = JSON.parse(data);

                if (obj.error === "0") {
                    // 经验 + 鱼丸
                    let exp = obj.data.sign_exp || 0;      // 今日经验
                    let silver = obj.data.sign_siln || 0;  // 今日鱼丸（你提供的值）

                    let msg = `经验 +${exp}，鱼丸 +${silver}`;
                    $notification.post("斗鱼签到", "✅ 签到成功", msg);
                } else {
                    $notification.post("斗鱼签到", "⚠️ 签到失败", JSON.stringify(obj));
                }
            } catch (e) {
                $notification.post("斗鱼签到", "⚠️ 解析失败", e.toString());
            }

            $done();
        }
    );
})();