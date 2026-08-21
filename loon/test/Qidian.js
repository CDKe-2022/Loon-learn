/*
 * 起点读书 · 福利中心 — 主脚本（cron 定时任务）
 * ──────────────────────────────────────────────────────────
 * 流程：
 *   1) mainPage 拿任务 → 逐个未完成任务 finishWatch(看完广告)，含惊喜福利
 *   2) doCheckin 签到（服务端按账号状态判断是否已签）
 *   3) doLottery 抽奖（服务端按账号剩余抽奖次数决定抽几次）
 *   4) 汇总推送结果
 *
 * 签名机制：每个起点请求都先调用第三方签名网关 api.120399.xyz/qdreader/sign
 *          拿到签名头(sdksign/qdsign/borgus/tstamp/ibex/cecelia...) 再贴到请求上。
 *
 * Loon 配置：
 *   [Script]
 *   qidian_welfare = cron,30 8 * * *,tag=起点福利中心,script-path=https://你的地址/qidian_welfare.js
 *
 * 依赖：持久化存储里要有 QDREADER_COOKIE，值为 JSON：{"uid":"cookie串"}
 *      （兼容裸 Cookie 字符串）。可配合 qidian_welfare_cookie.js 自动刷新。
 *   注意：本脚本直接复用原脚本的签名网关，效果与原脚本一致；网关若失效需另寻签名方案。
 *
 * ── 迭代记录 ─────────────────────────────────────────────
 * [修正1] finishWatch 请求体按抓包改为 3 参数（h5/taskId/type），旧参数注释保留
 * [修正2] type 参数按任务来源动态化（激励/多步=0，阅读页=1）
 * [修正3] 新增 doSurpriseBenefit 模块（每小时惊喜福利广告任务）
 * [键名修正] 存储键为 QDREADER_COOKIE（大写），值格式 {"uid":"cookie串"}，
 *           ctx.uid 正确传入签名网关（修复上一版漏传 uid 的 bug）
 */

// ===== 配置区 =====
const STORE_COOKIE = 'QDREADER_COOKIE';  // [键名修正] 大写键名，值为 JSON {"uid":"cookie串"}
const STORE_UID = 'qdreader_uid';        // 已废弃，仅为兼容保留，可删
const SIGN_GATEWAY = 'https://api.120399.xyz/qdreader/sign';

// 接口地址（host 均为 h5.if.qidian.com，与原脚本 API 对象一致）
const MP_URL = 'https://h5.if.qidian.com/argus/api/v2/video/adv/mainPage';
const FW_URL = 'https://magev6.if.qidian.com/argus/api/v1/video/adv/finishWatch';
const WEEK_CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/getcurrentweekcheckininfo';
const CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/checkin';
const LOTTERY_URL = 'https://h5.if.qidian.com/argus/api/v2/checkin/lottery';

// 固定头（来自真实抓包，可保持静态；如某天报错可删除 abtest-gzip 这一行）
// 注：原脚本的 abtest-gzip 为 gzip(JSON) 的 base64；此处为合法 gzip("{}") 占位，
//     若 mainPage 异常可整行删除（原脚本亦注明此行为可选）。
const ABTEST_GZIP = 'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==';

// ===== 工具函数 =====
function parseCookie(cookie) {
  const map = {};
  cookie.split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) map[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return map;
}

// [键名修正] 读取 QDREADER_COOKIE，值为 JSON：{"uid":"cookie串"}
//   JSON 的 key 就是 uid（如 {"969032829":"cmfuToken=...;ywguid=..."}）
//   兼容旧格式：裸 Cookie 字符串（此时 uid 为空，签名网关收空 uid）
function readStoredCookie() {
  const stored = $persistentStore.read(STORE_COOKIE);
  if (!stored) return { uid: '', cookie: '' };
  const s = String(stored).trim();
  if (s.charAt(0) === '{') {
    try {
      const obj = JSON.parse(s);
      const uid = Object.keys(obj)[0] || '';
      return { uid: uid, cookie: uid ? String(obj[uid]) : '' };
    } catch (e) { /* 格式异常，按裸字符串处理 */ }
  }
  return { uid: '', cookie: s };
}

function httpReq(method, url, headers, body) {
  return new Promise(function (resolve) {
    const cb = function (e, resp, data) {
      if (e) { console.log('[http] ' + method + ' ' + url + ' error: ' + e); resolve({ status: 0, body: '' }); return; }
      resolve({ status: (resp && resp.status) || 0, body: data || '' });
    };
    if (method === 'GET') $httpClient.get(url, headers, cb);
    else $httpClient.post(url, headers, body || '', cb);
  });
}

// 调用签名网关，返回签名头对象（如 {SDKSign,borgus,tstamp,helios,ibex} 或 {QDSign,borgus,tstamp,ibex,cecelia,sora}）
function getSign(url, method, dataObj, ctx) {
  return new Promise(function (resolve) {
    const payload = {
      qdh: ctx.qdh, qdheader: '', url: url, method: method,
      data: dataObj || {}, uid: ctx.uid || '', guid: ctx.guid, qimei: ctx.qimei, qimei36: ctx.qimei,
    };
    $httpClient.post(SIGN_GATEWAY, { 'Content-Type': 'application/json' }, JSON.stringify(payload), function (e, resp, data) {
      if (e) { console.log('[sign] error: ' + e); resolve(null); return; }
      try {
        const j = JSON.parse(data);
        resolve(j && j.data ? j.data : null);
      } catch (ex) { console.log('[sign] parse fail: ' + ex); resolve(null); }
    });
  });
}

// 把网关返回的签名字段(大写键)小写化挂到请求头
function attachSigns(headers, signData) {
  if (!signData) return headers;
  for (const k in signData) {
    if (signData.hasOwnProperty(k)) headers[k.toLowerCase()] = signData[k];
  }
  return headers;
}

function baseHeaders(cookie, signData, isPost) {
  const h = {};
  attachSigns(h, signData);
  h['cookie'] = cookie;
  if (isPost) {
    h['Content-Type'] = 'application/x-www-form-urlencoded';
    h['User-Agent'] = 'QDReaderAppStore/5.9.472 (iPhone; iOS 26.6.1; Scale/3.00)';
    h['Accept'] = 'application/json';
    h['Accept-Language'] = 'zh-Hans-GB;q=1';
    h['maxdpwidth'] = '844';
  } else {
    h['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/QDReaderiOS/5.9.472/746/QDReaderAppstore/QDNightStyle_1/QDShowNativeLoading/getTabHeight_91';
    h['Accept'] = 'application/json, text/plain, */*';
    h['Accept-Language'] = 'zh-CN,zh-Hans;q=0.9';
    h['abtest-gzip'] = ABTEST_GZIP;
    h['helios'] = '1';
    h['referer'] = 'https://h5.if.qidian.com/new/welfareCenter/?_viewmode=0';
  }
  return h;
}

// ===== [修正2] 从 mainPage 响应里抽取未完成任务（按模块标记 type）=====
// type 映射（抓包验证）：
//   DailyBenefitModule（激励任务）→ '0'   2026-08-21 已验证
//   VideoRewardTab（多步视频任务）→ '0'   已验证（完成3个广告得奖励，3次均 type=0）
//   ReadingPageTaskModule（阅读页）→ '1'  待明天任务重置后验证，若失败改为 '0'
function getTasks(mpBody) {
  const tasks = [];
  let obj;
  try { obj = JSON.parse(mpBody); } catch (e) { return tasks; }
  const d = obj.Data || {};
  const modules = [
    { mod: d.DailyBenefitModule, type: '0' },
    { mod: d.ReadingPageTaskModule, type: '1' },
    { mod: d.VideoRewardTab, type: '0' },
  ];
  modules.forEach(function (m) {
    if (!m.mod || !Array.isArray(m.mod.TaskList)) return;
    m.mod.TaskList.forEach(function (t) {
      if (t && t.TaskId && t.IsFinished === 0) {
        tasks.push({
          id: String(t.TaskId),
          raw: t.TaskRawId || '',
          total: Number(t.Total) || 1,
          process: Number(t.Process) || 0,
          type: m.type,   // 按来源模块标记 type
        });
      }
    });
  });
  return tasks;
}

// 在对象中任意层级查找某 key（忽略大小写子串）的值
function findValueByKey(obj, keySubstr) {
  const lower = keySubstr.toLowerCase();
  let found;
  (function walk(o) {
    if (found !== undefined || o === null || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const k in o) {
      if (found !== undefined) return;
      if (k.toLowerCase().indexOf(lower) >= 0 && o[k] !== null && typeof o[k] !== 'object') { found = o[k]; return; }
      if (typeof o[k] === 'object') walk(o[k]);
    }
  })(obj);
  return found;
}

// 在签到周信息里判定「今日是否已签到」。
// 常见字段为 IsCheckedIn / CheckedIn / isCheckIn 等；排除 count/info/module 等干扰字段。
function isAlreadyCheckedIn(obj) {
  let hit;
  (function walk(o) {
    if (hit !== undefined || o === null || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const k in o) {
      if (hit !== undefined) return;
      const kl = k.toLowerCase();
      // 仅匹配「已签到」语义字段
      const isFlag = /ischeckin|checkedin|checkinstatus|todaycheckin|hassignin/i.test(kl) && !/count|info|module|task|list|detail|reward|gift|config|total/i.test(kl);
      if (isFlag && (o[k] === 1 || o[k] === true || o[k] === '1')) { hit = true; return; }
      if (kl === 'ischeckedin' && (o[k] === 1 || o[k] === true || o[k] === '1')) { hit = true; return; }
      if (typeof o[k] === 'object') walk(o[k]);
    }
  })(obj);
  return !!hit;
}

// ===== 看广告（finishWatch）=====
// [修正1] 请求体按 2026-08-21 真实抓包改为 3 参数：h5=0&taskId=xxx&type=x
//   抓包证据：激励任务 content-length=38，多步任务 content-length=37，均不含 banId/gradientLevel
//   ⚠️ 旧版参数保留注释，若某类任务失败可恢复（fwData 与 fwBody 必须同步改，否则签名不一致）：
//     const fwData = { banId: '0', gradientLevel: '1', h5: '0', taskId: t.id, type: (t.type || '1') };
//     const fwBody = 'banId=0&gradientLevel=1&h5=0&taskId=' + t.id + '&type=' + (t.type || '1');
async function doAdvJobs(cookie, ctx) {
  const out = [];
  const mpSign = await getSign(MP_URL, 'get', {}, ctx);
  const mpHeaders = baseHeaders(cookie, mpSign, false);
  const mpRes = await httpReq('GET', MP_URL, mpHeaders, null);
  const mpBody = mpRes.body; // 保存给惊喜福利用，避免二次请求 mainPage
  const tasks = getTasks(mpBody);
  console.log('mainPage status=' + mpRes.status + ' tasks=' + tasks.length);

  for (const t of tasks) {
    const times = Math.min(3, Math.max(1, (t.total - t.process)));
    for (let i = 0; i < times; i++) {
      // 请求体（仅 3 参数，按抓包）
      const fwData = { h5: '0', taskId: t.id, type: (t.type || '0') };
      const fwSign = await getSign(FW_URL, 'post', fwData, ctx);
      const fwHeaders = baseHeaders(cookie, fwSign, true);
      if (ctx.qdh) fwHeaders['qdh'] = ctx.qdh;
      const fwBody = 'h5=0&taskId=' + t.id + '&type=' + (t.type || '0');

      const r = await httpReq('POST', FW_URL, fwHeaders, fwBody);
      let ok = false, msg = '', j = null;
      try { j = JSON.parse(r.body); ok = j && j.Result === 0; msg = (j && j.Message) || ('HTTP ' + r.status); } catch (e) { msg = 'HTTP ' + r.status; }
      // 多步任务中间步骤 RewardList 为空（进度+1），最后一步才有奖励——两者都算成功
      const reward = (j && j.Data && j.Data.RewardList && j.Data.RewardList.length) ? '(奖励×' + j.Data.RewardList.length + ')' : '';
      out.push((i + 1) + '/' + times + ' 任务' + t.id + ': ' + (ok ? '成功' + reward : '失败(' + msg + ')'));
      console.log('finishWatch task=' + t.id + ' type=' + t.type + ' ' + (ok ? 'OK' : msg));
    }
  }

  // [修正3] 惊喜福利（复用同一个 mpBody）
  try {
    const sbResult = await doSurpriseBenefit(cookie, ctx, mpBody);
    if (sbResult) out.push(sbResult);
  } catch (e) { console.log('surprise benefit error: ' + e); }

  return { lines: out, count: tasks.length };
}

// ===== [修正3] 惊喜福利（doSurpriseBenefit）=====
// mainPage 里的 SurpriseBenefit 节点（每小时广告任务）。
//   IsFinished === 1  → 已完成，跳过
//   IntervalTime < 0  → 冷却剩余毫秒（换算分钟；若日志数值离谱，可能单位是秒，届时除以1000）
//   type = '0'（与其他非阅读页任务一致）
async function doSurpriseBenefit(cookie, ctx, mpBody) {
  let obj;
  try { obj = JSON.parse(mpBody); } catch (e) { return null; }
  const sb = obj.Data && obj.Data.SurpriseBenefit;
  if (!sb || !sb.TaskId) return null;

  // 已完成
  if (sb.IsFinished === 1) return '惊喜福利: 已完成';

  // 冷却中
  if (Number(sb.IntervalTime) < 0) {
    const mins = Math.round(Math.abs(Number(sb.IntervalTime)) / 60000);
    return '惊喜福利: 冷却中(约' + mins + '分钟)';
  }

  // 执行（type=0）
  const fwData = { h5: '0', taskId: String(sb.TaskId), type: '0' };
  const fwSign = await getSign(FW_URL, 'post', fwData, ctx);
  const fwHeaders = baseHeaders(cookie, fwSign, true);
  if (ctx.qdh) fwHeaders['qdh'] = ctx.qdh;
  const fwBody = 'h5=0&taskId=' + sb.TaskId + '&type=0';

  const r = await httpReq('POST', FW_URL, fwHeaders, fwBody);
  let ok = false, j = null;
  try { j = JSON.parse(r.body); ok = j && j.Result === 0; } catch (e) {}
  const reward = (j && j.Data && j.Data.RewardList && j.Data.RewardList.length) ? '(奖励×' + j.Data.RewardList.length + ')' : '';
  return ok ? ('惊喜福利: 成功' + reward) : '惊喜福利: 失败';
}

// ===== 签到（doCheckin）=====
// POST /argus/api/v3/checkin/checkin，SDKSign 组，空 body（服务端按账号状态判断）。
// 先查本周签到信息判断是否已签，避免重复请求。
// 2026-08-21 抓包已验证：POST 空请求体，成功响应 {"Message":"","Result":0,"Data":{}}
async function doCheckin(cookie, ctx) {
  // 1) 查本周签到信息
  const wcSign = await getSign(WEEK_CHECKIN_URL, 'get', {}, ctx);
  const wcHeaders = baseHeaders(cookie, wcSign, false);
  const wcRes = await httpReq('GET', WEEK_CHECKIN_URL, wcHeaders, null);
  let already = false;
  try {
    const obj = JSON.parse(wcRes.body);
    already = isAlreadyCheckedIn(obj);
  } catch (e) { /* 解析失败则继续尝试签到 */ }
  if (already) return '今日已签到';

  // 2) 执行签到（空 body）
  const ckSign = await getSign(CHECKIN_URL, 'post', {}, ctx);
  const ckHeaders = baseHeaders(cookie, ckSign, true);
  if (ctx.qdh) ckHeaders['qdh'] = ctx.qdh;
  const r = await httpReq('POST', CHECKIN_URL, ckHeaders, '');
  let ok = false, msg = '';
  try {
    const j = JSON.parse(r.body);
    ok = (j && (j.Result === 0 || j.ok === true || j.Success === true));
    msg = (j && (j.Message || j.message)) || ('HTTP ' + r.status);
  } catch (e) { msg = 'HTTP ' + r.status; }
  if (ok) return '签到成功';
  // 已签到类提示也算成功
  if (/已签到|已经签到|今日已|重复|today|repeat/i.test(msg)) return '今日已签到';
  return '签到失败(' + msg + ')';
}

// ===== 抽奖（doLottery）=====
// POST /argus/api/v2/checkin/lottery，SDKSign 组，空 body。
// 服务端按账号剩余抽奖次数自动抽（原脚本循环次数 = HasVideoUrge + 另一计数，body 字段全为空串）。
async function doLottery(cookie, ctx) {
  const ltSign = await getSign(LOTTERY_URL, 'post', {}, ctx);
  const ltHeaders = baseHeaders(cookie, ltSign, true);
  if (ctx.qdh) ltHeaders['qdh'] = ctx.qdh;
  const r = await httpReq('POST', LOTTERY_URL, ltHeaders, '');
  let ok = false, msg = '', j = null;
  try {
    j = JSON.parse(r.body);
    ok = (j && (j.Result === 0 || j.ok === true || j.Success === true));
    msg = (j && (j.Message || j.message)) || ('HTTP ' + r.status);
  } catch (e) { msg = 'HTTP ' + r.status; }
  if (ok) {
    let prize = '';
    if (j && j.Data) {
      const p = j.Data.prizeName || j.Data.PrizeName || j.Data.rewardName || j.Data.RewardName || findValueByKey(j.Data, 'prizename');
      if (p) prize = '（' + p + '）';
    }
    return '抽奖成功' + prize;
  }
  if (/无抽奖|次数|没有|不足|no.*(lottery|draw)|not.*enough/i.test(msg)) return '暂无可抽次数';
  return '抽奖失败(' + msg + ')';
}

// ===== 主流程 =====
(async function () {
  // [键名修正] 从 QDREADER_COOKIE 读取（JSON 格式 {"uid":"cookie串"}），uid 一并取出
  const stored = readStoredCookie();
  const cookie = stored.cookie;
  if (!cookie) {
    $notification.post('起点读书', '未配置 Cookie', '请在持久化存储写入 QDREADER_COOKIE（格式 {"uid":"cookie串"}）');
    console.log('no cookie');
    $done();
    return;
  }
  const cm = parseCookie(cookie);
  // [键名修正] ctx.uid 来自存储 JSON 的 key，签名网关 payload 用到
  const ctx = { uid: stored.uid, qdh: cm['QDH'] || '', guid: cm['ywguid'] || '', qimei: cm['qid'] || '' };
  console.log('cookie loaded uid=' + ctx.uid + ' QDH length=' + ctx.qdh.length);

  const results = [];
  const parts = [];

  // 1) 看广告（含惊喜福利）
  try {
    const adv = await doAdvJobs(cookie, ctx);
    adv.lines.forEach(function (l) { results.push(l); });
    parts.push(adv.count ? ('看广告' + adv.count + '项') : '无看广告待办');
  } catch (e) { results.push('看广告异常: ' + (e && e.message || e)); }

  // 2) 签到
  try { const c = await doCheckin(cookie, ctx); results.push('签到: ' + c); parts.push((c.indexOf('成功') >= 0 || c.indexOf('已签到') >= 0) ? '已签到' : '签到未成'); }
  catch (e) { results.push('签到异常: ' + (e && e.message || e)); }

  // 3) 抽奖
  try { const l = await doLottery(cookie, ctx); results.push('抽奖: ' + l); parts.push(l.indexOf('成功') >= 0 ? '已抽奖' : '抽奖未成'); }
  catch (e) { results.push('抽奖异常: ' + (e && e.message || e)); }

  const title = '起点福利中心 · ' + parts.join(' / ');
  $notification.post('起点读书', title, results.join('\n') || '今日无待办');
  $done();
})();
