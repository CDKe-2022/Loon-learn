/*
斗鱼每日签到（优化稳健版，Loon）
- 准确区分：签到成功 / 今日已签 / 查询成功但未签 / 请求失败
- 兼容 error 为数字或字符串
- Cookie 仅发送有效字段，减少异常
*/

(() => {
  "use strict";

  // ========== 配置 ==========
  const ENABLE_NOTIFICATION = true;

  // 可改成 persistentStore 覆盖（便于更新）
  const DEFAULT_DEVICE_ID = "d2699126c76fbe037a3cb50200001621";
  const DEFAULT_USER_TOKEN = "160153378_11_e79954d2d6e04f51_2_90552255";

  const DEVICE_ID = $persistentStore.read("douyu_device_id") || DEFAULT_DEVICE_ID;
  const USER_TOKEN = $persistentStore.read("douyu_user_token") || DEFAULT_USER_TOKEN;

  const DY_COOKIE = {
    acf_auth: $persistentStore.read("douyu_acf_auth") || "",
    acf_uid: $persistentStore.read("douyu_acf_uid") || "",
    install_id: $persistentStore.read("douyu_install_id") || "",
    ttreq: $persistentStore.read("douyu_ttreq") || ""
  };

  const API = {
    sign: "https://apiv2.douyucdn.cn/h5nc/sign/sendSign",
    info: "https://apiv2.douyucdn.cn/h5nc/sign/getSign"
  };

  // ========== 工具 ==========
  function buildCookieString() {
    const pairs = [];
    Object.keys(DY_COOKIE).forEach(k => {
      const v = DY_COOKIE[k];
      if (v) pairs.push(`${k}=${v}`);
    });
    return pairs.join("; ");
  }

  function formEncode(obj) {
    return Object.keys(obj)
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(obj[k] == null ? "" : String(obj[k]))}`)
      .join("&");
  }

  function makeRequest(url, formObj) {
    return {
      url,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148, Douyu_IOS",
        "Referer": "https://apiv2.douyucdn.cn/H5/Sign/info?client_sys=ios&ic=0",
        "Origin": "https://apiv2.douyucdn.cn",
        "Cookie": buildCookieString()
      },
      body: formEncode(formObj),
      timeout: 10000
    };
  }

  function postJSON(params) {
    return new Promise((resolve, reject) => {
      $httpClient.post(params, (err, resp, data) => {
        if (err) return reject(new Error(`网络错误: ${err}`));

        const code = Number(resp && resp.status);
        if (!code || code < 200 || code >= 300) {
          return reject(new Error(`HTTP状态异常: ${code || "unknown"}`));
        }

        try {
          const json = JSON.parse(data || "{}");
          resolve(json);
        } catch (e) {
          reject(new Error(`JSON解析失败: ${e.message}`));
        }
      });
    });
  }

  function toErrorCode(resp) {
    return String((resp && resp.error) ?? "");
  }

  function notify(title, subtitle, message) {
    console.log(`[斗鱼签到] ${title} | ${subtitle}\n${message}`);
    if (ENABLE_NOTIFICATION) $notification.post(title, subtitle, message);
  }

  function formatSignData(data) {
    const today = data?.sign_today || new Date().toISOString().slice(0, 10);
    return {
      today,
      fishBall: Number(data?.sign_siln || 0),
      addExp: Number(data?.sign_exp || 0),
      continuous: Number(data?.sign_rd || 0),
      monthDays: Number(data?.sign_md || 0),
      totalDays: Number(data?.sign_sum || 0),
      totalExp: Number(data?.sign_exps || 0)
    };
  }

  function render(status, data) {
    const d = formatSignData(data || {});
    if (status === "success") {
      return {
        title: "斗鱼签到成功",
        subtitle: `+${d.fishBall}鱼丸 +${d.addExp}经验`,
        message:
          `✅ 今日签到成功\n` +
          `📅 日期: ${d.today}\n` +
          `🔥 连续签到: ${d.continuous} 天\n` +
          `📅 本月签到: ${d.monthDays} 天\n` +
          `📊 总签到次数: ${d.totalDays} 次\n` +
          `📈 总经验值: ${d.totalExp}`
      };
    }
    if (status === "already") {
      return {
        title: "斗鱼签到状态",
        subtitle: `今日已签到，连续 ${d.continuous} 天`,
        message:
          `ℹ️ 今日已签到\n` +
          `📅 日期: ${d.today}\n` +
          `🔥 连续签到: ${d.continuous} 天\n` +
          `📅 本月签到: ${d.monthDays} 天\n` +
          `📊 总签到次数: ${d.totalDays} 次\n` +
          `📈 总经验值: ${d.totalExp}`
      };
    }
    if (status === "not_signed_but_query_ok") {
      return {
        title: "斗鱼签到异常",
        subtitle: "签到请求失败，但状态可查询",
        message:
          `⚠️ 签到请求未成功，且并非“已签到”返回\n` +
          `📅 日期: ${d.today}\n` +
          `🔥 连续签到: ${d.continuous} 天\n` +
          `请检查 token / did / Cookie 是否过期`
      };
    }
    return {
      title: "斗鱼签到失败",
      subtitle: "请求异常",
      message: "❌ 签到失败，状态也无法获取\n请检查网络或 Cookie 是否失效"
    };
  }

  // ========== 核心 ==========
  async function getSignInfo() {
    const req = makeRequest(API.info, { token: USER_TOKEN });
    const resp = await postJSON(req);
    const code = toErrorCode(resp);
    if (code === "0") return resp.data || {};
    throw new Error(`getSignInfo error=${code}`);
  }

  async function doSign() {
    const req = makeRequest(API.sign, {
      client_sys: "ios",
      did: DEVICE_ID,
      token: USER_TOKEN
    });
    const resp = await postJSON(req);
    const code = toErrorCode(resp);

    if (code === "0") return { status: "success", data: resp.data || {} };
    if (code === "6305") return { status: "already" }; // 今日已签到
    return { status: "fail", code };
  }

  async function main() {
    if (!DY_COOKIE.acf_auth) {
      return notify("斗鱼签到失败", "缺少Cookie", "❌ 未检测到 acf_auth，请先抓取 Cookie");
    }

    let signRet;
    try {
      signRet = await doSign();
    } catch (e) {
      signRet = { status: "fail", reason: e.message };
    }

    if (signRet.status === "success") {
      return notify(...Object.values(render("success", signRet.data)));
    }

    if (signRet.status === "already") {
      try {
        const info = await getSignInfo();
        return notify(...Object.values(render("already", info)));
      } catch {
        return notify("斗鱼签到状态", "今日已签到", "ℹ️ 今日已签到，但查询详情失败");
      }
    }

    // fail: 不再误报“已签到”
    try {
      const info = await getSignInfo();
      notify(...Object.values(render("not_signed_but_query_ok", info)));
    } catch {
      notify(...Object.values(render("hard_fail")));
    }
  }

  main().catch(e => {
    notify("斗鱼签到异常", "", `❌ 脚本异常: ${e.message}`);
  }).finally(() => $done());
})();