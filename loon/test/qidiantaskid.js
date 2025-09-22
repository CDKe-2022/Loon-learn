/* 
脚本功能: 获取 起点读书 任务ID (Loon 专用精简版)
操作步骤: 打开 App → 我 → 福利中心

[rewrite local]
https\:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body [你的脚本路径]

[MITM]
hostname = h5.if.qidian.com
*/

// 解析响应
let obj;
try {
  obj = JSON.parse($response.body);
} catch (e) {
  console.log("❌ 响应解析失败，请确保是 JSON 格式");
  $notification.post("起点读书", "❌ 解析失败", "请检查网络或重试");
  $done();
  return;
}

// 提取任务ID
let taskId1 = null, taskId2 = null;

try {
  // 任务1: 每日视频福利
  taskId1 = obj.Data.DailyBenefitModule?.TaskList?.[0]?.TaskId || null;
  
  // 任务2: 额外看3次小视频得奖励
  const taskList = obj.Data.VideoRewardTab?.TaskList || [];
  for (let i = 0; i < taskList.length; i++) {
    if (taskList[i].Icon === "额外看3次小视频得奖励") {
      taskId2 = taskList[i].TaskId;
      break;
    }
  }
} catch (e) {
  console.log("❌ 任务ID提取失败:", e.message);
  $notification.post("起点读书", "❌ 提取失败", "数据结构可能已变更");
  $done();
  return;
}

// 保存并通知
if (taskId1 && taskId2) {
  $persistentStore.write(taskId1, "qd_taskId");
  $persistentStore.write(taskId2, "qd_taskId_2");
  
  console.log("🎉 任务信息获取成功!");
  console.log(`taskId1: ${taskId1}`);
  console.log(`taskId2: ${taskId2}`);
  
  $notification.post(
    "起点读书", 
    "🎉 任务ID获取成功", 
    `每日福利: ${taskId1.substring(0, 8)}...\n小视频: ${taskId2.substring(0, 8)}...`
  );
} else {
  console.log("🔴 任务信息获取失败!");
  console.log("响应内容:", $response.body);
  
  let errorMsg = "部分任务ID未找到";
  if (!taskId1) errorMsg += "\n• 每日福利任务缺失";
  if (!taskId2) errorMsg += "\n• 小视频任务缺失";
  
  $notification.post("起点读书", "🔴 获取失败", errorMsg);
}

$done();
