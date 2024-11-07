# 首先检查根对象是否包含 `data` 字段
if .data? then

    # 如果 `data` 对象包含 `rec_cont` 字段，则过滤其中的广告内容
    if .data.rec_cont? then
        # 通过 `map` 函数遍历 `rec_cont` 数组中的每个元素
        # `select(.ad | not)` 选择没有 `ad` 字段的项，过滤掉含有广告的项
        .data.rec_cont |= map(select(.ad | not))
    end;

    # 如果 `data` 对象包含 `rec_card` 字段，则继续处理每个 `rec_card` 项
    if .data.rec_card? then
        # 使用 `map` 遍历 `rec_card` 数组中的每个元素
        .data.rec_card |= map(
            # 针对每个 `rec_card` 项，检查是否包含 `card_banner` 字段
            if .card_banner? then
                # 对 `card_banner` 数组应用相同的广告过滤逻辑
                .card_banner |= map(select(.ad | not))
            else
                # 如果没有 `card_banner` 字段，则保持原样
                .
            end
        )
    end

else
    # 如果根对象没有 `data` 字段，则不进行任何修改
    .
end