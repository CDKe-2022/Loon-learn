/*
🥳 脚本功能: 自动观看 起点读书 广告 (仅支持 Loon)
任务1: 福利中心 --> 每日视频福利 --> 手动看一个视频
任务2: 福利中心 --> 限时彩蛋 --> 额外看三次小视频奖励 --> 手动看一个视频
默认执行次数: 8 次
默认间隔时间: 20s (可通过 qd_timeout 修改)
*/

const taskId     = $persistentStore.read("qd_taskId");
const taskId2    = $persistentStore.read("qd_taskId_2");
const session    = $persistentStore.read("qd_session");
const session2   = $persistentStore.read("qd_session_2");
const timeout    = $persistentStore.read("qd_timeout") ? Number($persistentStore.read("qd_timeout")) : 20;

// 检查必要数据
function checkData() {
  if (!taskId)   notify("⚠️任务1信息不全! 请通过重写获取信息");
  if (!taskId2)  notify("⚠️任务2信息不全! 请通过重写获取信息");
  if (!session)  notify("⚠️广告1信息不全! 请通过重写获取信息");
  if (!session2) notify("⚠️广告2信息不全! 请通过重写获取信息");
}

function notify(msg) {
  console.log(msg);
  $notification.post("起点读书", "", msg);
}

(async () => {
  checkData();

  // 任务1 执行 8 次
  for (let i = 0; i < 8; i++) {
    console.log(`🟡任务1执行: 第 ${i + 1} 次`);
    await runTask(session);
    await wait(timeout * 1000);
  }

  // 任务2 执行 2 次
  for (let j = 0; j < 2; j++) {
    console.log(`🟡任务2执行: 第 ${j + 1} 次`);
    await runTask(session2);
    await wait(timeout * 1000);
  }

  console.log("✅ 脚本执行完成");
  $done();
})();

// 核心任务函数
async function runTask(sessionStr) {
  if (!sessionStr) return;
  const options = JSON.parse(sessionStr);

  return new Promise((resolve) => {
    $httpClient.post(options, (error, resp, data) => {
      if (error) {
        console.log("🔴请求失败: " + error);
        return resolve();
      }
      try {
        const obj = JSON.parse(data);
        if (obj.Result === 0) {
          console.log("🎉成功!");
        } else {
          console.log("🔴失败: " + data);
        }
      } catch (e) {
        console.log("🔴解析错误: " + e);
      }
      resolve();
    });
  });
}

// 延时函数
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
