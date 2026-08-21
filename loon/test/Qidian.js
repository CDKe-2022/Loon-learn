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
 *
 * ── 迭代记录 ─────────────────────────────────────────────
 * [修正1] finishWatch 请求体按抓包改为 3 参数（h5/taskId/type）
 * [修正2] type 参数按任务来源动态化（激励/多步=0，阅读页=1）
 * [修正3] doSurpriseBenefit 模块（每小时惊喜福利广告任务）
 * [Loon修正] $httpClient 全部用 options 对象形式
 * [日志美化] 按任务名分组输出；随机等待1-3秒；失败即停
 * [本轮修正1] 已完成任务不再静默过滤：日志逐条显示"✓ 已完成（跳过）"，
 *             通知汇总一行"已跳过N项已完成"
 * [本轮修正2] doSurpriseBenefit 已完成/冷却分支补上 console.log（原来静默）
 * [本轮修正3] mainPage 日志同时显示"待执行/已完成"两份数量
 */

// ===== 配置区 =====
const STORE_COOKIE = 'QDREADER_COOKIE';  // 值为 JSON {"uid":"cookie串"}
const SIGN_GATEWAY = 'https://api.120399.xyz/qdreader/sign';

// 接口地址
const MP_URL = 'https://h5.if.qidian.com/argus/api/v2/video/adv/mainPage';
const FW_URL = 'https://magev6.if.qidian.com/argus/api/v1/video/adv/finishWatch';
const WEEK_CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/getcurrentweekcheckininfo';
const CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/checkin';
const LOTTERY_URL = 'https://h5.if.qidian.com/argus/api/v2/checkin/lottery';

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

// [Loon修正] 统一 options 对象形式
function httpReq(method, url, headers, body) {
  return new Promise(function (resolve) {
    const cb = function (e, resp, data) {
      if (e) { console.log('[http] ' + method + ' ' + url + ' error: ' + e); resolve({ status: 0, body: '' }); return; }
      resolve({ status: (resp && resp.status) || 0, body: data || '' });
    };
    const options = { url: url, headers: headers || {} };
    if (method !== 'GET') options.body = body || '';
    if (method === 'GET') $httpClient.get(options, cb);
    else $httpClient.post(options, cb);
  });
}

function getSign(url, method, dataObj, ctx) {
  return new Promise(function (resolve) {
    const payload = {
      qdh: ctx.qdh, qdheader: '', url: url, method: method,
      data: dataObj || {}, uid: ctx.uid || '', guid: ctx.guid, qimei: ctx.qimei, qimei36: ctx.qimei,
    };
    $httpClient.post({
      url: SIGN_GATEWAY,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, function (e, resp, data) {
      if (e) { console.log('[sign] error: ' + e); resolve(null); return; }
      try {
        const j = JSON.parse(data);
        resolve(j && j.data ? j.data : null);
      } catch (ex) { console.log('[sign] parse fail: ' + ex); resolve(null); }
    });
  });
}

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

// 随机等待 minSec~maxSec 秒
function randomWait(minSec, maxSec) {
  const s = Number((minSec + Math.random() * (maxSec - minSec)).toFixed(1));
  return new Promise(function (r) { setTimeout(function () { r(); }, s * 1000); });
}

// ===== 从 mainPage 响应里抽取任务 =====
// [本轮修正1] 不再过滤已完成任务：全部收集，用 finished 字段区分，
//   已完成的在日志中显示"✓ 已完成（跳过）"，不再静默消失
// type 映射（抓包验证）：
//   DailyBenefitModule（激励任务）→ '0'   VideoRewardTab（额外任务）→ '0'
//   ReadingPageTaskModule（加点·广告）→ '1'
function getTasks(mpBody) {
  const tasks = [];
  let obj;
  try { obj = JSON.parse(mpBody); } catch (e) { return tasks; }
  const d = obj.Data || {};
  const modules = [
    { mod: d.DailyBenefitModule,    type: '0', label: '激励任务' },
    { mod: d.ReadingPageTaskModule, type: '1', label: '加点·广告' },
    { mod: d.VideoRewardTab,        type: '0', label: '额外任务' },
  ];
  modules.forEach(function (m) {
    if (!m.mod || !Array.isArray(m.mod.TaskList)) return;
    m.mod.TaskList.forEach(function (t) {
      if (!t || !t.TaskId) return;
      tasks.push({
        id: String(t.TaskId),
        name: t.Title || t.Desc || t.Subtitle || ('任务' + String(t.TaskId).slice(-4)),
        label: m.label,
        raw: t.TaskRawId || '',
        total: Number(t.Total) || 1,
        process: Number(t.Process) || 0,
        type: m.type,
        finished: t.IsFinished === 1,   // [本轮修正1] 保留已完成状态
      });
    });
  });
  return tasks;
}

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

function isAlreadyCheckedIn(obj) {
  let hit;
  (function walk(o) {
    if (hit !== undefined || o === null || typeof o !== 'object') return;
    if (Array.isArray(o)) { o.forEach(walk); return; }
    for (const k in o) {
      if (hit !== undefined) return;
      const kl = k.toLowerCase();
      const isFlag = /ischeckin|checkedin|checkinstatus|todaycheckin|hassignin/i.test(kl) && !/count|info|module|task|list|detail|reward|gift|config|total/i.test(kl);
      if (isFlag && (o[k] === 1 || o[k] === true || o[k] === '1')) { hit = true; return; }
      if (typeof o[k] === 'object') walk(o[k]);
    }
  })(obj);
  return !!hit;
}

// ===== 看广告=====
// 请求体按抓包为 3 参数；旧参数注释保留（fwData 与 fwBody 必须同步改）：
//   const fwData = { banId: '0', gradientLevel: '1', h5: '0', taskId: t.id, type: t.type };
//   const fwBody = 'banId=0&gradientLevel=1&h5=0&taskId=' + t.id + '&type=' + t.type;
async function doAdvJobs(cookie, ctx) {
  const out = [];
  const mpSign = await getSign(MP_URL, 'get', {}, ctx);
  const mpHeaders = baseHeaders(cookie, mpSign, false);
  const mpRes = await httpReq('GET', MP_URL, mpHeaders, null);
  const mpBody = mpRes.body;
  const tasks = getTasks(mpBody);

  // [本轮修正3] 拆分：待执行 / 已完成
  const pending = tasks.filter(function (t) { return !t.finished; });
  const done = tasks.filter(function (t) { return t.finished; });

  let nick = '';
  try { nick = ((JSON.parse(mpBody).Data) || {}).NickName || ''; } catch (e) {}
  console.log('mainPage status=' + mpRes.status + ' 账号=' + (nick || ctx.uid || '-')
    + ' | 待执行 ' + pending.length + ' 项 / 已完成 ' + done.length + ' 项');

  // [本轮修正1] 已完成任务逐条体现（不请求，只报状态）
  if (done.length) {
    console.log('── 已完成任务（跳过）──');
    done.forEach(function (t) {
      console.log('   ✓ [' + t.label + '] ' + t.name + '（' + t.process + '/' + t.total + '）');
    });
    // 通知里汇总一行，避免太长
    out.push('已跳过已完成任务 ' + done.length + ' 项：' + done.map(function (t) { return t.name; }).join('、'));
  }

  let firstCall = true; // 全局第一次请求前不等待

  for (const t of pending) {
    const times = Math.min(3, Math.max(1, (t.total - t.process)));
    console.log('── [' + t.label + '] ' + t.name + '（进度 ' + t.process + '/' + t.total + '，本次执行 ' + times + ' 次）');

    let okCount = 0, rewardCount = 0, lastMsg = '';
    for (let i = 0; i < times; i++) {
      if (!firstCall) await randomWait(1, 3);
      firstCall = false;

      const fwData = { h5: '0', taskId: t.id, type: (t.type || '0') };
      const fwSign = await getSign(FW_URL, 'post', fwData, ctx);
      const fwHeaders = baseHeaders(cookie, fwSign, true);
      if (ctx.qdh) fwHeaders['qdh'] = ctx.qdh;
      const fwBody = 'h5=0&taskId=' + t.id + '&type=' + (t.type || '0');

      const r = await httpReq('POST', FW_URL, fwHeaders, fwBody);
      let ok = false, msg = '', j = null;
      try { j = JSON.parse(r.body); ok = j && j.Result === 0; msg = (j && j.Message) || ('HTTP ' + r.status); } catch (e) { msg = 'HTTP ' + r.status; }
      const hasReward = !!(j && j.Data && j.Data.RewardList && j.Data.RewardList.length);

      if (ok) {
        okCount++;
        if (hasReward) rewardCount += j.Data.RewardList.length;
        console.log('   第' + (i + 1) + '/' + times + '次 ✓ ' + (hasReward ? '完成（奖励×' + j.Data.RewardList.length + '）' : '进度+1'));
      } else {
        lastMsg = msg;
        console.log('   第' + (i + 1) + '/' + times + '次 ✗ 失败（' + msg + '）');
        break; // 失败即停该任务
      }
    }

    if (okCount === times) {
      out.push('[' + t.label + '] ' + t.name + ' ' + times + '/' + times + ' 完成' + (rewardCount ? '（奖励×' + rewardCount + '）' : ''));
    } else {
      out.push('[' + t.label + '] ' + t.name + ' ' + okCount + '/' + times + '（' + lastMsg + '）');
    }
  }

  // 惊喜福利（复用同一个 mpBody）
  try {
    const sbResult = await doSurpriseBenefit(cookie, ctx, mpBody);
    if (sbResult) out.push(sbResult);
  } catch (e) { console.log('surprise benefit error: ' + e); }

  return { lines: out, count: pending.length };
}

// ===== 惊喜福利=====
// [本轮修正2] 已完成/冷却中分支补上 console.log（原来静默返回，日志完全看不到）
async function doSurpriseBenefit(cookie, ctx, mpBody) {
  let obj;
  try { obj = JSON.parse(mpBody); } catch (e) { return null; }
  const sb = obj.Data && obj.Data.SurpriseBenefit;
  if (!sb || !sb.TaskId) {
    console.log('── [惊喜福利] 无任务');
    return null;
  }
  const name = sb.Title || '惊喜福利';

  // 已完成
  if (sb.IsFinished === 1) {
    console.log('── [惊喜福利] ' + name + ' ✓ 已完成（跳过）');
    return '[惊喜福利] ' + name + ' 已完成';
  }

  // 冷却中
  if (Number(sb.IntervalTime) < 0) {
    const mins = Math.round(Math.abs(Number(sb.IntervalTime)) / 60000);
    console.log('── [惊喜福利] ' + name + ' 冷却中（约' + mins + '分钟）');
    return '[惊喜福利] ' + name + ' 冷却中（约' + mins + '分钟）';
  }

  // 执行（type=0）
  await randomWait(1, 3);
  const fwData = { h5: '0', taskId: String(sb.TaskId), type: '0' };
  const fwSign = await getSign(FW_URL, 'post', fwData, ctx);
  const fwHeaders = baseHeaders(cookie, fwSign, true);
  if (ctx.qdh) fwHeaders['qdh'] = ctx.qdh;
  const fwBody = 'h5=0&taskId=' + sb.TaskId + '&type=0';

  const r = await httpReq('POST', FW_URL, fwHeaders, fwBody);
  let ok = false, j = null;
  try { j = JSON.parse(r.body); ok = j && j.Result === 0; } catch (e) {}
  const hasReward = !!(j && j.Data && j.Data.RewardList && j.Data.RewardList.length);
  console.log('── [惊喜福利] ' + name + ' ' + (ok ? '✓ 成功' + (hasReward ? '（奖励×' + j.Data.RewardList.length + '）' : '') : '✗ 失败'));
  return '[惊喜福利] ' + name + (ok ? (' 成功' + (hasReward ? '（奖励×' + j.Data.RewardList.length + '）' : '')) : ' 失败');
}

// ===== 签到=====
async function doCheckin(cookie, ctx) {
  const wcSign = await getSign(WEEK_CHECKIN_URL, 'get', {}, ctx);
  const wcHeaders = baseHeaders(cookie, wcSign, false);
  const wcRes = await httpReq('GET', WEEK_CHECKIN_URL, wcHeaders, null);
  let already = false;
  try {
    const obj = JSON.parse(wcRes.body);
    already = isAlreadyCheckedIn(obj);
  } catch (e) { /* 解析失败则继续尝试签到 */ }
  if (already) { console.log('[签到] 今日已签到，跳过'); return '今日已签到'; }

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
  if (ok) { console.log('[签到] 成功'); return '签到成功'; }
  if (/已签到|已经签到|今日已|重复|today|repeat/i.test(msg)) { console.log('[签到] 服务端确认已签到: ' + msg); return '今日已签到'; }
  console.log('[签到] 失败: ' + msg);
  return '签到失败(' + msg + ')';
}

// ===== 抽奖=====
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
    console.log('[抽奖] 成功' + prize);
    return '抽奖成功' + prize;
  }
  if (/无抽奖|次数|没有|不足|no.*(lottery|draw)|not.*enough/i.test(msg)) { console.log('[抽奖] 暂无次数: ' + msg); return '暂无可抽次数'; }
  console.log('[抽奖] 失败: ' + msg);
  return '抽奖失败(' + msg + ')';
}

// ===== 主流程 =====
(async function () {
  const stored = readStoredCookie();
  const cookie = stored.cookie;
  if (!cookie) {
    $notification.post('起点读书', '未配置 Cookie', '请在持久化存储写入 QDREADER_COOKIE（格式 {"uid":"cookie串"}）');
    console.log('no cookie');
    $done();
    return;
  }
  const cm = parseCookie(cookie);
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
