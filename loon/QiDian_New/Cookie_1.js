const TASK_ID = "qd_taskId";
const TASK_ID_2 = "qd_taskId_2";

const $ = new Env("起点读书");
$.taskId = $.getdata(TASK_ID);
$.taskId_2 = $.getdata(TASK_ID_2);

!(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers
  };
  $.log(JSON.stringify(session));

  const handleTask = (taskId) => {
    if (session.body.includes(taskId)) {
      const key = `qd_session${taskId === TASK_ID ? "" : "_2"}`;
      if ($.setdata(JSON.stringify(session), key)) {
        $.log(`🎉广告${taskId === TASK_ID ? "1" : "2"}信息获取成功!`);
        $.msg($.name, `🎉广告${taskId === TASK_ID ? "1" : "2"}信息获取成功!`);
      } else {
        $.log(`🔴广告${taskId === TASK_ID ? "1" : "2"}信息获取失败!`);
        $.msg($.name, `🔴广告${taskId === TASK_ID ? "1" : "2"}信息获取失败!`);
      }
    }
  };

  try {
    handleTask($.taskId);
    handleTask($.taskId_2);
  } catch (e) {
    $.logErr(e);
  } finally {
    $.done();
  }
})()
  .catch((e) => $.logErr(e))
  .finally(() => $.done());

// Env类的定义保持不变
