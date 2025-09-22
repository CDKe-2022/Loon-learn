/*
脚本功能: Loon 专用 - 获取起点读书广告请求信息
操作步骤: 我 --> 福利中心 --> 手动观看广告
支持多账号，新数据自动覆盖旧数据

[rewrite_local]
^https?:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch$ url script-request-body qidian_ad_session.js

[mitm]
hostname = h5.if.qidian.com
*/

// ==================== 主逻辑 ====================

// 1. 构建完整的 session 对象
const session = {
  url: $request.url,
  body: $request.body,
  headers: $request.headers
};

// 2. 从 body 中提取 taskId
const taskIdMatch = session.body.match(/taskId=(\d+)/);
const currentTaskId = taskIdMatch ? taskIdMatch[1] : null;

if (!currentTaskId) {
  $notification.post("起点读书", "❌ 未提取到 taskId", "请检查请求");
  $done();
}

// 3. 读取用户预设的两个广告位 taskId
const savedTaskId1 = $persistentStore.read("qd_taskId") || "";
const savedTaskId2 = $persistentStore.read("qd_taskId_2") || "";

let saveKey = null;
let adName = "";

// 4. 判断当前广告属于哪个预设位置，并设置保存的键名
if (currentTaskId === savedTaskId1) {
  saveKey = "qd_session";
  adName = "广告位1";
} else if (currentTaskId === savedTaskId2) {
  saveKey = "qd_session_2";
  adName = "广告位2";
} else {
  // 5. 【智能兜底】如果未预设或不匹配，自动保存到 qd_session 作为默认广告
  saveKey = "qd_session";
  adName = "默认广告（已覆盖）";
  // 可选：同时更新 qd_taskId，方便下次自动匹配
  $persistentStore.write(currentTaskId, "qd_taskId");
}

// 6. 保存 session 数据（自动覆盖旧值）
$persistentStore.write(JSON.stringify(session), saveKey);

// 7. 发送通知 + 打印日志
const successMsg = `🎉 ${adName} 信息已保存！\nTaskId: ${currentTaskId}`;
$notification.post("起点读书", "✅ 会话捕获成功", successMsg);
console.log("【起点读书】" + successMsg);
console.log("完整数据:", JSON.stringify(session, null, 2));

$done();