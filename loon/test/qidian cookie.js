/* 
起点读书 - 广告信息捕获
Loon 脚本 | 2024-09-21 专业优化版
仅捕获必要参数 | 安全可靠 | 精准诊断
*/

// 环境检测
const isLoon = typeof $loon !== "undefined";
const isSurge = typeof $httpClient !== "undefined" && !isLoon;
const isQuantumultX = typeof $task !== "undefined";

// 工具函数
const log = (msg, type = "info") => {
  const prefix = type === "error" ? "🔴 [ERROR] " : "🟢 [INFO] ";
  console.log(prefix + msg);
};

const notify = (title, subtitle, message) => {
  if (isLoon || isSurge) {
    $notification.post(title, subtitle, message);
  } else if (isQuantumultX) {
    $notify(title, subtitle, message);
  }
};

// 从持久化存储获取任务ID
const getTaskIds = () => {
  const taskId = isLoon || isSurge 
    ? $persistentStore.read("qd_taskId") 
    : $prefs.valueForKey("qd_taskId");
    
  const taskId2 = isLoon || isSurge 
    ? $persistentStore.read("qd_taskId_2") 
    : $prefs.valueForKey("qd_taskId_2");
  
  return { taskId, taskId2 };
};

// 保存精简版会话数据（仅必要参数）
const saveSessionData = (key, body) => {
  try {
    // 仅提取必要参数，避免存储敏感信息
    const params = new URLSearchParams(body);
    const safeData = {
      TaskId: params.get('TaskId'),
      TaskRawId: params.get('TaskRawId'),
      Process: params.get('Process'),
      timestamp: Date.now()
    };
    
    if (isLoon || isSurge) {
      $persistentStore.write(JSON.stringify(safeData), key);
    } else if (isQuantumultX) {
      $prefs.setValueForKey(JSON.stringify(safeData), key);
    }
    return true;
  } catch (e) {
    log(`数据保存失败: ${e.message}`, "error");
    return false;
  }
};

// 主处理函数
const main = () => {
  const { taskId, taskId2 } = getTaskIds();
  
  // 检查任务ID是否存在
  if (!taskId && !taskId2) {
    const errorMsg = "❌ 任务ID未设置!\n请先运行任务ID获取脚本";
    log(errorMsg, "error");
    notify("起点读书", "广告捕获", errorMsg);
    return;
  }
  
  // 安全解析请求体
  let body;
  try {
    body = $request.body || '';
    if (!body) throw new Error("请求体为空");
  } catch (e) {
    log(`请求解析失败: ${e.message}`, "error");
    notify("起点读书", "广告捕获", `❌ 请求解析失败\n${e.message}`);
    return;
  }
  
  // 专业匹配逻辑（增强验证）
  const matchTask = (taskIds, key, taskName) => {
    for (const taskId of taskIds) {
      if (taskId && body.includes(taskId)) {
        log(`检测到${taskName}广告请求`);
        
        if (saveSessionData(key, body)) {
          log(`${taskName}广告信息已保存`);
          notify(
            "起点读书", 
            `${taskName}广告捕获`, 
            `✅ ${taskName}任务ID已记录\n${new Date().toLocaleTimeString()}`
          );
        } else {
          log(`${taskName}广告信息保存失败`, "error");
          notify("起点读书", `${taskName}广告捕获`, "❌ 数据保存失败");
        }
        return true;
      }
    }
    return false;
  };
  
  // 执行匹配
  const matched = matchTask(
    [taskId], 
    "qd_session", 
    "每日任务"
  ) || matchTask(
    [taskId2], 
    "qd_session_2", 
    "小视频"
  );
  
  // 专业诊断
  if (!matched) {
    const diagnosis = [];
    
    if (taskId) diagnosis.push(`• 每日任务ID: ${taskId.substring(0, 8)}...`);
    if (taskId2) diagnosis.push(`• 小视频ID: ${taskId2.substring(0, 8)}...`);
    
    // 分析请求内容
    const params = new URLSearchParams(body);
    const taskIdsInRequest = [
      params.get('TaskId'),
      params.get('taskid'),
      params.get('taskId')
    ].filter(Boolean);
    
    if (taskIdsInRequest.length > 0) {
      diagnosis.push(`• 请求含任务ID: ${taskIdsInRequest[0].substring(0, 8)}...`);
      diagnosis.push(`• 可能原因: 任务ID已过期或变更`);
    } else {
      diagnosis.push(`• 请求无任务ID参数`);
      diagnosis.push(`• 可能原因: API结构调整`);
    }
    
    log("广告信息捕获失败!", "error");
    log(`诊断详情:\n${diagnosis.join("\n")}`);
    
    notify(
      "起点读书", 
      "广告捕获失败", 
      `❌ 未匹配到任务ID\n${diagnosis.map(d => d.replace("• ", "")).slice(0, 2).join("\n")}`
    );
  }
};

// 执行主逻辑
try {
  main();
} catch (error) {
  log(`脚本异常: ${error.message}\n${error.stack}`, "error");
  notify(
    "起点读书", 
    "脚本错误", 
    `🚨 请联系开发者\n${error.message.substring(0, 50)}...`
  );
}

// Loon要求必须调用$done
if (typeof $done === "function") {
  $done({});
}
