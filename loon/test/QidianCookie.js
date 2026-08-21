/*
 * 起点读书 · Cookie 获取脚本（多账号版，http-request）
 * ──────────────────────────────────────────────────────────
 * 功能：
 *   拦截起点 App 福利中心请求，捕获 Cookie 存入 QDREADER_COOKIE
 *   多账号：按 uid（ywguid）自动区分，新账号自动新增，老账号自动更新
 *   去重：同一 uid 且 Cookie 内容相同 → 静默跳过（解决进福利页触发两次的问题）
 *
 * Loon 配置：
 *   [MITM]
 *   hostname = h5.if.qidian.com
 *
 *   [Script]
 *   http-request 起点读书获取Cookie script-path=本脚本地址,tag=起点获取Cookie
 *   匹配 URL：https://h5.if.qidian.com/argus/api/v1/user/getlogininfo
 *   （若你现有脚本的匹配 URL 不同，把 Loon 里的 pattern 换成本脚本即可）
 *
 * 存储格式（QDREADER_COOKIE）：
 *   {"uid1":"cookie串1","uid2":"cookie串2",...}
 *   与主脚本的多账号格式完全一致。
 */

const STORE_KEY = 'QDREADER_COOKIE';

// ===== 主逻辑 =====
(function () {
  // 1) 从请求头提取 Cookie
  const reqHeaders = $request.headers || {};
  const cookie = reqHeaders['Cookie'] || reqHeaders['cookie'] || '';
  if (!cookie) {
    console.log('[Cookie获取] 请求头无 Cookie，跳过');
    $done({});
    return;
  }

  // 2) 解析出 uid（Cookie 里的 ywguid 字段）
  let uid = '';
  cookie.split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) {
      const k = p.slice(0, i).trim();
      if (k === 'ywguid') uid = p.slice(i + 1).trim();
    }
  });
  if (!uid) {
    console.log('[Cookie获取] Cookie 中无 ywguid，跳过');
    $done({});
    return;
  }

  // 3) 读取现有存储（多账号 JSON）
  let accounts = {};
  const stored = $persistentStore.read(STORE_KEY);
  if (stored) {
    try {
      const obj = JSON.parse(String(stored).trim());
      // 校验格式：值必须是含 = 的字符串（即 Cookie 串）
      let valid = false;
      for (const k in obj) {
        if (obj.hasOwnProperty(k) && typeof obj[k] === 'string' && obj[k].indexOf('=') >= 0) { valid = true; break; }
      }
      if (valid) accounts = obj;
    } catch (e) { /* 存储损坏，从头开始 */ }
  }

  // 4) [去重] 已存在该 uid 且 Cookie 完全相同 → 静默跳过（不写入、不通知）
  if (accounts[uid] === cookie) {
    console.log('[Cookie获取] 账号 ' + uid + ' Cookie 无变化，跳过写入（去重生效）');
    $done({});
    return;
  }

  // 5) 新增或更新
  const isNew = !accounts[uid];
  accounts[uid] = cookie;
  const ok = $persistentStore.write(JSON.stringify(accounts), STORE_KEY);
  if (ok) {
    const action = isNew ? '新增账号' : '更新 Cookie';
    $notification.post('起点读书', '获取 Cookie 成功（' + action + '）', 'uid: ' + uid + '\n当前共 ' + Object.keys(accounts).length + ' 个账号');
    console.log('[Cookie获取] 存储成功，账号 ' + uid + ' ' + action + '，共 ' + Object.keys(accounts).length + ' 个账号');
  } else {
    $notification.post('起点读书', '获取 Cookie 失败', '写入存储失败，请重试');
    console.log('[Cookie获取] 存储失败');
  }

  $done({});
})();
