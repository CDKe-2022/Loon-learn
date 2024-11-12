# 获取请求的URL
def url: $request.url;

# 定义一个函数，用于过滤掉广告内容
def removeAds: map(select(.ad | not));

# 尝试解析响应的JSON数据并进行处理
if url | contains("/mgapi/livenc/home/getRecV3") then
    .data |= (
        .rec_cont |= removeAds // .
        |
        .rec_card |= map(.card_banner |= removeAds // .)
    )
end;

# 将处理后的数据转换为字符串，并返回给客户端
$done({ body: (. | tojson) });