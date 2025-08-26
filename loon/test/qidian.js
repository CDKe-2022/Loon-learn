const NAME = "起点读书";

// ========== 读取配置 ==========
const taskId = $persistentStore.read("qd_taskId");       // 任务1 ID
const taskId2 = $persistentStore.read("qd_taskId_2");    // 任务2 ID
const session = $persistentStore.read("qd_session");     // 广告1 请求配置(JSON字符串)
const session2 = $persistentStore.read("qd_session_2");  // 广告2 请求配置(JSON字符串)
const timeout = ($persistentStore.read("qd_timeout") || 0.2) * 1000; // 每次任务间隔(默认20秒)

// 参数检查函数：如果缺少信息则提示
function check(name, val) {
  if (!val) $notification.post(NAME, `⚠️${name}信息不全`, "请通过重写获取信息");
}
check("任务1", taskId);
check("任务2", taskId2);
check("广告1", session);
check("广告2", session2);

// ========== 主任务执行流程 ==========
(async () => {
  // 任务1：执行7次
  for (let i = 0; i < 7; i++) {
    log(`任务1 第${i + 1}次`);
    await run(session);
    await wait(timeout);
  }
  // 任务2：执行2次
  for (let j = 0; j < 2; j++) {
    log(`任务2 第${j + 1}次`);
    await run(session2);
    await wait(timeout);
  }
  log("✅执行完成");
  $done(); // 结束脚本
})();

// ========== 执行单个任务 ==========
function run(s) {
  return new Promise((res) => {
    $httpClient.post(JSON.parse(s), (err, resp, data) => {
      if (!err) {
        try {
          const obj = JSON.parse(data); // 解析返回JSON
          log(obj.Result == 0 ? "🎉成功!" : `🔴失败! ${data}`);
        } catch {
          log("❌返回解析失败");
        }
      } else {
        log(`请求错误: ${err}`);
      }
      res();
    });
  });
}

// ========== 工具函数 ==========
const log = (msg) => console.log(`[${NAME}] ${msg}`);     // 打印日志
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); // 延时