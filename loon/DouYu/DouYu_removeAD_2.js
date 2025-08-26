// 获取请求的URL
const url = $request.url;

try {
    // 尝试解析响应的JSON数据
    let obj = JSON.parse($response.body);

    // 判断当前URL是否需要处理数据，并确保数据对象中存在需要的字段
    if (url.includes("/mgapi/livenc/home/getRecV3") && obj.data) {
        
        // 定义一个函数，用于过滤掉广告内容
        const removeAds = data => data.filter(item => !item.ad);

        // 如果 `rec_cont` 字段存在，过滤掉其中的广告内容
        if (obj.data.rec_cont) {
            obj.data.rec_cont = removeAds(obj.data.rec_cont);
        }
        
        // 如果 `rec_card` 字段存在，遍历 `rec_card` 数组中的每一项
        if (obj.data.rec_card) {
            obj.data.rec_card.forEach(card => {
                // 对于每个 `card_banner` 字段，过滤掉广告内容
                if (card.card_banner) {
                    card.card_banner = removeAds(card.card_banner);
                }
            });
        }
    }

    // 将处理后的数据转换为字符串，并返回给客户端
    $done({ body: JSON.stringify(obj) });

} catch (e) {
    // 处理解析或数据处理过程中的任何错误
    console.error("Error processing response:", e);
    // 如果出现错误，返回未修改的原始响应内容
    $done({ body: $response.body });
}