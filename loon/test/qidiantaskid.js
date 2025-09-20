// 起点读书 - 任务ID获取
// Loon 脚本

let obj = JSON.parse($response.body);

// 提取每日任务 ID
let taskA = obj?.Data?.DailyBenefitModule?.TaskList?.[0]?.TaskId;
let taskB = obj?.Data?.DailyBenefitModule?.TaskList?.[1]?.TaskId;

// 提取“额外看3次小视频得奖励”任务 ID
let taskC;
for (let t of obj?.Data?.VideoRewardTab?.TaskList || []) {
  if (t.Icon === "额外看3次小视频得奖励") {
    taskC = t.TaskId;
    $persistentStore.write(taskC, "qd_taskId_2");
    break;
  }
}

// 保存任务 ID
if (taskA && taskB && taskC) {
  $persistentStore.write(taskA, "qd_taskId");
  console.log(`🎉任务信息获取成功!`);
  console.log(`taskId: ${taskA}`);
  console.log(`taskId_2: ${taskC}`);
  $notification.post("起点读书", "", "🎉任务信息获取成功!");
} else {
  console.log("🔴任务信息获取失败!");
  console.log($response.body);
  $notification.post("起点读书", "", "🔴任务信息获取失败!");
}

$done({});
