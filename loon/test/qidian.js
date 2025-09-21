/* 
起点读书 - 自动观看广告（固定执行版）
Loon 脚本 | 2024-09-21
固定执行7次和2次 | 间隔时间可调
*/

// 环境检测
const isLoon = typeof $loon !== "undefined";
const isSurge = typeof $httpClient !== "undefined" && !isLoon;
const isQuantumultX = typeof $task !== "undefined";

// 工具函数
const log = (msg, isError = false) => {
  const prefix = isError ? "🔴 [ERROR] " : "🟢 [INFO] ";
  console.log(prefix + msg);
};

const notify = (title, subtitle, message) => {
  if (isLoon || isSurge) {
    $notification.post(title, subtitle, message);
  } else if (isQuantumultX) {
    $notify(title, subtitle, message);
  }
};

const getStorage = (key) => {
  if (isLoon || isSurge) return $persistentStore.read(key);
  if (isQuantumultX) return $prefs.valueForKey(key);
  return null;
};

const httpRequest = (options) => {
  return new Promise((resolve, reject) => {
    if (isLoon || isSurge) {
      $httpClient.post(options, (error, response, data) => {
        if (error) reject(error);
        else resolve({ body: data, status: response.status });
      });
    } else if (isQuantumultX) {
      $task.fetch(options).then(
        (response) => resolve({ body: response.body, status: response.status }),
        (error) => reject(error)
      );
    } else {
      reject(new Error("不支持的环境"));
    }
  });
};

// 任务配置 - 固定执行7次和2次
const TASK_CONFIG = [
  {
    idKey: "qd_taskId",
    sessionKey: "qd_session",
    name: "每日任务",
    maxExecutions: 7,  // 固定执行7次
    successCount: 0,
    failCount: 0
  },
  {
    idKey: "qd_taskId_2",
    sessionKey: "qd_session_2",
    name: "小视频任务",
    maxExecutions: 2,  // 固定执行2次
    successCount: 0,
    failCount: 0
  }
];

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 验证任务配置
const validateTasks = () => {
  const invalidTasks = [];
  
  for (const task of TASK_CONFIG) {
    const taskId = getStorage(task.idKey);
    const sessionData = getStorage(task.sessionKey);
    
    if (!taskId) {
      invalidTasks.push(`${task.name} - 任务ID缺失`);
    }
    
    let session = null;
    try {
      if (sessionData) session = JSON.parse(sessionData);
    } catch (e) {
      log(`会话数据解析失败 (${task.name}): ${e.message}`, true);
    }
    
    if (!session) {
      invalidTasks.push(`${task.name} - 会话数据无效`);
    }
    
    task.taskId = taskId;
    task.session = session;
  }
  
  return invalidTasks;
};

// 解析响应
const parseResponse = (response) => {
  try {
    const obj = typeof response === 'string' ? JSON.parse(response) : response;
    if (obj.Result === 0) {
      return { 
        success: true, 
        message: obj.Message || "任务完成" 
      };
    }
    return { 
      success: false, 
      message: obj.Message || `错误码: ${obj.Result}` 
    };
  } catch (e) {
    return { 
      success: false, 
      message: "响应解析失败" 
    };
  }
};

// 执行单个任务
const executeTask = async (task, index) => {
  try {
    log(`🟡 ${task.name} 执行 #${index + 1}/${task.maxExecutions}`);
    
    // 准备请求
    const options = {
      url: task.session.url,
      headers: task.session.headers,
      body: task.session.body,
      method: 'POST'
    };
    
    // 发送请求
    const response = await httpRequest(options);
    const result = parseResponse(response.body);
    
    if (result.success) {
      task.successCount++;
      log(`✅ ${task.name} 执行成功: ${result.message}`);
    } else {
      task.failCount++;
      log(`❌ ${task.name} 执行失败: ${result.message}`, true);
    }
    
    return result;
  } catch (error) {
    task.failCount++;
    log(`⚠️ ${task.name} 执行异常: ${error.message}`, true);
    return { success: false, message: `执行异常: ${error.message}` };
  }
};

// 生成执行报告
const generateReport = () => {
  let report = "📊 任务执行报告\n\n";
  
  for (const task of TASK_CONFIG) {
    report += `📌 ${task.name}\n`;
    report += `✓ 成功: ${task.successCount}/${task.maxExecutions}\n`;
    report += `✗ 失败: ${task.failCount}\n\n`;
  }
  
  const totalSuccess = TASK_CONFIG.reduce((sum, t) => sum + t.successCount, 0);
  const totalAttempts = TASK_CONFIG.reduce((sum, t, i) => sum + t.maxExecutions, 0);
  const successRate = totalSuccess / totalAttempts * 100;
  
  report += `✅ 总成功率: ${totalSuccess}/${totalAttempts} (${successRate.toFixed(1)}%)`;
  
  // 发送通知（截断长消息）
  const notificationMsg = report.split('\n')[0] + '\n' + 
                         report.split('\n')[2] + '\n' +
                         report.split('\n')[5];
  
  log("\n" + report);
  notify("起点读书", "广告任务完成", notificationMsg);
};

// 主执行函数
const main = async () => {
  // 1. 验证任务配置
  const invalidTasks = validateTasks();
  if (invalidTasks.length > 0) {
    const errorMsg = `❌ 任务配置不完整!\n${invalidTasks.join('\n')}`;
    log(errorMsg, true);
    
    notify(
      "起点读书", 
      "配置错误", 
      `请先完成以下步骤:\n${invalidTasks.map(t => t.replace(" - ", ": ")).join("\n")}`
    );
    return;
  }
  
  // 2. 获取执行参数 - 间隔时间配置在这里
  const timeout = parseInt(getStorage("qd_timeout") || "20", 10);
  log(`⏱️ 任务间隔: ${timeout}秒`);
  
  // 3. 执行任务 - 固定执行指定次数
  for (const task of TASK_CONFIG) {
    for (let i = 0; i < task.maxExecutions; i++) {
      await executeTask(task, i);
      
      // 如果是最后一次执行，不等待
      if (i < task.maxExecutions - 1) {
        await delay(timeout * 1000);
      }
    }
  }
  
  // 4. 生成执行报告
  generateReport();
};

// 执行主逻辑
try {
  log("起点读书广告任务开始执行");
  main()
    .catch(error => {
      log(`脚本执行异常: ${error.message}\n${error.stack}`, true);
      notify(
        "起点读书", 
        "脚本错误", 
        `🚨 请联系开发者\n${error.message.substring(0, 50)}...`
      );
    })
    .finally(() => {
      if (typeof $done === "function") {
        $done({});
      }
    });
} catch (error) {
  log(`初始化异常: ${error.message}`, true);
  if (typeof $done === "function") {
    $done({});
  }
}
