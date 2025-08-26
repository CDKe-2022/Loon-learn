// 获取请求的 URL
const url = $request.url;

try {
  // 尝试解析响应 JSON
  let obj = JSON.parse($response.body);

  // 针对指定接口进行处理
  if (url.includes("/mgapi/livenc/home/getRecV3") && obj.data) {
    
    // 过滤 rec_cont 内的广告
    if (obj.data.rec_cont) {
      obj.data.rec_cont = obj.data.rec_cont.filter(item => !item.ad);
    }

    // 遍历 rec_card，每个 card 内的 card_banner 也做过滤
    if (obj.data.rec_card) {
      obj.data.rec_card = obj.data.rec_card.map(card => ({
        ...card,
        card_banner: card.card_banner
          ? card.card_banner.filter(item => !item.ad)
          : card.card_banner
      }));
    }
  }

  // 返回处理后的数据
  $done({ body: JSON.stringify(obj) });

} catch (e) {
  // 出错时回退原始响应，避免接口报错
  $done({ body: $response.body });
}