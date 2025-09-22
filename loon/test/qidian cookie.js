// == 脚本功能: 获取 起点读书 广告信息 (Loon 专用精简版) ==
// == 操作步骤: 我 --> 福利中心 --> 手动观看一个广告 ==

// [rewrite_local]
// https://h5\.if\.qidian\.com/argus/api/v1/video/adv/finishWatch url script-request-body qidian_ad_save.js

// [mitm]
// hostname = h5.if.qidian.com

// 直接使用 Loon 原生 API，无需 Env 类
!(async () => {
  // 1. 读取当前请求
  const session = {
    url: $request.url,
    body: $request.body,
    headers: $request.headers
  };

  // 2. 提取 taskId
  const taskIdMatch = session.body.match(/taskId=(\d+)/);
  const currentTaskId = taskIdMatch ? taskIdMatch[1] : null;

  console.log(`🎯 当前广告 taskId: ${currentTaskId}`);
  console.log(`📋 Body: ${session.body.substring(0, 150)}...`);

  // 3. 读取用户预设的 taskId (从 Loon 的 "Persistent Data" 或 "BoxJS" 设置)
  const savedTaskId = $persistentStore.read("qd_taskId") || "";
  const savedTaskId2 = $persistentStore.read("qd_taskId_2") || "";

  let saved = false;

  // 4. 匹配并保存
  if (currentTaskId && savedTaskId && currentTaskId === savedTaskId) {
    if ($persistentStore.write(JSON.stringify(session), "qd_session")) {
      console.log("🎉 广告1信息保存成功!");
      $notification.post("起点读书", "🎉 广告1信息保存成功!", `taskId: ${currentTaskId}`);
      saved = true;
    }
  } else if (currentTaskId && savedTaskId2 && currentTaskId === savedTaskId2) {
    if ($persistentStore.write(JSON.stringify(session), "qd_session_2")) {
      console.log("🎉 广告2信息保存成功!");
      $notification.post("起点读书", "🎉 广告2信息保存成功!", `taskId: ${currentTaskId}`);
      saved = true;
    }
  } else {
    // 调试模式：保存到 debug 供手动提取 taskId
    if (currentTaskId) {
      if ($persistentStore.write(JSON.stringify(session), "qd_session_debug")) {
        console.log("⚠️  未匹配已配置 taskId，已保存到 qd_session_debug");
        $notification.post("起点读书", "⚠️  调试模式", `请设置 qd_taskId 为: ${currentTaskId}`);
        saved = true;
      }
    } else {
      console.log("❌ 无法提取 taskId");
    }
  }

  if (!saved) {
    $notification.post("起点读书", "❌ 广告信息未保存", "请检查配置");
  }

  // 5. 打印完整信息供调试
  console.log(`\n📊 完整请求:\n${JSON.stringify(session, null, 2)}`);

  // 6. 结束脚本
  $done();
})()
.catch((e) => {
  console.log("❌ 脚本出错: ", e);
  $notification.post("起点读书", "❌ 脚本执行出错", e.message);
  $done();
});
