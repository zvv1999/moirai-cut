# 显式重点词事件的缺失诊断

2026-10-08。修复 `rhythm.rs` 中 `content_missing_keyword` 的误报：Sample 可以让 `semantic.keyword=null`，通过带 `semanticIndex` 和 `text` 的显式 `keyword` 事件生成重点文字。旧诊断在调度前只检查语义段字段，因此已生成文字也会报缺重点。

现在诊断在调度、图层保留与生命周期处理之后执行，只读最终结果。对缺少语义重点词范围的段落，以下条件必须同时成立，才不再报缺重点：

- 对应事件为 `Keyword`，文本去空白后非空，`semanticIndex` 精确指向该段。
- 该事件与该元素的实际调度决策为 `selected=true`。
- 原始元素绑定为 `Keyword`、表现为 `Text`，其语义筛选适用于该段。
- 对应事件/元素实例实际存在，仍为文字、内容去空白后非空，且时长大于零。

仅有事件、文字图层或其他语义段的成功实例不能掩盖缺失。intent拒绝、时长拒绝、保护区拒绝、空白/仅尾标点、只有图形、没有semanticIndex、关联别段，以及将完整语义句当作Keyword回退文本，都保留相应警告。

没有改变调度条件、原词、事件、语义标注、元素、布局、动作或时间；没有自动补重点词。已与星形能力一起构建并更新本地服务，部署前确认生产队列为空。

验证：`cargo test -p moirai-footage --lib templates::rhythm::tests -- --nocapture`，26通过、0失败，其中4个新增回归覆盖上述正负场景。正例还将计划中的元素、布局和调度决策逐字段与直接调度结果比较，并核对原词、语义标注和显式事件不变。该验证不涉及导出或审美分数。

合并后完整 Rust 库测试 350 通过、4 忽略。使用真实清单 r4 的显式关键词 Sample 回验 `/samples/validate`，只移除第1/6段两条误报，其余11条警告保留；除顶层 warnings 外完整计划逐字段精确相等。请求、部署前后响应和断言见 `/Users/zhengwei/Downloads/keyword-event-diagnostic-20261008/verification.json`。没有重新评分或修改原生记录。
