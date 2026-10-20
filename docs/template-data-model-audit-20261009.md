# 模板数据结构审计

2026-10-09。范围是抽象边界、组合语义、上下文身份与无损保存，不是单款模板位置或视觉评分。

## 结论

现有主模型具备正交组合基础，无需推倒重建。角色、表现形式、媒体用途，内容事件、效果处理、空间关系和资源绑定已分别建模。一次应用的文案、实际事件、画幅适配和观察证据不需要写回样式库。

本轮发现并修复两处证据作用域缺口，同时澄清一个命名边界：`Definition` 是可复用样式；历史命名 `Template` 是更宽的可编译编排文档，可以包含应用投影及场景专属规则。保存 Template 并不证明其可复用。

## 稳定职责

| 维度 | 当前类型 | 不变量 |
| --- | --- | --- |
| 元素是什么、做什么 | `Representation` / `Role` / `MediaUse` | 不按“重点字幕/重点图片/重点音效”扩展组合枚举 |
| 外观与处理 | `Style`、`Treatment` + `TreatmentApplication` + `Target` | 动效、模糊、调色等与角色独立；兼容性由 Rust 校验 |
| 元素关系 | group、spatial relation、text-size binding | 图文依附、相对布局与尺寸响应是关系，不是特定模板坐标分支 |
| 转场 | 双端 transition relation + effect；运行时 transition instance | 关联前后对象，不能挂到单个布局上冒充双端关系 |
| 媒体 | `ResourceSlot`、`ResourceRequirement`、`ResourceBinding`、资产目录 | 槽/约束/实际选择/媒体事实分开；应用覆盖不改默认绑定 |
| 内容 | `SemanticUnit`、`CaptionCue`、`Word`、`LayoutPhrase` | 意图、显示单元、词时间与短语排版各有身份；改字幕分段不改声音时间 |
| 触发与编排 | `TimeEvent`、`ScheduleRule`、分段/视觉节奏/混音策略 | 语义、镜头、声音和字幕统一提供事件，调度不依赖字幕存在 |
| 可复用样式 | `dynamic_asset::Definition` | 保存设计图、样式、绑定规则、相对运动、默认资源和使用指南 |
| 本次适配 | `Application` + `Sample` + extras | 分别承载版本引用和参数、真实输入标注及组合；不隐式改 Definition |
| 执行 | `Template` → `EditPlan` → 可编辑时间线 | 编排文档可含具体事件引用；实例时间由输入事件及规则求解 |
| 约束与证据 | placement policy、protection context、reading scope、motion envelope | 规则可复用；观察结果必须属于明确内容和应用上下文 |

业务校验及投影位于 Rust。Web 提供交互、渲染测量及草稿失效提示；MCP 透传同一接口。`ontology` 是共享模型的兼容别名，没有第二套本体结构。两个 schema 接口提供同一 `modelBoundaries`，供 AI 明确区分上述对象。

## 修复一：保护框归属

原历史结构允许多个 `samples`，却只有一份没有样本身份的 `protectedRegions`。恢复时可能依据 UI 当前样本或第一项把 B 视频的框套给 A。

新增可选 `protectionContext:{sample,application,extras}`：

- Rust 检查 sample 与保存样本中的一项完整相同，应用及附加样式匹配；不能只核对 input ID。
- 无附加依附关系时，主效果 transform 不改变背景保护对象，可保留标注；附加元素依附主效果时，变换也纳入上下文。
- 画幅、源视频构图、内容、事件区间及其他附加元素变化会使旧上下文失效。
- 工作台按 typed context 定位样本；`uiState` 不再决定保护框归属。
- 旧记录无 context 时原框保留为历史数据，返回 `unbound`，恢复时不自动应用；不虚构身份。
- 新字段缺省不参与序列化，保持旧记录的幂等身份。

一个 context 绑定一组框与一个样本。为不同样本记录不同保护框时，分别保存应用检查点；本次未引入多样本标注数据库或自动跟踪。

## 修复二：阅读测量归属

原 `ReadingCheck` 只有图层 ID、行数、字号和稳定时长。更改文案、宽度、尺度或事件后，同名图层可能错误继承旧结果。

新增可选 `readingCheck.scope:{application,sample}`，复用 motion envelope 的完整身份检查：

- 与请求当前 application 和 sample 精确匹配；陈旧身份明确拒绝。
- 缺少 scope 的旧测量返回 `unscoped`，保留诊断但不参与当前阅读门控，不宣称当前通过或失败。
- 匹配 scope 的失败参与原应用门控；时长只依据调用方提供的测量和预算，不推断通用语速。
- 位置建议改变应用后，候选阅读结果为 `requires_candidate_measurement`，保留 `sourceStatus`；原位置的通过不能转成新位置的实测通过。
- scope 一致只解决身份，不验证测量真实性，不产生审美或画面安全认证。

旧测量脚本如需要新的通过状态，必须依据实际测量对象重新生成请求；不能把当前身份补到来历不明的旧数值上。

## 能力边界

正交不等于任意组合均可执行。声音不接受视觉滤镜；文字高亮需要文字目标；转场、描边揭示等有明确的执行范围。调用方先读取原生 schema/capabilities，不支持的组合由校验拒绝。

完整 Template 中的场景调度、生命周期事件 ID、双端转场与整体应用旋转，不是 Definition 当前可完整保存的视觉图。`capture` 会拒绝无法保留的关系，避免静默丢字段。当前不靠强制改名或复制另一套模型掩盖这一区别。

设计坐标、默认文案和相对动作时长是合法设计数据。坐标归属由所在对象定义：Definition 是设计画布/图层局部坐标；Application 是输出画布适配；保护区及运动包络是输出画布归一化坐标。文字字号/描边采用画布像素，原生图形描边有既存 512 源单位约定，由投影/编译适配；调用方不能因字段都是数值就直接混用。

上述结构没有要求为每个输入增加类型、分支或模板位置特判。后续能力沿“定义 + 目标关系 + 参数 + 能力校验”扩展，输入差异保存在 Application/Sample/证据中。

## 验证

本轮回归重点：保护框保存/恢复/幂等与多样本归属、内容与构图变化拒绝、缺 scope 兼容、阅读证据变化拒绝、候选不继承原测量结果。现有回归还覆盖统一事件独立于字幕、效果/转场组合、资源替代、跨画幅投影、修改文字不改动效以及 capture 不丢场景规则。

执行结果：

- `cargo test -p moirai-footage --lib --locked`：392 通过，0 失败，4 忽略。包含本轮历史 16 项、位置/阅读 20 项及既有模型组合回归。日志：`/tmp/template-data-model-audit-20261009-rust.log`。
- Web 历史/布局针对性测试：19 通过，96 次断言。
- MCP 历史与 dynamic-assets 传输测试：8 通过，验证上下文快照和证据状态不被接口改写。
- Web `tsc --noEmit --incremental false` 通过。

以上验证针对源码和结构契约。本轮未重启运行中的 Rust 服务，也未进行新的浏览器交互验收；新 schema 随服务下次构建启动生效。本审计不记录新视觉评分、听感通过或成片验收。

相关实现：`model.rs`、`composition.rs`、`dynamic_asset.rs`、`production_author.rs`、`placement_advice.rs`、`application_history.rs`，均位于 `rust/crates/footage/src/templates/`。
