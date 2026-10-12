/*
 * WorkBuddy 签到助手 · 每日签到 + 派猫猫旅行（Loon cron 脚本）
 * ==========================================================
 * 配套：wb-cookie.js（抓网页会话）+ wb-token.js（抓长效令牌）
 *
 * 配置（Loon）：
 *   [Script]
 *   cron "0 9 * * *" script-path=<本文件URL>, tag=WorkBuddy签到, timeout=60, enable=true
 *
 * 凭据优先级（自动择优，无需配置）：
 *   1) 长效令牌 wb_refresh_token —— 每次运行先调官方刷新接口换新的接口令牌，
 *      并把轮换后的新长效令牌回写本机。有效期最长、且不绑定 User-Agent。
 *   2) 接口令牌 wb_access_token —— 直接使用（未过期时）。
 *   3) 网页会话 wb_checkin_cookie —— 兜底，绑定 User-Agent。
 *   任一凭据失效会自动降级到下一档，并把失效的档位清掉，避免反复失败。
 *
 * 行为：
 *   1) 查询签到状态，当天未签则领取（+100 积分）
 *   2) 派猫猫旅行闭环：先领（arrived）后派（idle 且未达每日上限）
 *   3) 结果通过系统通知展示，含积分余额
 *
 * 幂等：当天已签到会安全跳过，不会重复领取。
 * 安全：凭据只存在 Loon 本机存储，脚本不回显、不外传。
 */

const VERSION = "2.0.0";

const KEY_COOKIE = "wb_checkin_cookie";
const KEY_UA = "wb_checkin_ua";
const KEY_RT = "wb_refresh_token";
const KEY_AT = "wb_access_token";
const KEY_LOC = "wb_checkin_location"; // 可选：1-4 指定旅行地点，留空则随机

const BASE = "https://www.workbuddy.cn";
const STATUS_PATH = "/v2/billing/meter/checkin-activity-status";
const CHECKIN_PATH = "/v2/billing/meter/daily-checkin";
const TRAVEL_STATUS = "/activity/growth/buddy/travel/status";
const TRAVEL_CLAIM = "/activity/growth/buddy/travel/claim";
const TRAVEL_DEPART = "/activity/growth/buddy/travel/depart";

/* 长效令牌刷新接口：不校验 User-Agent，适合服务端/手机定时场景 */
const REFRESH_URL = "https://copilot.tencent.com/v2/plugin/auth/token/refresh";

const FALLBACK_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
  "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const cookie = $persistentStore.read(KEY_COOKIE) || "";
const ua = $persistentStore.read(KEY_UA) || FALLBACK_UA;

var refreshToken = $persistentStore.read(KEY_RT) || "";
var accessToken = $persistentStore.read(KEY_AT) || "";
var mode = "none";   // token | cookie | none

const locRaw = parseInt($persistentStore.read(KEY_LOC), 10);
const locationId = (locRaw >= 1 && locRaw <= 4) ? locRaw : (Math.floor(Math.random() * 4) + 1);

function notify(subtitle, body) {
  $notification.post("WorkBuddy 签到助手", subtitle, body);
}

/* 通用请求：显式传 headers，便于刷新接口用不同鉴权头 */
function raw(method, url, headers, body) {
  return new Promise(function (resolve, reject) {
    const opts = { url: url, headers: headers, timeout: 20 };
    const cb = function (err, resp, data) {
      if (err) { reject(err); return; }
      let json = null;
      try { json = JSON.parse(data); } catch (e) { json = null; }
      resolve({ status: resp ? resp.status : 0, json: json });
    };
    if (method === "GET") {
      $httpClient.get(opts, cb);
    } else {
      opts.body = body || "{}";
      $httpClient.post(opts, cb);
    }
  });
}

function authHeaders() {
  const h = {
    "Accept": "application/json",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Content-Type": "application/json",
    "User-Agent": ua
  };
  if (mode === "token" && accessToken) h["Authorization"] = "Bearer " + accessToken;
  else h["Cookie"] = cookie;
  return h;
}

function api(method, path, body) {
  return raw(method, BASE + path, authHeaders(), body);
}

/* 令牌失效时清掉顶层凭据（保留底层兜底），返回是否已降级 */
function downgrade() {
  if (mode === "token") {
    if (refreshToken) { $persistentStore.write("", KEY_RT); refreshToken = ""; }
    $persistentStore.write("", KEY_AT);
    accessToken = "";
    if (cookie) { mode = "cookie"; return true; }
    mode = "none";
    return false;
  }
  return false;
}

/* 带自愈的接口调用：401/403 时降级并重试一次 */
async function apiRetry(method, path, body) {
  let r = await api(method, path, body);
  if ((r.status === 401 || r.status === 403) && mode === "token") {
    if (downgrade()) r = await api(method, path, body);
  }
  return r;
}

/* 选定本次使用的凭据档位 */
async function resolveMode() {
  if (refreshToken) {
    try {
      const r = await raw("POST", REFRESH_URL, {
        "Content-Type": "application/json",
        "X-Refresh-Token": refreshToken,
        "X-Auth-Refresh-Source": "plugin",
        "X-Domain": "copilot.tencent.com",
        "User-Agent": ua
      }, "{}");
      const d = (r.json && r.json.data) || {};
      if (r.status === 200 && d.accessToken) {
        accessToken = d.accessToken;
        mode = "token";
        $persistentStore.write(accessToken, KEY_AT);
        // 令牌轮换：回写新的长效令牌，实现自续
        if (d.refreshToken && d.refreshToken !== refreshToken) {
          refreshToken = d.refreshToken;
          $persistentStore.write(refreshToken, KEY_RT);
        }
        return true;
      }
      // 长效令牌已失效：清掉，继续往下兜底（避免每天都失败一次）
      $persistentStore.write("", KEY_RT);
      refreshToken = "";
    } catch (e) {
      // 刷新接口临时不可用：本次不放弃，若已有接口令牌则继续用
      if (accessToken) { mode = "token"; return true; }
    }
  }
  if (accessToken) { mode = "token"; return true; }
  if (cookie) { mode = "cookie"; return true; }
  return false;
}

function modeText() {
  if (mode === "token") return "长效令牌";
  if (mode === "cookie") return "网页会话";
  return "无";
}

function msgOf(r, fallback) {
  if (r && r.json && r.json.msg) return r.json.msg;
  return fallback + (r ? "（HTTP " + r.status + "）" : "");
}

/* 地点名：接口返回 location 对象 {id, code, name, duration_hours} */
function locName(td) {
  const loc = (td && td.location) || {};
  return loc.name || "";
}

/* 到达倒计时：用 arrive_at - server_now 推算，避免依赖文案字段 */
function remainText(td) {
  if (!td || !td.arrive_at || !td.server_now) return "稍后";
  const sec = td.arrive_at - td.server_now;
  if (sec <= 0) return "即将";
  const min = Math.ceil(sec / 60);
  if (min < 60) return "约 " + min + " 分钟后";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return "约 " + h + " 小时" + (m ? m + " 分钟" : "") + "后";
}

(async function main() {
  try {
    const ready = await resolveMode();
    if (!ready) {
      notify("尚未捕获凭据",
        "请在 iPhone 的 Safari 里打开并登录 www.workbuddy.cn，凭据会自动保存后重试");
      $done();
      return;
    }

    const lines = [];

    /* ---------- 1. 签到 ---------- */
    let st;
    try {
      st = await apiRetry("POST", STATUS_PATH);
    } catch (e) {
      notify("网络错误", "签到状态查询失败：" + e);
      $done();
      return;
    }

    if (st.status === 401 || st.status === 403) {
      notify("凭据已失效",
        "请重新在 Safari 登录 www.workbuddy.cn，凭据会自动更新");
      $done();
      return;
    }

    let sd = (st.json && st.json.data) || {};
    let balance = (sd.total_credits != null) ? sd.total_credits : sd.balance;
    let justChecked = false;

    if (sd.today_checked_in === true) {
      lines.push("签到：今日已签，连签 " + (sd.streak_days || "?") + " 天");
    } else {
      const r = await apiRetry("POST", CHECKIN_PATH);
      const code = (r.json && r.json.code != null) ? r.json.code : null;
      const rd = (r.json && r.json.data) || {};
      if (r.status === 200 && code === 0) {
        justChecked = true;
        lines.push("签到：+" + (rd.credit || 100) + " 积分，连签 " + (rd.streak_days || sd.streak_days || "?") + " 天");
      } else if (code === 10001 || /已签到/.test((r.json && r.json.msg) || "")) {
        lines.push("签到：今日已签（幂等跳过）");
      } else {
        lines.push("签到失败：" + msgOf(r, "领取未成功"));
      }
    }

    /* ---------- 2. 派猫猫旅行（先领后派） ---------- */
    try {
      let t = await apiRetry("GET", TRAVEL_STATUS);
      let td = (t.json && t.json.data) || {};

      if (td.state === "arrived") {
        const c = await apiRetry("POST", TRAVEL_CLAIM);
        const cd = (c.json && c.json.data) || {};
        const ccode = (c.json && c.json.code != null) ? c.json.code : null;
        if (c.status === 200 && ccode === 0) {
          lines.push("旅行：已从" + (locName(td) || "目的地") + "领取 +" +
            (cd.reward_credit || td.reward_credit || "?") + " 积分");
        } else {
          lines.push("旅行：到达但领取失败（" + msgOf(c, "领取未成功") + "）");
        }
        t = await apiRetry("GET", TRAVEL_STATUS);
        td = (t.json && t.json.data) || {};
      }

      if (td.state === "idle") {
        if (td.daily_limit_reached) {
          lines.push("旅行：今日派遣次数已用完");
        } else {
          const d = await apiRetry("POST", TRAVEL_DEPART, JSON.stringify({ location_id: locationId }));
          const dcode = (d.json && d.json.code != null) ? d.json.code : null;
          if (d.status === 200 && dcode === 0) {
            let dd = (d.json && d.json.data) || {};
            const dn = locName(dd);
            // 派发响应通常不含 server_now，无法算倒计时 → 回读一次状态补齐
            if (!dd.server_now) {
              try {
                const t2 = await apiRetry("GET", TRAVEL_STATUS);
                const td2 = (t2.json && t2.json.data) || {};
                if (td2.arrive_at && td2.server_now) dd = td2;
              } catch (e) { /* 回读失败不影响派遣结论 */ }
            }
            const dn2 = locName(dd) || dn;
            lines.push("旅行：已派出 Buddy" + (dn2 ? " 去" + dn2 : "") +
              "，" + remainText(dd) + "到达（可领 " + (dd.reward_credit || "?") + " 积分）");
          } else {
            lines.push("旅行：派遣未成功（" + msgOf(d, "派遣未成功") + "）");
          }
        }
      } else if (td.state === "traveling") {
        const tn = locName(td);
        lines.push("旅行：Buddy 正在" + (tn || "旅途中") + "，" +
          remainText(td) + "到达（可领 " + (td.reward_credit || "?") + " 积分）");
      }
    } catch (e) {
      lines.push("旅行：状态获取失败（不影响签到结果）");
    }

    /* ---------- 3. 刷新余额 ---------- */
    if (justChecked) {
      try {
        const s2 = await apiRetry("POST", STATUS_PATH);
        const sd2 = (s2.json && s2.json.data) || {};
        if (sd2.total_credits != null) balance = sd2.total_credits;
        else if (sd2.balance != null) balance = sd2.balance;
      } catch (e) { /* 余额刷新失败不影响结论 */ }
    }

    if (balance != null) lines.push("积分余额：" + balance);
    lines.push("凭据模式：" + modeText());

    notify(lines[0] || "执行完成", lines.slice(1).join("\n") || "无更多信息");
  } catch (e) {
    notify("执行异常", String(e));
  }
  $done();
})();
