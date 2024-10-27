const url = $request.url;

try {
    let obj = JSON.parse($response.body);

    if (url.includes("/mgapi/livenc/home/getRecV3") && obj.data) {
        const removeAds = data => data.filter(item => !item.ad);

        if (obj.data.rec_cont) {
            obj.data.rec_cont = removeAds(obj.data.rec_cont);
        }
        
        if (obj.data.rec_card) {
            obj.data.rec_card.forEach(card => {
                if (card.card_banner) {
                    card.card_banner = removeAds(card.card_banner);
                }
            });
        }
    }

    $done({ body: JSON.stringify(obj) });

} catch (e) {
    console.error("Error processing response:", e);
    $done({ body: $response.body });
}