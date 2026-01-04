// 小黑盒Cookie捕获脚本 - 分别获取三个关键参数
const cookieKey = "heybox_cookie_params";
const heyboxId = "91715900"; // 固定的heybox_id
const requiredParams = ["x_xhh_tokenid", "pkey", "hkey"];

if ($request && $request.headers && $request.headers["Cookie"]) {
    const cookieHeader = $request.headers["Cookie"];
    const cookieParams = parseCookieHeader(cookieHeader);
    
    // 检查是否包含所有必需的参数
    const hasAllParams = requiredParams.every(param => cookieParams[param]);
    
    if (hasAllParams) {
        // 按原顺序存储参数（根据在Cookie头中出现的顺序）
        const orderedParams = getOriginalOrder(cookieHeader, requiredParams);
        
        const cookieData = {
            params: orderedParams,
            heybox_id: heyboxId,
            timestamp: Date.now(),
            original_cookie: cookieHeader
        };
        
        const success = $persistentStore.write(JSON.stringify(cookieData), cookieKey);
        
        if (success) {
            const paramSummary = orderedParams.map(p => `${p.name}=${p.value.substring(0,8)}...`).join('; ');
            $notification.post("小黑盒", "Cookie参数捕获成功", `参数: ${paramSummary}\n账户ID: ${heyboxId}`);
            console.log(`小黑盒Cookie参数捕获成功: ${JSON.stringify(orderedParams)}`);
        } else {
            $notification.post("小黑盒", "Cookie捕获失败", "存储失败");
            console.log("小黑盒Cookie存储失败");
        }
    } else {
        // 调试信息：显示缺失的参数
        const missingParams = requiredParams.filter(param => !cookieParams[param]);
        console.log(`Cookie参数不完整，缺失: ${missingParams.join(', ')}`);
        console.log(`当前Cookie: ${cookieHeader}`);
    }
}

$done();

// 解析Cookie头，返回参数对象
function parseCookieHeader(cookieHeader) {
    const params = {};
    const pairs = cookieHeader.split(';').map(pair => pair.trim());
    
    for (const pair of pairs) {
        const [name, value] = pair.split('=');
        if (name && value) {
            params[name.trim()] = value.trim();
        }
    }
    
    return params;
}

// 获取参数在Cookie头中的原始顺序
function getOriginalOrder(cookieHeader, requiredParams) {
    const orderedParams = [];
    const pairs = cookieHeader.split(';').map(pair => pair.trim());
    
    for (const pair of pairs) {
        const [name, value] = pair.split('=');
        if (name && value) {
            const paramName = name.trim();
            if (requiredParams.includes(paramName)) {
                orderedParams.push({
                    name: paramName,
                    value: value.trim()
                });
            }
        }
    }
    
    return orderedParams;
}