# 行动清单花字泛化检查（2026-10-08）

## 结论

冻结模板 **`style-study-20260929-checklist-headline` r3**，未写入任何输入 ID、原句下标、人物坐标或绝对 TTS 秒数。按应用层分别提交了 3 个精确 Application，并通过正常 `production/author` 生产 6 个真实发布预览：

1. `speech-square`：720×720，中文短/中/长词，3 个预览。
2. `mentor-landscape`：1280×720，真人行动建议正例 + 同访谈布景的无行动语义负例，2 个预览。
3. `sudha-landscape`：1280×720，另一位真人的两处学习建议，1 个预览。

所有预览均保留原始入库媒体和 transcript revision，新的生产 fixture 含 `textMeasurementContractVersion: 1` 与 renderer `textMeasurements`，发布前后的 `outputSha256` 与 MP4 文件 SHA-256 一致。代表帧按 390px 生成并检查 enter / stable / exit 三个位置；没有连续观看或试听，因此所有评审 `listened=false`、`aestheticQualityVerified=false`，系列最低内部评分 **79/100**，不宣称达到 90 分。

## 可泛化规则

模板只保留视觉不变量和适配边界：暖白纸张、靛蓝标题条、奶油夹、绿底三行勾选、深蓝描边、共同进退和文字依附。模板用途是步骤、行动建议或完成事项；一般叙述、回忆和说明不触发清单。

Agent 应按以下顺序完成单次应用：

1. 从当前 transcript revision 读取词边界，标注真实的 `call_to_action` 语义单元和 keyword 范围；不根据字数伪造时间。
2. 检查人物脸、手势、图示和屏幕文字保护区；优先选择空白区域，再调整体比例和文字行宽。
3. 保留完整正文字幕与重点花字的层级；长步骤放不下时扩大阅读区、缩短本次强调范围、换位置或仅保留正文，不能把细小图标当作信息表达。
4. 对无行动语义的输入不触发清单。负例必须保留在验证记录中，不能用“空 records”单独证明语义检测。
5. 检查实际 enter / stable / exit 画面；短事件简化动作，不延长声音或改写对齐词时间。
6. Application 调整只保存本次画布、位置、尺度、行宽、保护区和事件策略；重复暴露的设计缺陷才升级为新模板 revision。

这些是 Agent 应用规则，不是渲染器自动理解中文的承诺。`usageGuide` 已在 r3 保存：用途、风格不变量、约束、降级顺序和已验证范围都可由 schema 读取。

## 精确应用记录

| Application | 输入与绑定 | 应用层调整 | 代表帧结论 |
| --- | --- | --- | --- |
| `speech-square` | `input-855095df75ed875fa4f3c574d4a87acb` r3（完成，短）；`input-177bfbf9a09e6e42ddb99e9646177c0a` r2（开始行动，中）；`input-8560256a59271fb174be96c5c9af1846` r1（三个可以完成的小步骤，长） | 方形居中，`minDisplaySeconds=0.9`；保留 3 个真实中文词长作为回归 | 短词和中词清晰；长词两行可读但在 390px 下图形与文字偏小，不能外推到真人画面 |
| `mentor-landscape` | `input-cde88118397f50e922df4e606786d79f` r1（明确建议 “get into the honors program”）；`input-99fa58d72fd4c9ad5cc2eed30b95b6a1` r1（童年回忆，无行动触发） | 1280×720，左上空白区域，`textWidths.headline=0.37`，保护脸和手势，真人正负例成对提交 | 正例左侧清晰、未挡脸和手势；负例不出现清单。两条素材同一访谈布景，背景泛化仍不足 |
| `sudha-landscape` | `input-cda103ae27c5ed0b7401e37118016be0` r1（`Study really hard`、`learn it now` 两处建议） | 1280×720，左上区域，`scale=0.86`，保护人物主体；保持原片结尾边界 | “learn it now”代表帧清晰；同一背景、第二个建议靠近片尾，需连续观片确认衔接 |

完整请求、输入快照、Application history 和生产回执位于 [`/Users/zhengwei/Downloads/checklist-generalization-20261008`](file:///Users/zhengwei/Downloads/checklist-generalization-20261008)。每个应用有 `*-application.json`、`*-samples.json`、`*-manifest.json`、`*-history-evidence.json`、`*-item.json` 和 `*-verification.json`。

## 生产与测量证据

| 批次 | 预览 | MP4 SHA / 测量 |
| --- | ---: | --- |
| `production-45d580c85edf9e1dc80c77966d77d7e9` | 3 | fixture 0 `0eace29c…` / 54 frames；fixture 1 `c0a603dc…` / 52；fixture 2 `92cdb777…` / 108 |
| `production-f73c5bd489489affbf7413672594ca09` | 2 | fixture 0 `427f8fde…` / 418；fixture 1 `031b9c48…` / 210（负例 records=0） |
| `production-fddc36a5ee7cdada84c50feb313fabeb` | 1 | fixture 0 `a3700eb6…` / 525 frames、2 records |

验证脚本 [`verify.py`](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/verify.py) 复制每个原生 preview、重新计算 SHA-256，并用 FFmpeg 解码 390px enter/stable/exit 代表帧。所有 `textMeasurements.outputSha256` 与文件哈希一致，`droppedRecords=0`，发布状态为 `published`。测量 producer 是 `production-scene-exporter` 的声明，不能当作独立浏览器认证。

代表帧：

- [中文短词](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/speech-square-fixture-0-phone.png)
- [中文中词](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/speech-square-fixture-1-phone.png)
- [中文长词](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/speech-square-fixture-2-phone.png)
- [真人行动建议](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/mentor-landscape-fixture-0-phone.png)
- [无行动语义负例](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/mentor-landscape-fixture-1-phone.png)
- [第二位真人两处建议](file:///Users/zhengwei/Downloads/checklist-generalization-20261008/sudha-landscape-fixture-0-phone.png)

## 诚实评审

原生系列 ID：`style-review-series-99781afc3af7d305a9e011d90c402e9aeb7951693ce8dd716779cb2e7734f657`。

- 三个 case 均 `current=true`、`evidenceCurrent=true`。
- case 分数：`speech-square=80`、`mentor-landscape=81`、`sudha-landscape=79`；系列取最低 **79**。
- 内部阈值未达成（`meetsInternalThreshold=false`）。
- `listened=false`、`aestheticQualityVerified=false`。
- 主要扣分：方形长词在小屏的阅读余量、真人正例数量不足、背景同质、第二位真人的末尾事件尚未连续观看。

这次评审只证明当前三种 Application 已按输入差异做了记录并完成代表帧核验。下一步应使用未参与调参的新真人背景补正例，复查短事件和片尾衔接，再进行连续观片与试听；不能把 79 分、技术发布或测量记录升级为模板质量通过。

## r4 通用效果返修（2026-10-08）

复查 r3 的 390px 图发现通用缺陷：真人侧栏里的清单太小，三勾细节难辨；长文字持续倾斜和厚偏移影增加视觉噪声。CAS 将同一模板升为 r4，同步 usageGuide：所有图标叶节点和依附偏移统一放大 1.65 倍，正文改直立，短入场缩放由 .94 到 1，轮廓由 4 降到 2.8，投影减薄。没有写入人物、台词、词下标或绝对事件时间。

冻结后重新生产四种 Application、7 个预览：原三中文词长、导师正负例、Sudha 两事件，以及冻结之后选择的新计划音频竖屏输入 `input-cff723e5973128fcb40827c9cf585831`。全部 published、marker1、测量附件与实际MP4 SHA一致、droppedRecords=0、原词时间不变、全解码通过。

旧抽帧按整片位置，真人中间帧常没有花字。本轮改为按实际文本事件逐个抽 enter/stable/exit/可用after，并查看390px图。发现 Sudha 首事件与原片内嵌提问文字竞争；片尾事件无退出后帧，显式标记 `input-tail-no-post-frame`。新竖屏输入末事件同样有尾部限制。图标比例与字形改善，但没有凭技术通过提高到90。

r4当前系列 `style-review-series-32b5d6f0e7c6cf13600801d2dce4b597c0842282b5e55639eabd99133f800558`，四案评分 **88 / 88 / 82 / 87**，最低 **82**，回读 current/evidenceCurrent 均 true；listened=false、aestheticQualityVerified=false。r3最低79保留历史，不能继承为r4验收。

另实导出 Sudha 独立阅读区候选 `production-b0c9ad5fe5f5ca8ffe1b87ab5e834ce7`，解决文字重叠但把原视频缩至42%，人物太小、黑边过多，视觉更差，**不选入当前系列**。该失败证明不能只为避障牺牲主体。应继续尝试输入级局部位置/强调范围，保留完整正文，或者不在原片问题卡阶段触发；不改ASR时间、不能假称尾部退场已验证。

所有请求、r3/r4定义、生产回执、测量、逐事件图片与失败候选保存于 `/Users/zhengwei/Downloads/checklist-generalization-20261008/repair/`。`verify.py` 可重复文件/时间/帧核验；`review.py` 保留分项依据。仍缺新真人复杂背景、连续观片和试听，未完成90分目标。
