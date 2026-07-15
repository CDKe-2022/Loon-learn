/**
 * WPS · Cookie 抓取（Loon 专用版 v1.0）
 *
 * 抓取:打开「WPS」APP → 进任意活动页(任务中心/福利中心,如「天天领福利」)→ 自动触发 page_info,抓 wps_sid
 *
 * @Author: MaYIHEI <https://github.com/MaYIHEI/paperclip>
 * @Channel: Telegram 频道 https://t.me/mayihei
 * @Version: 1.0
 * @Updated: 2026-07-15
 */

const CK_KEY = "wps_sid"; // 只存 wps_sid 这一个长效登录态(activity 接口认 wps_sids,值与 wps_sid 相同)

(function main() {
    if (typeof $request === "undefined") {
        console.log("[ERROR] 该脚本仅作为 http-request 重写脚本运行");
        $done();
        return;
    }
    if ($request.method === "OPTIONS") {
        $done();
        return;
    }

    try {
        // 将所有的 headers 转为字符串，防止多个 cookie 头导致只读取到第一个
        const headersStr = JSON.stringify($request.headers);

        // 兼容 wps_sid=xxx 或 "wps_sid":"xxx" 的格式，提取字母数字组合
        const m = headersStr.match(/wps_sid[s]?[=:]\s*"?([A-Za-z0-9_\-]+)/);

        if (!m) {
            console.log("[WARN] 请求头里没找到 wps_sid,可能该请求未带登录态,换个活动页重试");
            $done();
            return;
        }
        const sid = m[1];

        const old = $persistentStore.read(CK_KEY) || "";
        if (old === sid) {
            console.log("[INFO] wps_sid 未变,跳过更新");
            $done();
            return;
        }

        $persistentStore.write(sid, CK_KEY);
        console.log(`[INFO] 已更新 wps_sid (${maskSid(sid)})`);
        $notification.post("WPS", "✅ WPS Cookie 获取成功", "可去签到脚本验证");
    } catch (e) {
        console.log("[ERROR] cookie 抓取失败: " + e);
    }

    $done({});
})();

function maskSid(s) {
    if (!s || s.length < 12) return "已获取";
    return s.slice(0, 6) + "***" + s.slice(-4);
}