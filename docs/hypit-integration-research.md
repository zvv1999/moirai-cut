# Hypit 与 Moirai Cut 的动态素材架构整合调研

**调研版本**：Hypit `e6624e2424b6e9c8427dc3f68c5bfd2728a416d2`（仓库版本 `0.2.6`）

**参考仓库**：[hypit-ai/hypit](https://github.com/hypit-ai/hypit/tree/e6624e2424b6e9c8427dc3f68c5bfd2728a416d2)

**目标仓库**：Moirai Cut

## 1. 执行摘要

Moirai 当前已经具备动态模板的关键零件：元素、角色、表现类型、语义绑定、资源要求、时间事件、关键帧、Treatment、编排规则和真实渲染编译器。但这些能力仍以“模板生产”为中心，动态字幕和花字还没有成为一种可以独立保存、组合、编辑、复刻和发布的一级素材。

Hypit 最值得借鉴的不是 SVML 语法，也不是把整个系统改成 TypeScript，而是五个边界：

1. 用可嵌套的视觉 IR 表达动态素材树，保持文字、底板、描边和装饰的可编辑性。
2. 用语义时间锚点和显式写回 authority 表达“跟随哪个词/事件”，避免拖动后丢失关系。
3. 让组件声明 Companion Inspector，编辑器只渲染声明过的可写字段。
4. 让组件输出可被预览、时间轴、渲染器和 AI 同时消费的结构化中间结果。
5. 把参考视频拆解、编辑、渲染、帧级对照和版本发布组成闭环。

建议 Moirai 采用一个 Rust 原生的 `DynamicAssetDefinition` 作为动态素材根对象，并将它投影到现有 `Template`/`Composition`；不再为花字另起一套平行的模板格式。现有元素和 Treatment 继续兼容，动态素材作为更高层的组合图下沉到现有编译器。

## 2. Hypit 的架构事实

### 2.1 Visual IR：结构、资源和程序分离

`@hypit/composition` 的 `VisualTrack` 由 `Present` 组成。一个 `Present` 有自己的时间跨度、堆叠顺序和一棵元素树。元素可以是 `box`、`text`、`text-flow`、`path-text`、`image`、`video`、`surface` 或 `program`；子元素的位置相对父元素，动画关键帧以 Present 起点为局部坐标。

这个边界解决了当前花字模型的核心问题：花字不是一个带颜色和描边的字幕，而是一个可组合的局部场景。例如：

```text
dynamic-asset: impact-word
  root: word-group
    shadow-text
    offset-color-text
    outline-text
    fill-text
    burst-decoration
    underline-sticker
```

`program` 是复杂渲染的逃生口，允许一个组件携带明确格式的 HTML/CSS/JS 或其他渲染 payload；它仍然必须声明依赖和时间域。它不能成为把所有内容烘成图片的借口。

`@hypit/hyperframes` 只负责把通用视觉结构降级为渲染文档，不知道 Caption、Speech 或 B-roll。音频由独立的 `AudioTrack` 和媒体管线处理，避免“改视觉就偷偷改了声音”。资源使用引用和清单分离，渲染器先验证素材再物化路径。

### 2.2 Caption：文案和出现方式分离

`@hypit/caption` 将 `CaptionDocument`（词、分段、发音/显示关系）与 `Use`（某个时间窗口内如何呈现）分开。一个 Cue 可以被多个 Use 以不同样式呈现，Use 的隐藏或替换不会重新启动原有词级时间。

对 Moirai 的直接启发是：

- 字幕文本、语义段落和词时间属于内容事实；
- 花字样式、强调、打字、逐词高亮属于表现 Use；
- 同一个内容可以同时被普通字幕和花字 Track 消费；
- Use 的窗口可以是语义段、关键词、暂停、节拍或显式 offset。

### 2.3 Temporal Markup：时间关系不能退化为秒数

Hypit 区分 `Selection`、`Moment`、`TemporalWindow` 和 `TemporalInstant`。`during` 表达语义窗口，`at + for` 表达事件加持续时间，引用表达式可以保留原锚点并只调整局部 frame offset。

关键规则是：编辑器只能执行组件声明过 inverse 的操作。拖动一个绑定到关键词的花字，不应把它改成一个孤立的 `start=1.37s`；应该写回关键词锚点或其局部 offset。共享 Selection 被多个消费者使用时，只修改一次，所有消费者重新投影。

Hypit 还明确区分：

- `TemporalSource`：这个时间依赖什么事实；
- `TemporalInstantAuthority`：本次手势允许写回哪个字段；
- 投影时间：在当前视频中的帧位置；
- 语义身份：后续重排后仍要保留的词、段落或事件身份。

### 2.4 Companion Inspector：组件声明编辑契约

`@hypit/studio-adapter` 将 Inspector 分为 `Where`、`When`、`How` 三个导航域。组件先声明 `bindings`（确切的作者字段），再声明 `inspector`（显示哪些字段、控件、单位和分组）。Studio 不根据字段名猜写回逻辑，也不允许组件注入任意 DOM/CSS 编辑器。

控件是有限集合：`text`、`number`、`boolean`、`select`、`color`、`list`、`record`。显示值和作者值分离，例如作者值为 `0.78`，界面可显示 `78%`，提交时由服务端执行可逆转换和校验。共享 Style 或 Recipe 的修改会影响所有引用者，界面要明确显示引用关系。

### 2.5 Author Package：可插拔但不复制核心

`@hypit/author-kit` 规定组件包只贡献自己的 Module、Producer、Surface、Graph Fragment 和 Companion；核心类型、运行时和包选择仍由宿主提供。组件的输出可以是 Visual Track、Schedule 或其他有类型的值。

这是一种适合 Moirai 的组织方式：动态花字、贴纸、评论气泡、榜单和数据卡可以是 Rust 中的组件注册表条目，但不应各自复制时间投影、资源校验和渲染事务。

## 3. 与当前 Moirai 的对照

| 领域 | 当前 Moirai | Hypit 的对应设计 | 判断 |
| --- | --- | --- | --- |
| 元素语义 | `Role`、`Representation`、`MediaUse`、`Binding` 已拆分 | Visual IR 元素种类 + 组件域事实 | 基础方向正确，需增加父子树和局部坐标 |
| 动态表现 | `Motion`、`MotionKey`、`TreatmentOperation::Motion` | Present 局部关键帧和程序元素 | 可复用，需统一局部时间和叠加规则 |
| 文字强调 | `text_highlight`、`active_word` | Caption Document + Use + 词属性 | 需把高亮升级为独立 Use/阶段 |
| 时间 | `TimeEvent`、`Anchor`、`Timing`、`ScheduleRule` | Selection/Moment/Window/Authority | 已有事实层，缺少明确写回权限 |
| 正交特性 | `Treatment` + `TreatmentApplication` | 组件/Track 独立输出 | 方向正确，需支持树节点和 Track 级应用 |
| 编排 | `Composition`、Group、SpatialRelation、LayoutPolicy | Composition + typed Track | 需统一元素组合和动态素材组合 |
| 资源 | `resource_id`、`ResourceRequirement` | BlobRef、Surface、资源清单 | 需拆分槽位、资产、绑定、替代策略 |
| 编辑 UI | Web 组件直接暴露 motion/样式字段 | Companion 声明 bindings/Inspector | 这是当前最明显的可用性缺口 |
| 复杂渲染 | 当前编译器下沉到 timeline clip/effects | 显式 `program` 或 `surface` | 可增加扩展点，不能绕过 Rust 真相 |
| 预览 | Canvas/DOM 近似 + 保存预览视频 | 同一结构投影到 Studio 和真实渲染 | 必须用同一编译输出做验收 |
| AI | Agent 可操作工程，缺少动态素材专用协议 | 组件、Source、Output、Companion 都可读 | 需要结构化 read/edit/render 工具 |

当前 `rust/crates/footage/src/templates/model.rs` 中的 `Element` 是平面对象，`composition.rs` 中的 `Treatment` 已经是正交应用，`events.rs` 已经提供统一 `TimeEvent`。因此不需要推翻模板模型；需要增加动态素材层，并把它编译成现有 Element/clip。

## 4. 推荐的 Moirai 目标模型

### 4.1 动态素材根对象

```rust
pub struct DynamicAssetDefinition {
    pub id: String,
    pub revision: u64,
    pub name: String,
    pub category: DynamicAssetCategory,
    pub canvas: AssetCanvas,
    pub inputs: Vec<DynamicAssetInput>,
    pub layers: Vec<DynamicAssetLayer>,
    pub variants: Vec<DynamicAssetVariant>,
    pub bindings: Vec<DynamicAssetBinding>,
    pub companion: ComponentCompanion,
    pub evidence: Vec<ReferenceObservation>,
    pub license: AssetLicense,
}
```

`DynamicAssetDefinition` 是素材库的可编辑对象，不是模板实例。模板通过一个 `asset_id + variant_id` 引用它，并为输入绑定实际文案、词时间、主题色、资源和时间窗口。

### 4.2 图层和组件树

```rust
pub struct DynamicAssetLayer {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: DynamicLayerKind,
    pub role: DynamicLayerRole,
    pub local_frame: LocalFrame,
    pub transform: Transform2d,
    pub style_id: Option<String>,
    pub resource_slot: Option<String>,
    pub children: Vec<String>,
    pub editable: bool,
}
```

`DynamicLayerKind` 至少包括 `Text`、`Shape`、`Image`、`Video`、`Path`、`Mask`、`Particle` 和 `Program`。`parent_id` 和局部坐标使底板、文字、装饰可以整体移动，同时允许子层独立编辑。`Program` 只能引用受信任的 renderer format，并声明 artifacts、输入和确定性规则。

### 4.3 样式和动效

```rust
pub struct DynamicAssetStyle {
    pub id: String,
    pub typography: Option<TypographyStyle>,
    pub fills: Vec<Paint>,
    pub strokes: Vec<Stroke>,
    pub shadows: Vec<Shadow>,
    pub filters: Vec<Filter>,
    pub layout: StyleLayout,
}

pub struct DynamicAssetMotion {
    pub id: String,
    pub phase: MotionPhase, // entrance, settle, emphasis, exit, loop
    pub target_layer_ids: Vec<String>,
    pub channels: Vec<MotionChannel>,
    pub timing: TemporalRelation,
    pub repeat: Option<RepeatSpec>,
}
```

样式描述“长什么样”，Motion 描述“如何变化”，Binding 描述“跟什么事实走”。三者不能合并为一个不可解释的 JSON 参数块。

一个“综艺厚描边花字”可以由：填充、外描边、阴影、偏移色层、底板、装饰和 `entrance/settle/emphasis/exit` 四个阶段组合而成；换文案时只替换 `text` 输入，不复制一份新的样式。

### 4.4 时间锚点与写回权限

```rust
pub enum TemporalAnchor {
    Semantic { id: String, boundary: Boundary },
    Caption { cue_id: String, boundary: Boundary },
    Keyword { cue_id: String, word_id: String, boundary: Boundary },
    Event { event_id: String, edge: EventEdge },
    AbsoluteFrame { frame: i64 },
}

pub struct TemporalRelation {
    pub mode: TemporalMode, // during, at_for, until_for, start_end
    pub source: TemporalAnchor,
    pub offset_frames: i64,
    pub duration: Option<ClockDuration>,
    pub authority: EditAuthority,
}

pub enum EditAuthority {
    MoveSourceAnchor,
    AdjustLocalOffset,
    AdjustDuration,
    AdjustIndependentEndpoint,
    Fixed,
}
```

例如，花字入场绑定 `KeywordStart`，拖动整个素材默认调整关键词关系；如果用户明确选择“只改偏移”，才写 `offset_frames`。服务器在一次事务中校验投影、重编译并提交；失败时保留旧版本。

### 4.5 Companion schema

```rust
pub struct ComponentCompanion {
    pub family: String,
    pub bindings: Vec<CompanionBinding>,
    pub inspector: Vec<InspectorField>,
    pub timeline: TimelinePresentation,
    pub capabilities: Vec<Capability>,
}
```

花字组件应至少声明：

- `Where`：锚点、区域、基准层、避让区、缩放策略；
- `When`：绑定事件、入场/强调/退场阶段、循环、持续时间、素材裁切；
- `How`：文案、字体、填充、描边、阴影、偏移色、底板、装饰、音效。

字段必须包含 `binding`、类型、单位、范围、可选值、是否可写和共享引用信息。AI 读取同一 schema，就不会把一个只读的推导值当成可写参数。

## 5. 动态字幕/花字编辑器方案

编辑器应围绕一个动态素材实例工作，而不是把模板 JSON 的所有字段平铺在右侧。

### 5.1 六个核心区域

1. **画布**：显示真实合成比例、父子边界、锚点和安全区；预览帧由 Rust 编译结果驱动。
2. **图层树**：显示组件、子层、资源槽和可见性；选择父层时允许整体变换。
3. **阶段时间轴**：显示 entrance、settle、emphasis、exit、loop，以及它们绑定的语义事件。
4. **Where/When/How Inspector**：根据 Companion 动态生成，不暴露无意义底层字段。
5. **参考对照**：左侧参考帧/视频，右侧当前渲染，支持同帧擦除、差异框和关键指标。
6. **AI 操作面板**：以结构化变更计划呈现“识别到的层、绑定、推断和待确认项”，提交后进入同一事务协议。

### 5.2 文字长度适配

组件必须声明文本输入的布局策略：`fit_width`、`fit_height`、`wrap`、`scale_to_fit`、`truncate`。4、8、12、20 字测试应自动渲染，检查描边、底板、装饰和相邻层是否仍然对齐。禁止以最终 PNG 作为唯一资产，因为替换文案会失去排版和词级动画。

### 5.3 预览与真实渲染一致

Canvas 可以提供交互反馈，但保存、质量评估和发布必须调用 Rust 编译器。编译器输出应同时供：

- Web 画布的可读投影；
- 代表帧缩略图；
- 视频导出；
- AI 对照分析；
- 模板实例化。

这样可以避免当前“DOM 预览看起来正确，成片质感不一致”的问题。

## 6. AI 复刻和批量生产闭环

### 6.1 参考视频拆解

```text
参考视频
  -> 音频/字幕/词时间分析
  -> 代表帧与运动轨迹提取
  -> 文字、底板、描边、装饰、层级识别
  -> 颜色/字体/空间/节奏观测
  -> ReferenceObservation
  -> 动态素材草稿
  -> 人工确认低置信字段
```

每一条观测必须带 `status`：`observed`、`inferred`、`authored` 或 `unverified`，并保留参考视频、时间范围和说明。AI 不能把“猜测使用了某字体”写成已验证的资源绑定。

### 6.2 映射和生成

AI 先生成结构化计划，再调用素材库搜索：字体、贴纸、icon、粒子、音效和颜色预设。找不到完全匹配时，输出替代策略和原因，而不是静默换成随机素材。

生成结果包含：

- Component Graph；
- TemporalRelation；
- 样式参数；
- 资源引用和许可证；
- 置信度与待确认项；
- 预期 capability；
- 版本和幂等键。

### 6.3 帧级闭环

```text
create draft
  -> compile
  -> render selected frames
  -> compare reference/current
  -> propose patch
  -> apply patch transaction
  -> render again
  -> publish revision
```

比较不应只看整片相似度；至少拆分文字区域、边界框、颜色、运动轨迹、出现/消失帧和遮挡关系。视觉相似度只是候选评价的一项，结构完整性和可编辑性同样是发布门槛。

## 7. Agent 工具契约

以下工具应由 Rust 服务提供，Web 仅作为调用壳：

| 工具 | 作用 | 必须返回 |
| --- | --- | --- |
| `read_dynamic_asset` | 读取素材图、版本、输入和能力 | 完整 Component Graph、Companion、资源引用 |
| `create_dynamic_asset` | 从草稿创建可编辑素材 | 校验报告、revision、缺失资源、未验证观测 |
| `edit_dynamic_asset` | 应用结构化 patch | 变更摘要、重编译结果、冲突和新 revision |
| `duplicate_dynamic_asset` | 生成变体 | 父版本、输入差异、授权继承结果 |
| `apply_dynamic_asset` | 将素材实例化到模板/时间线 | 实例绑定、时间投影和资源替代记录 |
| `inspect_reference_motion` | 分析参考视频的动态 | 分阶段运动、帧范围、置信度、参考帧 |
| `render_dynamic_asset_frames` | 渲染指定帧 | artifact refs、渲染参数、编译警告 |
| `compare_dynamic_asset` | 与参考或基线对照 | 分区域差异、结构差异和建议 patch |
| `publish_dynamic_asset` | 发布版本 | 质量门槛、许可证、依赖、可回滚版本 |

所有写操作都带 `base_revision` 和 `idempotency_key`。AI 不能直接改 Web 状态或绕过 Rust 的 schema/事务校验。

## 8. 与现有 Rust 模块的落地映射

### 第一层：兼容当前模型

- 在 `templates/model.rs` 增加动态素材引用和父子关系的可选字段，保持旧 JSON 可反序列化。
- 在 `composition.rs` 增加 `Target::DynamicAsset`、组件级 Treatment 应用和资源替代策略。
- 复用 `events.rs::TimeEvent` 作为统一事件来源，新增语义锚点身份和 authority，不复制另一套事件表。
- 将现有 `Motion`/`MotionKey` 作为低层通道；动态素材的高层 Motion 编译到它们。

### 第二层：独立 Rust 模块

建议新增：

```text
rust/crates/footage/src/templates/dynamic_asset.rs
rust/crates/footage/src/templates/dynamic_asset_compile.rs
rust/crates/footage/src/templates/dynamic_asset_edit.rs
rust/crates/footage/src/templates/dynamic_asset_reference.rs
rust/crates/footage/src/templates/dynamic_asset_quality.rs
```

模块职责分别是模型、编译、authority 写回、参考观测和质量评估。它们不依赖 React/Next.js。

### 第三层：Web 工作台

`apps/web/src/templates/workbench.tsx` 负责布局和交互；`composition.tsx` 展示 Companions 声明的字段；`caption-content.tsx` 只编辑内容事实；新增 `dynamic-asset-editor.tsx` 展示图层树、阶段时间轴、参考对照和 AI patch 预览。所有字段编辑调用 Rust API，不在组件中复制业务规则。

## 9. 不应直接照搬的部分

1. **不引入 SVML 作为第二套业务真相。** Moirai 已经有 Rust schema 和模板 JSON；如需文本作者层，应先编译到 Rust AST，并保证只有一个提交源。
2. **不把业务逻辑迁移到 TypeScript。** Hypit 的 TypeScript 包边界可借鉴，Moirai 的现有架构要求 Rust 是唯一业务真相。
3. **不把文字烘成图片。** `surface`/`program` 仅用于确实无法结构化的渲染，主文字必须保留内容、字体和词级关系。
4. **不把绝对秒数当成唯一时间模型。** 绝对时间是最后的投影或显式作者选择，不能覆盖语义锚点。
5. **不把 AI 推断写成事实。** 所有参考拆解都要有状态、证据、置信度和人工确认路径。
6. **不直接复制 Hypit 源码或包。** Hypit 使用带附加条件的 Apache 2.0 许可证，限制多租户 SaaS 和商业再分发，并要求保留其 CLI/报告中的品牌与版权信息。当前建议只借鉴架构；若未来链接、嵌入或派生其代码，必须做单独许可证审查。

## 10. 分阶段实施路线

### Phase 1：结构和只读投影

- 定义 `DynamicAssetDefinition`、Layer、Style、Motion、Binding、Companion。
- 让现有模板能读取动态素材并编译成旧 clip。
- 建立图层树、资源引用和版本校验。
- 用代表帧验证 Web 预览与真实渲染。

### Phase 2：动态花字编辑器

- 实现文本/底板/描边/装饰的组合图。
- 支持 entrance、settle、emphasis、exit 和 loop。
- 实现 4/8/12/20 字适配与安全区检查。
- 用 Companion schema 驱动 Inspector。

### Phase 3：时间 authority 和 AI 复刻

- 为 keyword/caption/semantic/event 建立可写锚点。
- 实现参考视频观测、置信度和待确认项。
- 提供 `inspect_reference_motion`、`compare_dynamic_asset` 等 Agent 工具。
- 以结构 patch 而不是自由文本修改素材。

### Phase 4：模板工作台整合

- 模板实例只保存输入绑定和 variant 选择，不复制素材图。
- 素材库支持搜索、预览、替代策略、授权和版本回滚。
- 批量生产读取同一动态素材定义，输出多个内容变体。

### Phase 5：质量和规模化生产

- 建立代表帧、长度适配、重编译、导出一致性和许可证的自动门槛。
- 为每个素材记录结构质量、时间质量、视觉质量、可编辑性和证据完整性。
- 在发布前运行真实渲染和参考对照，避免用“模板数量”替代质感验收。

## 11. 验收指标

### 结构

- 每个可见视觉部分都有稳定身份和明确父子关系。
- 文案、字体、颜色、描边、底板、装饰均可单独编辑。
- 复杂程序节点有明确 format、输入、artifact 和 fallback。

### 时间

- 事件、窗口、持续时间和局部 offset 可区分读取。
- 拖动后仍能回读原语义锚点和 authority。
- 共享锚点修改会正确影响全部消费者，失败不发布半成品。

### 内容适配

- 4、8、12、20 字替换不发生溢出、遮挡或父子关系漂移。
- 词级高亮、入场和强调不因样式 Use 替换而重新计时。

### AI 复刻

- 层级识别、绑定识别和阶段识别分别有准确率记录。
- 每个推断字段都有证据和置信度。
- AI 只能通过 schema 合法修改，不得直接写任意渲染字段。

### 渲染

- 编辑器代表帧和真实导出使用同一 Rust 编译结果。
- 随机抽取首帧、阶段边界、关键词帧、退场帧进行像素和结构对照。
- 资源、字体、授权和替代素材均可追溯。

## 12. 最值得先做的五件事

1. 在 Rust 中落地 `DynamicAssetDefinition + Layer Graph`，把花字从平面字幕提升为可组合素材。
2. 把 `TimeEvent/Anchor` 补成 `TemporalRelation + EditAuthority`，先解决“跟词走”和拖动写回。
3. 用 `ComponentCompanion` 驱动动态素材 Inspector，让人和 AI 读取同一个编辑契约。
4. 让画布预览、代表帧、真实导出都经过同一动态素材编译器。
5. 做参考视频拆解到帧级对照的最小闭环，再扩展批量变体生产。

这五件事完成后，模板工作台才会从“能套模板”变成“能生产、编辑和复刻动态素材”。插画、动图和 icon 的数量可以继续扩充，但它们应作为图层/资源槽进入这套统一模型，而不是继续增加互不兼容的固定模板。
