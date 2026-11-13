/*
 * 起点读书 · 福利中心 — 主脚本 v2（cron 定时任务，多账号版）
 * ──────────────────────────────────────────────────────────
 * 流程：
 *   1) 读取 QDREADER_COOKIE（多账号 JSON）→ 逐账号执行
 *   2) 每账号：mainPage 拉取任务 → finishWatch 看广告（含惊喜福利）→ 签到 → 抽奖
 *   3) 汇总所有账号结果推送通知
 *
 * 签名机制：每个起点请求先调第三方签名网关 api.120399.xyz/qdreader/sign
 *          拿到签名头(sdksign/qdsign/borgus/tstamp/ibex/cecelia...) 再贴到请求上。
 *
 * Loon 配置：
 *   [Script]
 *   qidian_welfare = cron,30 8 * * *,tag=起点福利中心,script-path=本脚本地址
 *
 * 依赖：持久化存储 QDREADER_COOKIE，值为 JSON：
 *      {"uid1":"cookie串1","uid2":"cookie串2"}
 *
 * ── 迭代记录 ─────────────────────────────────────────────
 * v1  [多账号] readAllAccounts 读取所有账号；主流程遍历执行；账号间随机等待2-4秒。
 *
 * v2  [适配 2026-11 新版 mainPage] 抓包发现三处结构变动，逐条修正：
 *     1) 「加点·广告」更名为「广告·加点！」——脚本按模块 key 匹配，标题改名不影响；
 *        新增 SubTaskId，TaskId 已等于 SubTaskId，另加 /^\d{6,}$/ 数字校验，
 *        防止误用模块级 TaskId（T2026051906 这种原始 ID）。
 *     2) DailyBenefitModule.TaskList 实为「奖励位清单」：9 条共用同一 TaskId，
 *        Total/Process 恒为 0。旧逻辑会把它当 9 个独立任务，日志/通知里出现
 *        「惊喜礼包、10-3点订阅券、10点章节卡…」一堆同名条目；当前只有 1 条未完成
 *        看似没事，一旦多条未完成就会对同一 ID 连发请求。
 *        现改为按 模块+TaskId 聚合：未完成条目数 = 需要看广告的次数。
 *     3) VideoRewardTab 出现 IsFinished=0 但 Process==Total 且 IsReceived=1 的条目
 *        （奖励已领）。完成判定改为 IsFinished / IsReceived / Process>=Total 三选一。
 *     4) mainPage 增加 Result!==0 / 解析失败 的显式分支，Cookie 失效不再静默成"0 项待办"。
 *     5) finishWatch 失败且报错疑似参数类时，用任务自带 TaskType 再试一次（可关）。
 *     6) 通知与日志按聚合后的任务输出，不再出现「惊喜礼包 ×4」这种重复行。
 */

// ===== 配置区 =====
const STORE_COOKIE = 'QDREADER_COOKIE';  // 多账号 JSON {"uid1":"cookie1","uid2":"cookie2"}
const SIGN_GATEWAY = 'https://api.120399.xyz/qdreader/sign';

const MP_URL = 'https://h5.if.qidian.com/argus/api/v2/video/adv/mainPage';
const FW_URL = 'https://magev6.if.qidian.com/argus/api/v1/video/adv/finishWatch';
const WEEK_CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/getcurrentweekcheckininfo';
const CHECKIN_URL = 'https://h5.if.qidian.com/argus/api/v3/checkin/checkin';
const LOTTERY_URL = 'https://h5.if.qidian.com/argus/api/v2/checkin/lottery';

const ABTEST_GZIP = 'H4sIAAAAAAAAA6uuBQBDv6ajAgAAAA==';

const MAX_TIMES = 12;     // 单个任务单次最多执行次数（激励任务按未完成奖励位数跑，最多 9 个，留 3 个余量）
const TYPE_FALLBACK = true; // 参数类报错时用 TaskType 重试一次（关掉可省请求）

// 模块注册表：key 必须与 mainPage Data 下的字段名一致
// reward:true 表示该模块 TaskList 是「奖励位清单」（同 TaskId 多条），执行次数按未完成条目数算
const MODULES = [
  { key: 'DailyBenefitModule',    label: '激励任务',   type: '0', reward: true  },
  { key: 'ReadingPageTaskModule', label: '广告·加点', type: '1', reward: false },
  { key: 'VideoRewardTab',        label: '额外任务',   type: '0', reward: false }
];

// ===== 工具函数 =====
function parseCookie(cookie) {
  const map = {};
  cookie.split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) map[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return map;
}

// [多账号] 读取所有账号，返回 [{uid, cookie}, ...]
function readAllAccounts() {
  const stored = $persistentStore.read(STORE_COOKIE);
  if (!stored) return [];
  const accounts = [];
  try {
    const obj = JSON.parse(String(stored).trim());
    for (const uid in obj) {
      if (obj.hasOwnProperty(uid) && typeof obj[uid] === 'string' && obj[uid].indexOf('=') >= 0) {
        accounts.push({ uid: uid, cookie: obj[uid] });
      }
    }
  } catch (e) { console.log('[存储] QDREADER_COOKIE 解析失败: ' + e); }
  return accounts;
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

// 随机等待 minSec~maxSec 秒，返回实际等待时长
function randomWait(minSec, maxSec) {
  const s = Number((minSec + Math.random() * (maxSec - minSec)).toFixed(1));
  return new Promise(function (r) { setTimeout(function () { r(s); }, s * 1000); });
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
  // 只查顶层确定性字段，不递归扫数组（避免命中历史天数的签到记录）
  const d = (obj && obj.Data) || obj || {};
  return d.TodayHasCheckin === 1 || d.TodayHasCheckin === true
      || d.IsCheckedIn === 1 || d.IsCheckedIn === true
      || d.IsTodayCheckin === 1 || d.IsTodayCheckin === true;
}

// ===== 任务完成判定（v2）=====
// IsFinished=1 / IsReceived=1 / Process>=Total 任一条成立即视为已完成。
// 新版 VideoRewardTab 会出现 IsFinished=0 但 IsReceived=1 的已领奖条目。
function isTaskFinished(t) {
  if (t.IsFinished === 1 || t.IsFinished === true) return true;
  if (t.IsReceived === 1 || t.IsReceived === true) return true;
  const total = Number(t.Total) || 0;
  const process = Number(t.Process) || 0;
  if (total > 0 && process >= total) return true;
  return false;
}

// ===== 从 mainPage 的 Data 里抽取任务（v2 聚合版）=====
// 返回 [{ id, name, label, type, taskType, total, process, times, finished }]
function getTasks(d) {
  const map = {};

  MODULES.forEach(function (m) {
    const mod = d[m.key];
    if (!mod || !Array.isArray(mod.TaskList)) return;

    mod.TaskList.forEach(function (t) {
      if (!t) return;

      // v2：TaskId 优先，SubTaskId 兜底；必须是纯数字，排除 T2026051906 这类模块级原始 ID
      const id = String(t.TaskId || t.SubTaskId || '');
      if (!/^\d{6,}$/.test(id)) {
        console.log('  [跳过] ' + m.label + ' 无有效数字 TaskId（' + id + '）');
        return;
      }

      const done = isTaskFinished(t);
      const total = Number(t.Total) || 0;
      const process = Number(t.Process) || 0;
      const name = t.Title || t.Desc || t.Subtitle || ('任务' + id.slice(-4));
      const key = m.label + '|' + id;

      let task = map[key];
      if (!task) {
        task = map[key] = {
          id: id, label: m.label, type: m.type, reward: !!m.reward,
          taskType: t.TaskType, raw: t.TaskRawId || '',
          total: total, process: process,
          slots: 0, pendingSlots: 0, names: [], detail: []
        };
      }
      task.total = Math.max(task.total, total);
      task.process = Math.max(task.process, process);
      task.slots += 1;
      if (!done) task.pendingSlots += 1;

      // v2.2：不再用 IsReceived 区分「已领取/未领取」——实测它常驻 0，
      //       而 finishWatch 当场返回 RewardList 即已发奖，没有二次领取环节。
      const status = done ? '已完成' : '待完成';
      task.detail.push({ no: task.slots, name: name, status: status });

      if (task.names.indexOf(name) < 0) task.names.push(name);
    });
  });

  const list = [];
  Object.keys(map).forEach(function (k) {
    const t = map[k];
    t.finished = t.pendingSlots === 0;
    // 多条目（奖励位清单）直接报数量，避免「惊喜礼包 等3项」这种糊在一起的名字
    t.name = t.slots > 1 ? (t.slots + ' 个奖励位') : t.names[0];

    if (t.finished) {
      t.times = 0;
    } else {
      // 奖励位清单：一个未完成条目 = 一次广告
      // 普通任务：剩余进度 = 需要执行的次数
      const left = t.reward ? t.pendingSlots : (t.total > 0 ? (t.total - t.process) : 1);
      t.times = Math.min(MAX_TIMES, Math.max(1, left));
    }
    list.push(t);
  });

  return list;
}

// ===== 单次 finishWatch =====
async function finishWatch(cookie, ctx, taskId, type) {
  const data = { h5: '0', taskId: String(taskId), type: String(type) };
  const sign = await getSign(FW_URL, 'post', data, ctx);
  const headers = baseHeaders(cookie, sign, true);
  if (ctx.qdh) headers['qdh'] = ctx.qdh;
  const body = 'h5=0&taskId=' + taskId + '&type=' + type;

  const r = await httpReq('POST', FW_URL, headers, body);
  let j = null, ok = false, msg = 'HTTP ' + r.status;
  try {
    j = JSON.parse(r.body);
    ok = !!(j && j.Result === 0);
    msg = (j && (j.Message || j.message)) || msg;
  } catch (e) {}
  const rewards = (j && j.Data && Array.isArray(j.Data.RewardList)) ? j.Data.RewardList.length : 0;
  return { ok: ok, msg: msg, rewards: rewards, json: j };
}

// ===== 看广告（含惊喜福利）=====
async function doAdvJobs(cookie, ctx) {
  const out = [];
  const mpSign = await getSign(MP_URL, 'get', {}, ctx);
  const mpHeaders = baseHeaders(cookie, mpSign, false);
  const mpRes = await httpReq('GET', MP_URL, mpHeaders, null);

  let obj = null;
  try { obj = JSON.parse(mpRes.body); } catch (e) {}
  if (!obj) {
    console.log('[mainPage] 解析失败 status=' + mpRes.status + ' body=' + String(mpRes.body).slice(0, 120));
    out.push('mainPage 解析失败（HTTP ' + mpRes.status + '）');
    return { lines: out, count: 0, fatal: true };
  }
  if (obj.Result !== 0) {
    console.log('[mainPage] Result=' + obj.Result + ' Message=' + (obj.Message || ''));
    out.push('接口异常（Result=' + obj.Result + ' ' + (obj.Message || '') + '），Cookie 可能已失效');
    return { lines: out, count: 0, fatal: true };
  }

  const d = obj.Data || {};
  const nick = d.NickName || ctx.uid || '-';
  const dbm = d.DailyBenefitModule;
  console.log('mainPage status=' + mpRes.status + ' 账号=' + nick
    + (dbm && dbm.Count !== undefined ? ' | 激励任务进度 ' + (dbm.Process || 0) + '/' + dbm.Count : ''));

  const tasks = getTasks(d);
  const pending = tasks.filter(function (t) { return !t.finished; });
  const done = tasks.filter(function (t) { return t.finished; });

  console.log('任务合计 ' + tasks.length + ' 项 | 待执行 ' + pending.length + ' 项 / 已完成 ' + done.length + ' 项');

  // 多条目模块（激励任务这种奖励位清单）逐条打印，方便对账「一共几个、每个什么状态」
  function printDetail(t, indent) {
    if (!t.detail || t.detail.length < 2) return;
    t.detail.forEach(function (x) {
      const mark = x.status === '待完成' ? '○' : '●';
      console.log(indent + String(x.no).padStart(2) + '. ' + mark + ' ' + x.name + '  ' + x.status);
    });
  }

  if (done.length) {
    console.log('── 已完成任务（跳过）──');
    done.forEach(function (t) {
      const p = t.total > 0 ? '（' + t.process + '/' + t.total + '）' : (t.slots > 1 ? '' : '（1项）');
      console.log('   ✓ [' + t.label + '] ' + t.name + p);
      printDetail(t, '      ');
    });
    out.push('已跳过 ' + done.length + ' 项：' + done.map(function (t) { return t.name; }).join('、'));
  }

  let firstCall = true;
  let totalWaited = 0;

  for (const t of pending) {
    const times = t.times;
    const altType = (t.taskType && String(t.taskType) !== String(t.type)) ? String(t.taskType) : '';
    console.log('── [' + t.label + '] ' + t.name
      + '（共 ' + t.slots + ' 条：待完成 ' + t.pendingSlots + ' / 已完成 ' + (t.slots - t.pendingSlots)
      + '，本次执行 ' + times + ' 次，type=' + t.type + '）');
    printDetail(t, '     ');

    let okCount = 0, rewardCount = 0, lastMsg = '';
    for (let i = 0; i < times; i++) {
      let waitNote = '';
      if (!firstCall) {
        const waited = await randomWait(1, 3);
        totalWaited += waited;
        waitNote = '（等待' + waited + 's）';
      }
      firstCall = false;

      let r = await finishWatch(cookie, ctx, t.id, t.type);

      // v2：参数类报错时用任务自带 TaskType 重试一次
      if (!r.ok && TYPE_FALLBACK && altType && /(参数|type|签名|sign|非法|invalid|illegal)/i.test(r.msg)) {
        console.log('   第' + (i + 1) + '/' + times + '次' + waitNote + ' ↻ type=' + t.type + ' 失败（' + r.msg + '），改用 type=' + altType + ' 重试');
        r = await finishWatch(cookie, ctx, t.id, altType);
      }

      if (r.ok) {
        okCount++;
        if (r.rewards) rewardCount += r.rewards;
        console.log('   第' + (i + 1) + '/' + times + '次' + waitNote + ' ✓ ' + (r.rewards ? '完成（奖励×' + r.rewards + '）' : '进度+1'));
      } else {
        lastMsg = r.msg;
        console.log('   第' + (i + 1) + '/' + times + '次' + waitNote + ' ✗ 失败（' + r.msg + '）');
        break; // 失败即停该任务
      }
    }

    if (t.reward && t.pendingSlots > times) {
      console.log('   ↳ 该模块仍有 ' + (t.pendingSlots - times) + ' 个箱位未解锁，超过单次上限 ' + MAX_TIMES + ' 时下次继续');
    }
    if (okCount === times) {
      out.push('[' + t.label + '] ' + t.name + ' ' + times + '/' + times + ' 完成'
        + (rewardCount ? '（奖励×' + rewardCount + '）' : ''));
    } else {
      out.push('[' + t.label + '] ' + t.name + ' ' + okCount + '/' + times + '（' + lastMsg + '）');
    }
  }

  if (totalWaited > 0) console.log('[随机等待] 广告任务累计等待 ' + totalWaited.toFixed(1) + ' 秒');

  // 惊喜福利
  try {
    const sbResult = await doSurpriseBenefit(cookie, ctx, d);
    if (sbResult) out.push(sbResult);
  } catch (e) { console.log('surprise benefit error: ' + e); }

  return { lines: out, count: pending.length, fatal: false };
}

// ===== 惊喜福利 =====
async function doSurpriseBenefit(cookie, ctx, d) {
  const sb = d && d.SurpriseBenefit;
  if (!sb || !sb.TaskId) {
    console.log('── [惊喜福利] 无任务');
    return null;
  }
  const name = sb.Title || '惊喜福利';

  if (sb.IsFinished === 1) {
    console.log('── [惊喜福利] ' + name + ' ✓ 已完成（跳过）');
    return '[惊喜福利] ' + name + ' 已完成';
  }

  if (Number(sb.IntervalTime) < 0) {
    const mins = Math.round(Math.abs(Number(sb.IntervalTime)) / 60000);
    console.log('── [惊喜福利] ' + name + ' 冷却中（约' + mins + '分钟，依据 IntervalTime）');
    return '[惊喜福利] ' + name + ' 冷却中（约' + mins + '分钟）';
  }

  const waited = await randomWait(1, 3);
  const r = await finishWatch(cookie, ctx, sb.TaskId, '0');
  console.log('── [惊喜福利] ' + name + '（等待' + waited + 's）'
    + (r.ok ? ' ✓ 成功' + (r.rewards ? '（奖励×' + r.rewards + '）' : '') : ' ✗ 失败（' + r.msg + '）'));
  return '[惊喜福利] ' + name + (r.ok ? (' 成功' + (r.rewards ? '（奖励×' + r.rewards + '）' : '')) : ' 失败');
}

// ===== 签到 =====
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

  const waited = await randomWait(1, 3);
  console.log('[签到] 执行（等待' + waited + 's）...');
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

// ===== 抽奖 =====
async function doLottery(cookie, ctx) {
  const waited = await randomWait(1, 3);
  console.log('[抽奖] 执行（等待' + waited + 's）...');
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
  if (/无抽奖|次数|没有|不足|用完|已用|机会|no.*(lottery|draw)|not.*enough/i.test(msg)) { console.log('[抽奖] 暂无次数: ' + msg); return '暂无可抽次数'; }
  console.log('[抽奖] 失败: ' + msg);
  return '抽奖失败(' + msg + ')';
}

// ===== 主流程（多账号版）=====
(async function () {
  const started = Date.now();

  const accounts = readAllAccounts();
  if (!accounts.length) {
    $notification.post('起点读书', '未配置 Cookie', '请在持久化存储写入 QDREADER_COOKIE（格式 {"uid":"cookie串"}）\n或用 Cookie 获取脚本自动捕获');
    console.log('no cookie');
    $done();
    return;
  }
  console.log('共 ' + accounts.length + ' 个账号待执行：' + accounts.map(function (a) { return a.uid; }).join(', '));

  const allResults = [];

  for (let a = 0; a < accounts.length; a++) {
    const acct = accounts[a];
    console.log('\n########## 账号 ' + (a + 1) + '/' + accounts.length + '（uid=' + acct.uid + '）##########');

    const cm = parseCookie(acct.cookie);
    const ctx = { uid: acct.uid, qdh: cm['QDH'] || '', guid: cm['ywguid'] || '', qimei: cm['qid'] || '' };
    console.log('cookie loaded uid=' + ctx.uid + ' QDH length=' + ctx.qdh.length);

    const results = [];
    const parts = [];

    // 1) 看广告（含惊喜福利）
    try {
      const adv = await doAdvJobs(acct.cookie, ctx);
      adv.lines.forEach(function (l) { results.push(l); });
      parts.push(adv.fatal ? '接口异常' : (adv.count ? ('看广告' + adv.count + '项') : '无看广告待办'));
    } catch (e) { results.push('看广告异常: ' + (e && e.message || e)); }

    // 2) 签到
    try {
      const c = await doCheckin(acct.cookie, ctx);
      results.push('签到: ' + c);
      parts.push((c.indexOf('成功') >= 0 || c.indexOf('已签到') >= 0) ? '已签到' : '签到未成');
    } catch (e) { results.push('签到异常: ' + (e && e.message || e)); }

    // 3) 抽奖
    try {
      const l = await doLottery(acct.cookie, ctx);
      results.push('抽奖: ' + l);
      parts.push(l.indexOf('成功') >= 0 ? '已抽奖' : '抽奖未成');
    } catch (e) { results.push('抽奖异常: ' + (e && e.message || e)); }

    allResults.push({ uid: acct.uid, lines: results, parts: parts });

    if (a < accounts.length - 1) {
      const gap = await randomWait(2, 4);
      console.log('[多账号] 切换下一账号前等待 ' + gap + 's');
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('\n===== 全部账号执行结束，总耗时 ' + elapsed + ' 秒 =====');

  const title = '起点福利中心 · ' + accounts.length + '个账号';
  const content = allResults.map(function (r) {
    return '【账号 ' + r.uid + '】' + r.parts.join(' / ') + '\n' + r.lines.join('\n');
  }).join('\n\n');

  $notification.post('起点读书', title, content || '今日无待办');
  $done();
})();
