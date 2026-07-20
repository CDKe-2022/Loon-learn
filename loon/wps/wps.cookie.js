/**
 * WPS · Cookie 抓取（Loon 专用版 v1.1）
 *
 * 抓取:打开「WPS」APP → 进任意活动页(任务中心/福利中心,如「天天领福利」)→ 自动触发 page_info,抓 wps_sid
 *
 * 优化:
 * 1. 优先从 Cookie 请求头精确提取 wps_sid
 * 2. 找不到时再回退到全 headers 扫描
 * 3. 兼容 header 大小写与数组形式
 */
const CK_KEY = "wps_sid";

(function main() {
    if (typeof $request === "undefined") {
        console.log("[ERROR] 该脚本仅作为 http-request 重写脚本运行");
        $done({});
        return;
    }
    if ($request.method === "OPTIONS") {
        $done({});
        return;
    }

    try {
        const sid = extractSid($request.headers || {});
        if (!sid) {
            console.log("[WARN] 请求头里没找到 wps_sid,可能该请求未带登录态,换个活动页重试");
            $done({});
            return;
        }

        const old = $persistentStore.read(CK_KEY) || "";
        if (old === sid) {
            console.log("[INFO] wps_sid 未变,跳过更新");
            $done({});
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

function extractSid(headers) {
    const cookieHeader = findHeader(headers, "cookie");
    const fromCookie = parseCookieHeader(cookieHeader);
    if (fromCookie) return fromCookie;

    const headersStr = JSON.stringify(headers);
    const m = headersStr.match(/wps_sid[s]?[=:]\s*"?([^";,\s}]+)/i);
    return m ? m[1] : "";
}

function findHeader(headers, name) {
    const lowerName = String(name || "").toLowerCase();
    for (const key in headers) {
        if (String(key).toLowerCase() !== lowerName) continue;
        const value = headers[key];
        if (Array.isArray(value)) return value.join("; ");
        if (value == null) return "";
        return String(value);
    }
    return "";
}

function parseCookieHeader(cookieHeader) {
    if (!cookieHeader) return "";
    const pairs = String(cookieHeader).split(";");
    for (const pair of pairs) {
        const idx = pair.indexOf("=");
        if (idx < 0) continue;
        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (/^wps_sids?$/i.test(key) && value) {
            return value;
        }
    }
    return "";
}

function maskSid(s) {
    if (!s || s.length < 12) return "已获取";
    return s.slice(0, 6) + "***" + s.slice(-4);
}