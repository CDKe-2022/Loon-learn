const $ = new Env("起点读书");

const obj = JSON.parse($response.body);
const taskIdList = [
  { name: "taskId", index: 0 },
  { name: "taskId_2", index: 1 },
];

const findTaskId = (title) => {
  const task = obj.Data.CountdownBenefitModule.TaskList.find(
    (task) => task.Title === title
  );
  return task ? task.TaskId : null;
};

const taskId_2 = findTaskId("额外看3次小视频得奖励");
$.setdata(taskId_2, "qd_taskId_2");

const tasks = taskIdList.map((taskInfo) => ({
  name: taskInfo.name,
  taskId: obj.Data.VideoBenefitModule.TaskList[taskInfo.index].TaskId,
}));

const hasAllTasks = tasks.every((task) => task.taskId);

if (hasAllTasks && taskId_2) {
  tasks.forEach((task) => $.setdata(task.taskId, task.name));
  $.log(`🎉任务信息获取成功!`);
  tasks.forEach((task) => $.log(`${task.name}: ${task.taskId}`));
  $.msg($.name, `🎉任务信息获取成功!`);
  $.done();
} else {
  $.log("🔴任务信息获取失败!");
  $.log($response.body);
  $.msg($.name, "🔴任务信息获取失败!");
  $.done();
}
