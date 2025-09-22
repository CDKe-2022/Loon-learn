/* 
🥳 脚本功能: 自动观看 起点读书 广告 (Loon 专用精简版)
✅ 任务1: 每日视频福利 (执行7次)
✅ 任务2: 限时彩蛋小视频 (执行2次)
⏱️ 默认间隔: 20秒 (可在 Loon "Persistent Data" 中设置 qd_timeout)

📌 请确保已通过抓包脚本保存以下数据:
   - qd_session     (广告1完整请求)
   - qd_session_2   (广告2完整请求)
   - qd_taskId      (可选，用于校验)
   - qd_taskId_2    (可选，用于校验)

📦 BoxJS 设置地址 (可选):
https://raw.githubusercontent.com/MCdasheng/QuantumultX/main/mcdasheng.boxjs.json

[rewrite local]
https\:\/\/h5\.if\.qidian\.com\/argus\/api\/v1\/video\/adv\/finishWatch url script-request-body [你的抓包脚本]

[MITM]
hostname = h5.if.qidian.com

[task local]
30 10 * * * [脚本路径], tag=起点读书, img-url=https://raw.githubusercontent.com/chxm1023/Script_X/main/icon/qidian.png
*/

// ==================== 配置区 ====================
const TASK1_TIMES = 7;  // 任务1执行次数
const TASK2_TIMES = 2;  // 任务2执行次数

// 从持久化存储读取配置
const taskId = $persistentStore.read("qd_taskId") || "";
const taskId2 = $persistentStore.read("qd_taskId_2") || "";
const sessionStr = $persistentStore.read("qd_session") || "";
const session2Str = $persistentStore.read("qd_session_2") || "";
const timeoutStr = $persistentStore.read("qd_timeout") || "20";
const timeoutMs = parseInt(timeoutStr, 10) * 1000;

// ==================== 校验区 ====================
let hasError = false;

if (!sessionStr) {
  console.log("⚠️  qd_session 未设置，请先运行抓包脚本");
  $notification.post("起点读书", "❌ 错误", "qd_session 未设置");
  hasError = true;
}

if (!session2Str) {
  console.log("⚠️  qd_session_2 未设置，请先运行抓包脚本");
  $notification.post("起点读书", "❌ 错误", "qd_session_2 未设置");
  hasError = true;
}

if (hasError) {
  $done();
  return;
}

// 解析 session 数据
let session, session2;
try {
  session = JSON.parse(sessionStr);
  session2 = JSON.parse(session2Str);
} catch (e) {
  console.log("❌ session 数据格式错误:", e.message);
  $notification.post("起点读书", "❌ 数据错误", "请重新抓包保存");
  $done();
  return;
}

// ==================== 核心函数 ====================
async function task(sessionData, taskName, index) {
  console.log(`\n🚀 正在执行 ${taskName} 第 ${index + 1} 次...`);

  // 构造请求选项
  const options = {
    url: sessionData.url,
    headers: sessionData.headers,
    body: sessionData.body
  };

  return new Promise((resolve) => {
    $httpClient.post(options, (error, response, data) => {
      if (error) {
        console.log(`🔴 ${taskName} 第 ${index + 1} 次失败:`, error);
        $notification.post("起点读书", `🔴 ${taskName} 失败`, error.message || "网络错误");
        resolve(false);
        return;
      }

      try {
        const result = JSON.parse(data);
        if (result.Result === 0) {
          console.log(`🎉 ${taskName} 第 ${index + 1} 次成功!`);
          resolve(true);
        } else {
          console.log(`🔴 ${taskName} 第 ${index + 1} 次失败:`, data);
          $notification.post("起点读书", `🔴 ${taskName} 失败`, `错误码: ${result.Result}`);
          resolve(false);
        }
      } catch (e) {
        console.log(`⚠️  响应解析失败:`, data);
        $notification.post("起点读书", `⚠️  响应异常`, "请查看日志");
        resolve(false);
      }
    });
  });
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 主执行逻辑 ====================
(async () => {
  console.log("🎯 起点读书广告自动观看脚本启动");
  console.log(`⏱️  任务间隔: ${timeoutMs / 1000} 秒`);

  // 执行任务1
  for (let i = 0; i < TASK1_TIMES; i++) {
    await task(session, "【每日视频福利】", i);
    if (i < TASK1_TIMES - 1) await delay(timeoutMs); // 最后一次不延迟
  }

  // 执行任务2
  for (let j = 0; j < TASK2_TIMES; j++) {
    await task(session2, "【限时彩蛋小视频】", j);
    if (j < TASK2_TIMES - 1) await delay(timeoutMs); // 最后一次不延迟
  }

  console.log("\n✅ 所有任务执行完毕!");
  $notification.post("起点读书", "✅ 任务完成", `共执行 ${TASK1_TIMES + TASK2_TIMES} 次`);
  $done();
})().catch((err) => {
  console.log("🚨 脚本异常:", err);
  $notification.post("起点读书", "🚨 脚本崩溃", err.message);
  $done();
});
