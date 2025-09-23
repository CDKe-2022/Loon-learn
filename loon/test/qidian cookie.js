/* 
脚本功能: 获取 起点读书 广告信息
操作步骤: 我 --> 福利中心 --> 手动观看一个广告

[Script]
http-request ^https:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch script-path=qidian.cookie.js, requires-body=true

[MITM]
hostname = h5.if.qidian.com
*/

const taskId = $persistentStore.read("qd_taskId");
const taskId_2 = $persistentStore.read("qd_taskId_2");

!(async () => {
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers,
  };
  console.log(JSON.stringify(session));

  if (session.body.indexOf(taskId) !== -1) {
    if ($persistentStore.write(JSON.stringify(session), "qd_session")) {
      console.log("🎉广告1信息获取成功!");
      $notification.post("起点读书", "", "🎉广告1信息获取成功!");
    } else {
      console.log("🔴广告1信息获取失败!");
      $notification.post("起点读书", "", "🔴广告1信息获取失败!");
    }
  } else if (session.body.indexOf(taskId_2) !== -1) {
    if ($persistentStore.write(JSON.stringify(session), "qd_session_2")) {
      console.log("🎉广告2信息获取成功!");
      $notification.post("起点读书", "", "🎉广告2信息获取成功!");
    } else {
      console.log("🔴广告2信息获取失败!");
      $notification.post("起点读书", "", "🔴广告2信息获取失败!");
    }
  } else {
    console.log("🔴广告信息获取失败!");
    $notification.post("起点读书", "", "🔴广告信息获取失败!");
  }
})().finally(() => {
  $done({});
});
