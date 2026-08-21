/*
 * 起点读书 · 福利中心 — 主脚本（cron 定时任务）
 * ──────────────────────────────────────────────────────────
 * 本版改动（对齐 Yuheng0101/X 插件规范）：
 *   1) 存储键名改为 QDREADER_COOKIE（插件统一键名）
 *   2) 存储值为 JSON 格式 {"uid":"cookie串"}，先解析再使用
 *   3) Result 判断改为字符串比较（接口返回 "Result":"0"）
 *   4) 支持 Loon 插件 argument 传入的功能开关（7个参数）
 *
 * 流程：
 *   1) mainPage 拿任务 → 逐个未完成任务 finishWatch(看完广告)
 *   2) doCheckin 签到（服务端按账号状态判断是否已签）
 *   3) doLottery 抽奖（服务端按账号剩余抽奖次数决定）
 *   4) 汇总推送结果
 *
 * 签名机制：每个起点请求先调用签名网关 api.120399.xyz/qdreader/sign
 *          拿到签名头(sdksign/qdsign/borgus/tstamp/ibex/cecelia...) 再贴到请求上。
 *
 * Loon 配置：
 *   [Script]
 *   cron "30 8 * * *" script-path=qidian_welfare.js, timeout=300, tag=起点福利中心, enable=true
 *
 * 依赖：持久化存储里要有 QDREADER_COOKIE（格式 {"uid":"cookie串"}）。
 */

// ===== 配置区 =====
const STORE_COOKIE = 'QDREADER_COOKIE';   // ← 已对齐插件键名（大写）
const SIGN_GATEWAY = 'https://api.120399.xyz/qdreader/sign';

// 接口地址（mainPage/签到/抽奖在 h5.if.qidian.com；finishWatch 在 magev6.if.qidian.com）
const MP_URL = 'https://h5.if.qidian.com/argus/api/v2/video/adv/mainPage';
const FW_URL = 'https://magev6.if.qidian.com/argus/api/v1/video/adv/finishWatch';
const WEEK_CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/getcurrentweekcheckininfo';
const CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/checkin';
const LOTTERY_URL = 'https://h5.if.qidian.com/argus/api/v2/checkin/lottery';

// abtest-gzip 为合法 gzip("{}") 占位；若 mainPage 异常可整行删除
const ABTEST_GZIP = 'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==';

// ===== 功能开关（从 Loon 插件 argument 解析）=====
// 插件传入顺序: [DEBUG, ADV_JOB, EXTRA_ADV, LOTTERY, WEEKLY_EXCHANGE, CHAPTER_CARD, MESSAGE_BOX]
// 同时兼容 key=value&key=value 格式；无 argument 时默认执行本脚本已实现的功能
function parseArguments() {
  const conf = { debug: false, advJob: true, lottery: true };
  if (typeof $argument === 'undefined' || !$argument) return conf;

  const arg = String($argument).trim();
  if (arg.indexOf('=') >= 0) {
    // key=value&key=value 格式
    arg.split('&').forEach(function (pair) {
      const i = pair.indexOf('=');
      if (i <= 0) return;
      const k = pair.slice(0, i).trim().toLowerCase();
      const v = pair.slice(i + 1).trim().toLowerCase() === 'true';
      if (k === 'qdreader_debug') conf.debug = v;
      else if (k === 'qdreader_adv_job_enable') conf.advJob = v;
      else if (k === 'qdreader_lottery_enable') conf.lottery = v;
    });
  } else {
    // 逗号分隔的位置参数格式（Loon 插件 argument=[{A},{B},...] 展开后）
    const parts = arg.split(',');
    if (parts.length >= 1) conf.debug = String(parts[0]).trim() === 'true';
    if (parts.length >= 2) conf.advJob = String(parts[1]).trim() === 'true';
    if (parts.length >= 4) conf.lottery = String(parts[3]).trim() === 'true';
  }
  return conf;
}
const CONF = parseArguments();
function dbg(msg) { if (CONF.debug) console.log('[debug] ' + msg); }

// ===== 工具函数 =====
function parseCookie(cookie) {
  const map = {};
  String(cookie).split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) map[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return map;
}

// 读取持久化存储：兼容 {"uid":"cookie串"}（JSON Map，插件/抓取脚本格式）和纯 cookie 串
function readStoredCookie() {
  const stored = $persistentStore.read(STORE_COOKIE);
  if (!stored) return { uid: '', cookie: '' };
  const s = String(stored).trim();
  if (s.charAt(0) === '{') {
    try {
      const obj = JSON.parse(s);
      const uid = Object.keys(obj)[0] || '';
      const cookie = uid ? String(obj[uid]) : '';
      return { uid: uid, cookie: cookie };
    } catch (e) {
      console.log('[cookie] JSON 解析失败，按原样使用: ' + e);
    }
  }
  return { uid: '', cookie: s };
}

function httpReq(method, url, headers, body) {
  return new Promise(function (resolve) {
    const params = { url: url, headers: headers || {}, timeout: 30000 };
    if (method !== 'GET') params.body = body || '';
    const fn = method === 'GET' ? $httpClient.get : $httpClient.post;
    fn.call($httpClient, params, function (e, resp, data) {
      if (e) { console.log('[http] ' + method + ' ' + url + ' error: ' + e); resolve({ status: 0, body: '' }); return; }
      resolve({ status: (resp && resp.status) || 0, body: data || '' });
    });
  });
}

// 调用签名网关，返回签名头对象
function getSign(url, method, dataObj, ctx) {
  return new Promise(function (resolve) {
    const payload = {
      qdh: ctx.qdh, qdheader: '', url: url, method: method,
      data: dataObj || {}, uid: ctx.uid || '', guid: ctx.guid, qimei: ctx.qimei, qimei36: ctx.qimei,
    };
    const params = {
      url: SIGN_GATEWAY,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      timeout: 30000,
    };
    $httpClient.post(params, function (e, resp, data) {
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

// 从 mainPage 响应里抽取未完成的视频任务
function getTasks(mpBody) {
  const tasks = [];
  let obj;
  try { obj = JSON.parse(mpBody); } catch (e) { return tasks; }
  const d = obj.Data || {};
  const sources = [d.ReadingPageTaskModule, d.VideoRewardTab];
  sources.forEach(function (mod) {
    if (!mod || !Array.isArray(mod.TaskList)) return;
    mod.TaskList.forEach(function (t) {
      if (t && t.TaskId && t.IsFinished === 0) {
        tasks.push({ id: String(t.TaskId), raw: t.TaskRawId || '', total: Number(t.Total) || 1, process: Number(t.Process) || 0 });
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

// 在签到周信息里判定「今日是否已签到」
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
      if (kl === 'ischeckedin' && (o[k] === 1 || o[k] === true || o[k] === '1')) { hit = true; return; }
      if (typeof o[k] === 'object') walk(o[k]);
    }
  })(obj);
  return !!hit;
}

// 统一判断接口是否成功（Result 可能为字符串 "0" 或数字 0）
function isOk(j) {
  return !!(j && (String(j.Result) === '0' || j.ok === true || j.Success === true));
}

// ===== 看广告（finishWatch）=====
async function doAdvJobs(cookie, ctx) {
  const out = [];
  const mpSign = await getSign(MP_URL, 'get', {}, ctx);
  const mpHeaders = baseHeaders(cookie, mpSign, false);
  const mpRes = await httpReq('GET', MP_URL, mpHeaders, null);
  dbg('mainPage body(前300): ' + String(mpRes.body).substring(0, 300));
  const tasks = getTasks(mpRes.body);
  console.log('mainPage status=' + mpRes.status + ' tasks=' + tasks.length);

  for (const t of tasks) {
    const times = Math.min(3, Math.max(1, (t.total - t.process)));
    for (let i = 0; i < times; i++) {
      const fwData = { banId: '0', gradientLevel: '1', h5: '0', taskId: t.id, type: '1' };
      const fwSign = await getSign(FW_URL, 'post', fwData, ctx);
      const fwHeaders = baseHeaders(cookie, fwSign, true);
      if (ctx.qdh) fwHeaders['qdh'] = ctx.qdh;
      const fwBody = 'banId=0&gradientLevel=1&h5=0&taskId=' + t.id + '&type=1';
      const r = await httpReq('POST', FW_URL, fwHeaders, fwBody);
      let ok = false, msg = '', j = null;
      try { j = JSON.parse(r.body); ok = isOk(j); msg = (j && j.Message) || ('HTTP ' + r.status); } catch (e) { msg = 'HTTP ' + r.status; }
      const reward = (j && j.Data && j.Data.RewardList && j.Data.RewardList.length) ? '(奖励×' + j.Data.RewardList.length + ')' : '';
      out.push((i + 1) + '/' + times + ' 任务' + t.id + ': ' + (ok ? '成功' + reward : '失败(' + msg + ')'));
      console.log('finishWatch task=' + t.id + ' ' + (ok ? 'OK' : msg));
    }
  }
  return { lines: out, count: tasks.length };
}

// ===== 签到（doCheckin）=====
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

  // 2) 执行签到（空 body）
  const ckSign = await getSign(CHECKIN_URL, 'post', {}, ctx);
  const ckHeaders = baseHeaders(cookie, ckSign, true);
  if (ctx.qdh) ckHeaders['qdh'] = ctx.qdh;
  const r = await httpReq('POST', CHECKIN_URL, ckHeaders, '');
  let ok = false, msg = '';
  try {
    const j = JSON.parse(r.body);
    ok = isOk(j);
    msg = (j && (j.Message || j.message)) || ('HTTP ' + r.status);
  } catch (e) { msg = 'HTTP ' + r.status; }
  if (ok) return '签到成功';
  if (/已签到|已经签到|今日已|重复|today|repeat/i.test(msg)) return '今日已签到';
  return '签到失败(' + msg + ')';
}

// ===== 抽奖（doLottery）=====
async function doLottery(cookie, ctx) {
  const ltSign = await getSign(LOTTERY_URL, 'post', {}, ctx);
  const ltHeaders = baseHeaders(cookie, ltSign, true);
  if (ctx.qdh) ltHeaders['qdh'] = ctx.qdh;
  const r = await httpReq('POST', LOTTERY_URL, ltHeaders, '');
  let ok = false, msg = '', j = null;
  try {
    j = JSON.parse(r.body);
    ok = isOk(j);
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
  const stored = readStoredCookie();
  if (!stored.cookie) {
    $notification.post('起点读书', '未配置 Cookie', '请在持久化存储写入 ' + STORE_COOKIE + '（格式 {"uid":"cookie串"}）');
    console.log('no cookie in ' + STORE_COOKIE);
    $done();
    return;
  }
  const cookie = stored.cookie;
  const cm = parseCookie(cookie);
  const ctx = { uid: stored.uid, qdh: cm['QDH'] || '', guid: cm['ywguid'] || '', qimei: cm['qid'] || '' };
  dbg('uid=' + ctx.uid + ' qdh长度=' + ctx.qdh.length + ' guid=' + ctx.guid);
  dbg('开关: advJob=' + CONF.advJob + ' lottery=' + CONF.lottery + ' debug=' + CONF.debug);

  const results = [];
  const parts = [];

  // 1) 看广告（受 QDREADER_ADV_JOB_ENABLE 开关控制）
  if (CONF.advJob) {
    try {
      const adv = await doAdvJobs(cookie, ctx);
      adv.lines.forEach(function (l) { results.push(l); });
      parts.push(adv.count ? ('看广告' + adv.count + '项') : '无看广告待办');
    } catch (e) { results.push('看广告异常: ' + (e && e.message || e)); }
  }

  // 2) 签到（插件无对应开关，始终执行）
  try {
    const c = await doCheckin(cookie, ctx);
    results.push('签到: ' + c);
    parts.push((c.indexOf('成功') >= 0 || c.indexOf('已签到') >= 0) ? '已签到' : '签到未成');
  } catch (e) { results.push('签到异常: ' + (e && e.message || e)); }

  // 3) 抽奖（受 QDREADER_LOTTERY_ENABLE 开关控制）
  if (CONF.lottery) {
    try {
      const l = await doLottery(cookie, ctx);
      results.push('抽奖: ' + l);
      parts.push(l.indexOf('成功') >= 0 ? '已抽奖' : '抽奖未成');
    } catch (e) { results.push('抽奖异常: ' + (e && e.message || e)); }
  }

  const title = '起点福利中心 · ' + (parts.join(' / ') || '无任务');
  $notification.post('起点读书', title, results.join('\n') || '今日无待办');
  $done();
})();
