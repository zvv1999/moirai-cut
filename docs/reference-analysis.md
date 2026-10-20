# 独立参考分析接口

Rust 实现位于 `rust/crates/footage/src/templates/reference.rs`；Web/MCP 仅传输。采样、模型分析、像素比较互相独立，不保存或修改动态素材。渲染复用现有编辑器，不新增渲染引擎。

## AI 调用顺序

1. 导入视频取得模板输入 `inputId`。
2. `sample_reference_video({inputId,times:[0,0.2,0.5],idempotencyKey})`：仅本地抽帧。
3. `read_reference_analysis({id:idempotencyKey})`：等待 job succeeded，读取 sample 与 frame URLs。
4. `analyze_reference_style({sampleId,brief,idempotencyKey})`：明确向配置的模型端点发送采样图片；该动作单独暴露，不隐含在抽帧中。
5. 读取带 subject/property/description/frameIndices/confidence 的观测及 uncertainties；全部标记 inferred。调用者将观测映射为动态素材草稿，使用既有 inspect/save 工具。
6. 将素材插入独立预览工程、编译并打开编辑器后，调用 `render_dynamic_asset_frames({projectId,atSeconds})`。这是现有 `render_frames` 的同实现入口，只渲染工程，不自动实例化素材。核对返回的 revision、stable 和 renderedAtSeconds。
7. 需要本地数值对照时，将导出视频作为模板输入导入并采样，再调用 `compare_reference_frames({referenceId,candidateId,idempotencyKey})`。两组数量必须相同，逐索引配对；调用者负责选择对应时刻。结果保留双方来源帧 URL/哈希和请求时间。

长任务均返回现有 Job；读取接口使用提交幂等键，非 jobId。相同键及请求返回原任务，改请求冲突；失败后的新尝试使用新键。模型选择与端点指纹在排队时固定，凭据不进入任务。返回失败不生成替代观测。

## HTTP

- POST `/templates/references`：`{request, idempotencyKey}`。
- GET `/templates/references/{id}`：Job 和成功结果。
- GET `/templates/references/{id}/frames/{index}`：经哈希检查的 PNG。
- GET `/templates/references/schema`：提交与观测 JSON Schema。

request 使用 tagged union，operation 为 sample/analyze/compare；其内部字段目前采用 snake_case（input_id、sample_id、reference_id、candidate_id），MCP 对外使用 camelCase 并进行传输映射。

## 精度与边界

- 抽帧限 12 帧，最长边 640 像素，时间必须严格递增且在原片范围内。记录 requestedSeconds，尚不声称精确解码 PTS。
- 模型适配器复用本地端点凭据与 model 设置，要求支持 Chat Completions 图片输入及 JSON 输出；不支持的端点明确报错，不暗中切供应商。
- 置信度是模型自报，不是校准准确率；稀疏采样无法确定所有关键帧、字体或遮挡图层。输出不是可直接发布的素材。
- 对照先等比缩放并黑边填充至 160×160，报告 RGB MAE（0 相同、1 最大差异），不进行自动配准、语义比较或审美评分。不同背景会影响指标。
- 当前不新增 Web 页面；AI 通过 MCP 编排。没有自动生成完整 Component Graph，也没有一键“复刻成功”的保证。

## 验证

自动化使用合成视频和本地假模型响应验证采样、证据校验、任务幂等、原图哈希与像素比较。真实模型兼容性需另行实测；不为接口测试上传用户视频。

### 2026-09-19 真实链路验证

用户授权的视频 `input-78c44ead8594fa3c15d54b6c539702f4` 在 0、0.2、0.5、1、2、4 秒采样成功。真实配置模型 `glm-5.3-flash` 返回 6 条观测及不确定性，耗时约 59 秒。请求分别为 `live-reference-20260919` 和 `live-analysis-20260919`。

通过 MCP 创建 `live-cyan-caption-20260919`，插入独立工程 `46f8feec-b17a-4200-9f91-37242e8acf35`，在 Chrome 实际渲染入场、稳定、退出六帧并导出 4.5 秒 MP4。随后将描边由 5 调整为 3，素材保存到 r2，工程保存到文件 r3；关闭重开后仍能读取文字参数、动画并稳定渲染。渲染返回的是编辑器 revision，本次为 2；通过 `wait_for_sync.state.loadedFileRevision = 3` 验证文件版本已加载，两种 revision 不可直接比较。

无声导出文件重新导入、采样和逐帧 RGB 比较成功，请求为 `live-candidate-20260919`、`live-comparison-20260919`。本次使用纯色背景展示独立素材，和参考视频背景不同，因此全帧 RGB 差异仅证明比较接口工作，不能用于判定风格相似度。

本次修复：参考分析复用素材库默认模型设置；允许无声视频进入素材输入，音轨要求移至转写入队处。126 项 Rust 模板测试（含真实 FFmpeg 集成）以及 2 项 MCP 传输测试通过。

质量边界：模型将原片黑描边误判为白描边，由 Agent 看图后修正；字体使用近似字体，动画根据稀疏采样推断。素材图由 Agent 映射观测并构建，并非分析服务自动输出。验证证明 Agent 编排的单素材闭环可执行，不代表一键高保真复刻、人工 UI 编辑验收或全量高级能力已完成。

本机证据保存在该工程 `agent/reference-verification/`，包含模型观测、素材定义、工程回读、同步状态、代表帧、对比及导出结果；`exports/reference-cyan-live-refined.mp4` 为最终预览。
