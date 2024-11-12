const $ = new Env("起点读书");

try {
  const obj = JSON.parse($response.body);
  const taskList = obj.Data.VideoBenefitModule.TaskList;
  const countdownTasks = obj.Data.CountdownBenefitModule.TaskList;

  const a = taskList[0]?.TaskId;
  const b = taskList[1]?.TaskId;
  let c = null;

  // Locate TaskId for the specific task title
  for (const task of countdownTasks) {
    if (task.Title === "额外看3次小视频得奖励") {
      c = task.TaskId;
      $.setdata(c, "qd_taskId_2");
      break;
    }
  }

  if (a && b && c) {
    $.setdata(a, "qd_taskId");
    $.log(`🎉任务信息获取成功!`);
    $.log(`taskId: ${a}`);
    $.log(`taskId_2: ${c}`);
    $.msg($.name, `🎉任务信息获取成功!`);
  } else {
    $.log("🔴任务信息获取失败!");
    $.log($response.body);
    $.msg($.name, "🔴任务信息获取失败!");
  }
} catch (e) {
  $.logErr(e);
  $.msg($.name, "🔴解析或任务信息获取失败!");
} finally {
  $.done();
}

function Env(t, s) {
  // Existing Env class logic remains unchanged
}