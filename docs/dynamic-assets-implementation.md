# 动态素材第一阶段实现

本次实现动态素材的 Rust 核心、版本存储、HTTP API 和 Agent 传输工具。工作台界面、真实视频渲染验收及参考视频 AI 复刻尚未实现。

## 数据与编译

- `moirai.dynamic-asset.v1` 定义复用现有 Element、Style、ResourceSlot、ResourceBinding 和 Treatment，避免重复实现动效语义。
- Layer 是 Group 或 Element。只保留 `parentId`，不同时存 children；父层可在子层之后声明。循环、未知父层、非容器父层、空组和超过 32 层的嵌套均拒绝。
- Group 目前是局部坐标作用域，不是隔离渲染表面。不支持组变换、组滤镜或任意程序节点，避免静默改变合成语义。
- TextInput 可绑定多层文字，例如描边层和填充层同步替换。Rust 校验输入所有权、默认值、Unicode 字符数和未知输入。
- `project` 生成既有 v2 Template，交给现有 plan/compile 管线；源定义保持可编辑。固定局部坐标不允许被单层字幕排版或避让重新定位。
- 保存是结构校验，不代表外部资源已可用、许可证已核验或画面达到审美标准。实际素材绑定继续由既有编译/预检流程验证。

## HTTP 与 Agent

路径以下均相对 Rust 服务；Web 代理前缀为 `/api/footage`。

| HTTP | Agent 工具 | 用途 |
| --- | --- | --- |
| GET `/templates/dynamic-assets/schema` | `dynamic_asset_schema` | Definition/Save/Insert 的 Rust JSON Schema |
| GET `/templates/dynamic-assets` | `list_dynamic_assets` | 已保存草稿列表 |
| GET `/templates/dynamic-assets/{id}` | `read_dynamic_asset` | 图层树、投影、文字字段和能力限制 |
| POST `/templates/dynamic-assets/inspect` | `inspect_dynamic_asset` | 只读校验草稿和返回投影 |
| POST `/templates/dynamic-assets` | `save_dynamic_asset` | 创建或更新，要求 baseRevision 和 idempotencyKey |
| POST `/templates/dynamic-assets/insert` | `insert_dynamic_asset` | 固定 assetRevision 后生成模板快照 |

新草稿 revision/baseRevision 均为 0；保存成功后版本加一。相同请求重试返回原版本，不覆盖当前新版；相同幂等键对应不同内容或旧版本更新会拒绝。历史定义存入独立版本记录。

实例化会为元素、样式、资源槽、Treatment 和排他组加实例命名空间；保留实际资产 ID。要求画布尺寸与 FPS 一致，当前不自动缩放字体或时间参数。返回 `mode: editable_snapshot` 和源版本/图层映射，不写工程、不建立自动更新链接。调用者通过既有模板保存和编译流程继续应用。

## 验证范围与后续

Rust 测试覆盖真实 compiler 的文字输出、局部坐标、坏图拒绝、输入限制、命名空间冲突、不可变版本及保存重试。MCP 测试覆盖原样传输、revision 和错误传播。未执行真实视频渲染或浏览器视觉验收。

下一阶段应先做可操作的图层树、文字输入 Inspector 和共享渲染预览；随后补充完整的时间 authority、素材实例关联持久化、组变换与参考视频复刻。现阶段 `inspect` 明确返回这些能力为不支持，不将基础模块标记为完整编辑器。

## 内容编辑与时间规则独立（2026-09-29）

`text_presentation` 只修改文字来源和高亮，不再重设 `timing` 或动效。
例如已有 `semantic_start`、偏移 0.12 秒、显示上限 1.7 秒，切换整句为重点词后
这些值原样保留。若需要跟随关键词开始，应另行配置 `timing.anchor=keyword_start`。
这也适用于通过 AI 调用该操作；原生 JSON Schema 已包含这一契约说明。

新建用途仍提供便捷默认值：花字使用固定文字/video_start，重点词使用
keyword/keyword_start，动态字幕使用 sentence/cue_start；后两者默认时长上限
600 秒，实际展示由输入声音与调度决定。默认值只在创建时初始化，不覆盖后续编辑。
既有已保存样式不迁移、不改写；旧调用方若依赖切换内容隐式调整时间，应显式设置时间规则。


## Per-layer text width at application time (2026-09-29)

Application and configured insertion accept `textWidths: { [sourceElementId]: width }`. Width is 0.1–1 of the output canvas. Rust applies this after proportional placement, independent transform and the existing sentence-only `captionWidth`; a per-layer entry therefore takes precedence for that element. All text bindings are eligible, including keyword and literal. The center stays fixed; font, timing, motion, other elements and saved definition remain unchanged. Unknown/non-text IDs, invalid widths and resulting off-canvas rectangles are rejected. Insertions use source IDs before instance prefixes and require placement when overrides are present. Empty/omitted maps preserve existing application identities.

Workbench trial exposes per-layer controls for the primary and each inserted style. URL `textWidths` contains the primary map; inserted maps travel inside `styles`. Copied trial links and review trial links retain the map. This adjusts reusable application layout, never a fixed speech timeline. Closing a control removes its override. The Rust schema and both MCP tool descriptions expose the same contract.


## Independent end boundary (2026-09-29)

`Element.timing.endAnchor` is optional: `event_end`, `cue_end`, `semantic_end`, or `video_end`. Omission retains previous scheduling and serialization. The start anchor and offset still determine when the instance begins. The explicit end boundary overrides the scheduler's implicit end (including schedule-rule next-event behavior), is capped by source duration and `maxSeconds`, and does not alter input word times. Existing composition lifecycle operations, if supplied in a whole-video template, remain a later stage.

`cue_end` requires a caption-associated event contained within that caption; a keyword spanning display units is rejected rather than silently truncated. Use `semantic_end` for that case. `semantic_end` requires a semantic-associated event. Missing associations are explicit plan errors. A boundary before the start still produces no positive-duration instance under existing selection rules. No rule automatically increases a short word's readability, and a keyword already at its sentence/semantic end does not gain extra duration.

The standalone workbench exposes the option in Application Rules, preserves it when content binding changes, and saves/loads it with the style. Default remains the legacy behavior. AI uses the same field in the native schema and editable definition; no Web scheduling implementation was introduced.

### 保存后直接试映

样式详情有未保存修改时，主试映入口显示“保存并用声音试效果”。它先走原有原生保存接口，成功后用回执中的样式ID和revision打开试映页；保存失败保留草稿和当前页面，不回退到旧版试映。没有修改时沿用已保存版本链接，不产生额外保存。普通“保存修改”仍留在工作台。此项仅为UI流程整合，保存、版本及执行规则仍由Rust负责。

试映页固定提供“选素材与内容 / 看效果与布局 / 叠加与复用”三步导航。它只移动焦点和视口，不切换或卸载编辑状态；真实素材选择、应用摆放和叠加搜索在往返时保留。手机布局同样可用。

区域适配与独立摆放：选择上/下半区域会整体等比缩放设计，包含字号与装饰。试映页提供解释和“保持字号，独立摆放”，使用既有完整画布适配加scale=1，再用位置控件移动。这里保持的是完整输出画布适配后的字号；跨画幅仍由Rust执行等比适配，不保证等于源设计像素字号。此入口不修改保存样式。

### 试映内容的标签页续接

独立样式试映页启用resumeContent，已完成的素材选择、标注、分段、绑定和当前预览输入自动暂存到sessionStorage的独立automatic键，按试映路径隔离。返回或刷新仅尝试一次恢复，复用Rust samples/validate及转写版本校验；失败保留原暂存，显示错误，不用空初始状态覆盖备份。主动移除全部素材会清除自动暂存，不在下一次刷新重新选回。编辑中的转写修正、忙碌和未完成内容编辑不写自动暂存；现有离开保护继续生效。

手动“保存试映内容”使用原键，两者互不覆盖，可用于恢复到用户主动保存的内容。自动暂存只限当前标签页，不替代JSON导出或跨设备同步；普通生产页面仍是手动模式。

试映页成功准备后还会按样式ID记住应用查询参数。工作台再次进入时复用画幅、摆放、行宽、视频区域、语义与叠加设置；主样式revision总取当前保存版本，不从历史查询覆盖。应用准备失败不更新记录，过期的叠加版本仍由原生明确拒绝。明确打开外部试映链接优先采用该链接参数，成功后成为此标签页最新方案。该机制与内容自动暂存分别保存，均不改变库中的样式。

## Explicit isolated group compositing

A container may set `content.composite: true` (omitted/false keeps historical
per-child treatment behavior). Its descendant visual leaves project to a native
`composition.groups` entry with `composite: true`; group-target treatments remain
on that group. The compiler produces a renderGroup controller and the renderer
applies its effects after compositing the children. Existing child opacity,
reveal and timing tracks are not removed or rewritten by this switch.

Native `group_compositing {layerId, composite}` edits only this flag, validates the
result and does not save. The independent style editor exposes it under the
container's Appearance tab as “整组合成”; MCP transports the same operation.
Insert qualifies group IDs and membership; capture preserves composite groups.
Ordinary scene groups remain unsupported by capture. Overlapping/nested composite
groups are explicitly rejected by native validation; ordinary nested layout
containers inside one composite group remain valid.

Preview representative-frame selection descends into group children and includes
ancestor opacity, rather than treating the transparent group controller as visible
content. Tests cover legacy leaf expansion, isolated controller compilation,
capture/insert, flag edit/reversal, invalid targets, overlapping groups and a late
visible child. Browser proof uses a separate QA style with an identical 0.4-second
window: per-child fade creates cap/joint bright spots, composited fade does not;
toggle/save/reload preserves the result and original styles remain unchanged.

This bridge does not automatically migrate existing icons. Their per-child fades
must be separated from child reveal tracks and moved to a group effect. Preserving
fixed-second exit durations for arbitrary voice-event lengths still needs explicit
verification; the QA proof uses a normalized group envelope at a fixed sample
window and must not be presented as migrated production styles.


### 固定秒数的整组淡出

原生 `group_fade` 操作要求容器显式 `composite:true`，参数为 `layerId`、
`exitSeconds` 和可选 `enterSeconds`。后者是短事件比例压缩的入场预算，
不会额外创建淡入；省略保留已有预算。`exitSeconds:null` 移除管理的整组效果。
操作只返回草稿，不保存、不移除子层 opacity，因此手动叠加仍遵循乘法语义。
工作台容器外观面板可修改预算与淡出秒数、应用或移除；AI 使用同一原生操作。
通用 motion treatment 的 `motionTiming` 与 `repeatSeconds` 互斥。

clock v2 / completion v3 已迁移，子层只将原退场末值改为 1，保留入场揭示。
迁移与面板保存回读证据见 `Downloads/icon-group-fade-20260929`；
该修复不代表整体样式达到审美验收标准。
