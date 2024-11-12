const $ = new Env("起点读书");
$.taskId = $.getdata("qd_taskId");
$.taskId_2 = $.getdata("qd_taskId_2");

(async () => {
  try {
    const session = {
      url: $request.url,
      body: $request.body,
      headers: $request.headers,
    };
    $.log(JSON.stringify(session));

    const adType = session.body.includes($.taskId)
      ? "qd_session"
      : session.body.includes($.taskId_2)
      ? "qd_session_2"
      : null;

    if (adType) {
      const success = $.setdata(JSON.stringify(session), adType);
      const adNum = adType === "qd_session" ? "1" : "2";
      const msg = success ? `🎉广告${adNum}信息获取成功!` : `🔴广告${adNum}信息获取失败!`;
      $.log(msg);
      $.msg($.name, msg);
    } else {
      $.log("🔴广告信息获取失败!");
      $.msg($.name, "🔴广告信息获取失败!");
    }
  } catch (e) {
    $.logErr(e);
  } finally {
    $.done();
  }
})();

function Env(t, s) {
  // Env class logic goes here. You can keep this part as-is or make further optimizations if needed.
}