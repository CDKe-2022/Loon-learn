/* 
起点读书 - 任务ID获取
Loon 脚本 | 2025-09-21 专业优化版
支持最新API结构 | 安全稳定 | 精准匹配
*/

// 环境检测与简化封装
const isLoon = typeof $loon !== "undefined";
const isSurge = typeof $httpClient !== "undefined" && !isLoon;
const isQuantumultX = typeof $task !== "undefined";

// 日志封装 - 避免污染控制台
const log = (msg, isError = false) => {
  const prefix = isError ? "🔴 [ERROR] " : "🟢 [INFO] ";
  console.log(prefix + msg);
};

// 通知封装 - 根据环境适配
const notify = (title, subtitle, message) => {
  if (isLoon) {
    $notification.post(title, subtitle, message);
  } else if (isSurge) {
    $notification.post(title, subtitle, message);
  } else if (isQuantumultX) {
    $notify(title, subtitle, message);
  }
};

// 主处理函数
const main = () => {
  try {
    // 1. 安全解析响应体
    let obj;
    try {
      obj = JSON.parse($response.body);
    } catch (e) {
      log(`响应体解析失败: ${e.message}`, true);
      notify("起点读书", "任务ID获取", "❌ 响应体格式错误");
      return;
    }

    // 2. 智能提取每日任务ID（基于业务特征而非位置）
    const dailyTask = obj?.Data?.DailyBenefitModule?.TaskList?.find(t => 
      t.Desc?.includes("订阅券") || 
      t.Desc?.includes("章节卡") ||
      t.Title?.includes("激励任务")
    );
    const taskA = dailyTask?.TaskId;

    // 3. 增强型小视频任务匹配（多条件容错）
    const videoTask = obj?.Data?.VideoRewardTab?.TaskList?.find(t => 
      // 匹配Icon或Title中的关键词（兼容新旧版本）
      (t.Icon?.includes("额外看3次") || 
       t.Title?.includes("完成3个广告任务")) &&
      // 额外验证：确保是3次任务（Total=3）
      t.Total === 3
    );
    const taskC = videoTask?.TaskId;

    // 4. 专业验证逻辑（只验证必要任务）
    if (taskA && taskC) {
      // 保存到持久化存储
      $persistentStore.write(taskA, "qd_taskId");
      $persistentStore.write(taskC, "qd_taskId_2");
      
      // 详细日志记录
      log("任务ID获取成功!");
      log(`每日任务ID: ${taskA} (Desc: ${dailyTask.Desc})`);
      log(`小视频任务ID: ${taskC} (Title: ${videoTask.Title})`);
      
      // 精准通知
      notify(
        "起点读书", 
        "任务ID更新", 
        `✅ 每日任务 & 小视频任务ID已更新\n${new Date().toLocaleTimeString()}`
      );
    } else {
      // 专业错误诊断
      const diagnosis = [];
      
      if (!taskA) {
        const taskCount = obj?.Data?.DailyBenefitModule?.TaskList?.length || 0;
        diagnosis.push(`• 激励任务模块: ${taskCount} 个任务`);
        diagnosis.push(`• 可能原因: API结构调整或活动结束`);
      }
      
      if (!taskC) {
        const videoTasks = obj?.Data?.VideoRewardTab?.TaskList || [];
        diagnosis.push(`• 小视频任务: ${videoTasks.length} 个`);
        if (videoTasks.length > 0) {
          diagnosis.push(`• 当前任务: ${videoTasks.map(t => t.Title).join(", ")}`);
        }
        diagnosis.push(`• 可能原因: 活动文案变更`);
      }

      // 安全日志（避免敏感信息泄露）
      log("任务ID获取失败!", true);
      log(`诊断详情:\n${diagnosis.join("\n")}`);
      
      // 有指导性的通知
      notify(
        "起点读书", 
        "任务ID获取失败", 
        `❌ 请检查:\n${diagnosis.map(d => d.replace("• ", "")).slice(0, 2).join("\n")}`
      );
    }
  } catch (error) {
    log(`脚本执行异常: ${error.message}\n${error.stack}`, true);
    notify("起点读书", "脚本错误", `🚨 请联系开发者\n${error.message}`);
  }
};

// 执行主逻辑
main();

// Loon要求必须调用$done
if (typeof $done === "function") {
  $done({});
}
