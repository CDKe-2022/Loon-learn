/* 
脚本功能: 获取 起点读书 任务信息 (仅 Loon)
操作步骤: 我 --> 福利中心

[rewrite local]
https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/mainPage url script-response-body qidian.taskId.js

[MITM]
hostname = h5.if.qidian.com
*/

(() => {
  try {
    const obj = JSON.parse($response.body);

    const a = obj.Data.DailyBenefitModule.TaskList[0]?.TaskId;
    const b = obj.Data.DailyBenefitModule.TaskList[1]?.TaskId;
    let c;

    for (let task of obj.Data.VideoRewardTab.TaskList) {
      if (task.Icon === "额外看3次小视频得奖励") {
        c = task.TaskId;
        $persistentStore.write(c, "qd_taskId_2");
        break;
      }
    }

    if (a && b && c) {
      // 默认取第一个任务 TaskId
      $persistentStore.write(a, "qd_taskId");

      console.log("🎉任务信息获取成功!");
      console.log(`taskId: ${a}`);
      console.log(`taskId_2: ${c}`);

      $notification.post("起点读书", "", "🎉任务信息获取成功!");
    } else {
      console.log("🔴任务信息获取失败!");
      console.log($response.body);
      $notification.post("起点读书", "", "🔴任务信息获取失败!");
    }
  } catch (e) {
    console.log("🔴脚本运行异常: " + e.message);
    $notification.post("起点读书", "", "🔴脚本运行异常!");
  } finally {
    $done({});
  }
})();
