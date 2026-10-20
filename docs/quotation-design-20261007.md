# 双引号引用样式 r8：设计与应用验收

2026-10-07。样式 `style-study-20260928-quotation` 从 r6 更新至 r8，同一条素材，没有新增款数。当前中文阅读应用已登记 **82/100**，`current=true`、`evidenceCurrent=true`、`meetsInternalThreshold=false`、`listened=false`。这不是 90 分交付通过，旧 r5/79 分的输入与应用不同，不能比较分差。

查看 [本地对比页](/Users/zhengwei/Downloads/quotation-design-20261007/review.html)。完整证据目录为 `/Users/zhengwei/Downloads/quotation-design-20261007`。

## 设计变化

原版是奶油色厚描边宋体、两侧金色引号，中央摆放的旧实拍存在手势与人物信息遮挡。r7/r8 改为墨色宋体、随实测文字适配的暖纸衬底、金色 Georgia 引用符，主文左对齐；3 个原生文字层及其文字衬底保留可编辑性。根组独立合成，整组采用 120ms 淡入加小幅上移、80ms 淡出上移，实例由真实关键词事件触发。

这次是材质、字体层级、文字依附与组动效的变化；具体演员的坐标、原句和词下标没有写进模板。指南包含用途、固定设计、应用调整、阅读预算、降级顺序及冻结时的覆盖记录。后续实际验收写入本报告与应用历史，避免仅更新评语就让已有证据过期。

## 保存与失败保留

- `before.json` 是 r6；`save.json` 是 r7；`save-r8.json` 是 r8。均先原生 inspect，再按当前 revision CAS 保存。
- r7 三个实际导出保存在 `0/`、`1/`、`2/`。英文窄应用把包含衬底边距的总宽误当净文字宽，Deborah 主文降至 36.71–40.55px，引用符贴字。失败帧未删除。
- r8 修正通用引号内侧留白；扩大行宽是各 Application 的调整，未变成库默认。Deborah 初次回归纸面左缘约 57px，随后只将该应用 `centerX` 从 0.195 调至 0.215，左缘约 83px，满足本款横屏 5% 安全线。
- Alex 的 December 全长 0.36 秒、全不透明稳定段 0.16 秒，不适合引用卡。最终只取消该输入的这个关键词触发，没有改 ASR 时间，也没有人为延长声音。

## 不同画面的应用

| 输入及最终证据 | Application | 主文测量 | 结果与局限 |
| --- | --- | --- | --- |
| Deborah 英语实拍；`r8-adjusted/0` | 1280×720；scale .70；center(.215,.43)；总宽 .30 | 53.2px；2 行；无溢出；3 次引用稳定 .56–.62s | 左侧独立阅读区，避开人物、铭牌；覆盖部分植物背景 |
| 合作中文真实配音；`r8/1` | 1280×720；scale .75；center(.5,.55)；总宽 .42 | 57px；1–2 行；无溢出；4 次引用稳定 .70–2.06s | 黑色阅读背景，不计为额外实拍场景 |
| Alex 英语实拍；`r8-adjusted/2` | 1280×720；scale .60；center(.83,.28)；总宽 .25 | 45.6px；1–2 行；无溢出；取消短事件后 3 次引用稳定 .68–1.24s | 右上保留太阳图示和人物/手势；小空间不宜长段引用 |

这些输入使用不同 Application，不能拼成同一应用评分。稳定帧与所有最终引用的完整入退场帧已实际查看。主文数值来自浏览器加载本机字体后调用真实 `measureTextElement`，不是 CSS 设定值或理论字号。每组保存 `reading-measurements.json`、`motion-evidence.json` 和逐事件 `motion-*.jpg`。

## 暖房原片：完成分析与拒绝应用的闭环

来源 `input-78c44ead8594fa3c15d54b6c539702f4` r1；目标词范围 `[307,316)`，64.72–66.34 秒。根任务调用实际分析服务，再校正模型对字体、颜色及避让区域的推断，证据在 `/Users/zhengwei/Downloads/template-scene-analysis-20261007`。本任务也实际查看 6 张源画面。

冻结 r8 后将原话放上方，544×960、scale .95、center(.5,.165)、总宽 .76，实际导出主文 54.55px，两行、无溢出、稳定 1.42 秒。该实验避开脸、手势和原有下方文字，但**原片已经逐步强调同一观点，新增引用重复抢读**。根任务独立查看稳定全帧后也拒绝它作为推荐成片。

原生 history context `quotation-room-model-20261007-v1` 保留基线→上方调整→实际失败成片→最终不叠加。最后所有 `keyword=null`；`room/skipped-preview.json` 原生编译确认新增 overlay 为 0，`timingSource=measured_transcript`。最后一步是预览编译，没有再导出 75 秒视频；`room/item.json` 中的 MP4 仍是被拒绝的共存实验，不能标成最终成片。这不是盲测，也不是无字幕背景。

## 当前可核验的 82 分应用

批次 `production-a897a825803f4d25e2ca8545aa2cf6c9` 的同一个模板，对合作、阅读、产品三份已有真实配音使用完全相同的 Application：1280×720、scale .75、center(.5,.55)、headline 总宽 .42。样式在后两份输入应用前已冻结；它们以前用于其他样式，不能称全库未见输入。

11 条 3–10 字引用，主文均 57px，最多 2 行，未溢出。已查看三个成片的代表性完整稳定帧，以及 11 组完整入退场 170 帧联系表；稳定段 .46–2.06 秒。三个预览均实际 published、decodeVerified，音频通过技术校验。**没有试听或实际速度连续观看**，不能把逐帧检查称为实时观片。

| 维度 | 分数 | 主要依据与扣分 |
| --- | --- | --- |
| 构图 | 21/25 | 引用层级明确、文字可读；短长卡片视觉重心变化，黑底留白缺少完整场景构图 |
| 动效 | 20/25 | 全组同步进退无残留；最短稳定 .46s，原声配合和实时节奏未验收 |
| 素材 | 16/20 | 全原生文字与衬底，色彩一致；纸面仍偏普通纯色卡片，材质层次有限 |
| 适配 | 16/20 | 三输入同应用覆盖 3–10 字和两行；仅中文黑底横屏，不能覆盖其他位置实拍 |
| 编辑性 | 9/10 | 原生 inspect、保存、投影、编译保留结构；本轮未 UI 逐层手改后重导出 |

评审 ID `style-review-d6f0dff38a8424f772e660f5334f7dc32a87feef9e4267c1cde67964ab50c993`。`reading-review/review-request.json` 保存全部依据，`own-review-verified.json` 保存原生有效性回读。未完成原声实时阅读/听感是明确阻断项。背景范围窄、设计仍像普通引用卡，均不能以技术成功掩盖。

## 继续优化的方向

后续设计应直接处理 82 分扣分：建立更有辨识度的引用层级、克制纸面细节、引用符与正文的起止关系，以及进场/退场的职责分工。先在至少三种实际词长样例中比较候选，再决定是否更新保存版；不再以移动坐标作为主要设计改进。r8 与其 82 分证据保留，修改后的版本重新验收，不继承分数。

## revision 9：上方引文标记与统一 Application 复核

在保留 r8 的基础上，revision 9 增加了独立的大号上方开引号、正文纸卡下方的小收尾引号与两条短细线。开引号使用 `above` 关系依附实测纸卡，收尾标记使用 `below`，细线使用 `left/right` 关系依附收尾标记；五个元素仍在同一个可编辑 root group 中。开引号以 140ms 的轻微下落/缩放进入，收尾标记约 160ms 延迟显现，正文、纸卡与装饰共享根组淡入/位移和退出。

保存回执：`candidates/topmark-a/save-r9-receipt.json`，资产 `style-study-20260928-quotation`、revision **9**。实时读取确认 6 个图层（1 组、5 个元素）、4 条空间关系、4 个样式，原生 inspect 状态为 `structurally_valid`。可编辑性核对在 `r9-unified-review/editability-check.json`；没有烘焙参考图层。

为遵守“一个 Application”评审约束，批次 `production-45d551555c73c33211d56d9755fc62a8` 使用同一个横屏 Application：1280×720、`scale=.70`、`center=(.215,.43)`、`textWidths.headline=.30`。它实际发布了 Deborah 英语实拍、Alex 英语实拍和中文真实配音三份成片。三阶段代表帧与原尺寸文件在 `/Users/zhengwei/Downloads/quotation-design-20261007/r9-unified-review/`；统一左侧位置在 Alex 输入覆盖了一部分太阳图示，因此不能把该配置扩大为任意画面自动避让。

| revision 9 统一 Application | 结果 |
| --- | --- |
| Deborah | 约 53px、两行、无溢出；纸卡和收尾装饰在左侧植物/墙面，未压脸、铭牌或手 |
| Alex | 约 45.6px、单行、无溢出；人物主体保留，但太阳图示被部分覆盖 |
| 中文黑底 | 约 57px、两行、无溢出；上方开引号和下方细线层级清楚，背景场景信息有限 |

独立评审 ID `style-review-643bf4849d38c683a236649d210841c9a1fba4e525bd168ab93e37217e7771bf`，精确 revision 9/Application 当前有效：`current=true`、`evidenceCurrent=true`，总分 **88/100**，`meetsInternalThreshold=false`、`listened=false`。构图 22、动效 21、素材 18、适配 17、编辑性 10。扣分来自统一左侧配置压住 Alex 部分太阳图示、黑底输入的场景信息有限、纸卡材质仍偏平面，以及未完成随原声实时阅读/听感验收；阻断项已原样写入 `r9-unified-review/review-request.json`。这份 88 分不继承 r8 的 82 分，room 原片也不混入：该输入已有同义烧录花字，candidate A 实验保留在 `candidates/topmark-a-room/assessment.json` 并判定 `skip-for-room`。

revision 9 是新的可复用候选和可编辑生产版本，但尚未达到内部 90 分交付阈值。下一轮应先补充统一位置的候选评估与原声连续阅读，再决定是优化统一 Application，还是让 Agent 依据保护区域选择左右位置；不能把 per-case 的优秀位置结果改写成模板固定坐标。

## 纸卡质感候选 r10：先验证材质，位置仍由 Application 决定

为处理 r9 的“纸卡偏平面”扣分，保留 r9 原资产和当前 88 分评审，另复制出独立候选 `dynamic-f805bb65-888c-4b4c-84e5-42ef3b729ca7` revision 1。候选只增加 圆角值10（背景较短边一半的10%）、0.95 背景不透明度和低强度柔影（正文 blur 6 / opacity .20 / y 3；引号使用更低强度阴影），没有改变五层元素、左对齐、依附关系、事件时序或根组动效。

原生 inspect/save 回读和三份 `sample-preview` 均通过；实际生产批次 `production-eaf3ad81fe5ec585f78a206ba820a8e6` 已完成，3/3 preview `published`、`decodeVerified=true`、音频技术校验通过。证据目录为 `/Users/zhengwei/Downloads/quotation-design-20261007/candidates/quotation-depth-r10/`。已抽查三份成片的进入、稳定和退出代表帧，并提交独立阶段性评审 `style-review-2e7a71c71010199b6549516190d435a1fa2bf31e4cc635e0544b248937eaef50`：构图23、动效21、素材19、适配16、编辑性10，总分 **89/100**，`current=true`、`evidenceCurrent=true`、`meetsInternalThreshold=false`、`listened=false`。不能继承 r9 的 88 分，也不能写成通过。

### 通用 placement advice 方案（r9 基线）

候选位置不是模板字段。Agent 先从当前输入代表帧人工标出人物、手势、讲解图示和已有字幕保护区，再按可用空区排序调用原生 `placement-advice`。该接口只检查候选效果边界与调用者矩形是否相交，不做脸/手/图示检测；选中后必须再看实际成片。

本轮把 r9 的两个已查看画面写成可复现策略样例：Deborah 的候选顺序优先 `left-mid → right-mid → top-left ...`，得到 `left-mid`；Alex 因太阳图示在左侧，顺序优先 `right-mid → left-mid → top-right ...`，得到 `right-mid`。这解释了统一左侧导致的 Alex 图示覆盖，同时没有把右侧坐标写入库默认。保护区为人工从代表帧近似标注，可信度 `medium`，每次实际应用前仍需复核和扩大；完整请求、阻断项、降级顺序和验收证据在 `candidates/quotation-depth-r10/placement-strategy.json`。

若所有候选均被保护区阻断，先扩大保护区并重算，再在不低于阅读字号预算的前提下缩小本次 Application、换上下/侧边构图或跳过该样式；遇到同义烧录字继续 `skip-for-room`。本轮 qualityReview 已提交但保留两项阻断：未完成连续播放/原声试听，且三份样例均为黑底配音，尚未用无重复烧录字的真人或图示实拍验证材质和按保护区选位。只有补足这些证据并通过复评，才可把候选推进到90分交付。

## r11：冻结候选的三应用真实生产与系列评审

这里的 r11 是验证轮次，不是资产 revision。三个 case 始终使用纸卡候选 `dynamic-f805bb65-888c-4b4c-84e5-42ef3b729ca7` revision **1**，没有修改 r9 或候选默认定义。新 `review-series` 契约允许每个输入保留精确的独立 Application；旧单应用评审仍要求同一个 Application 的至少三份预览。

原始帧复查发现前述 `quotation-depth-r10/placement-strategy.json` 对 Alex 的肩手范围估计偏小，因此其中 `right-mid` 只是历史几何尝试，不能作为安全应用结论。r11 扩大人物头颈、肩手及左侧太阳保护区，选择右上空区；Deborah 根据右侧人物/铭牌和下方手势选择左上中部。完整矩形、来源与候选回执分别保存在各 case 的 `placement.json`，它们仍是人工代表帧标注，不是自动检测。

| case | 精确 Application | 生产批次 | 阶段评分 |
| --- | --- | --- | --- |
| Deborah / 7秒实拍 | scale .70，center(.22,.38)，headline width .32 | `production-9d567230df82840d255b679734db2af1` | **88**：22/21/18/17/10 |
| Alex / 14秒实拍与太阳图示 | scale .60，center(.81,.26)，headline width .25 | `production-5cc0c45222a823db392c4423cf5640f1` | **91**：24/22/18/17/10 |
| 中文合作 / 12.345秒真实配音黑底 | scale .75，center(.5,.52)，headline width .42 | `production-b1e388aede27e01f7b3d4a524055d2a3` | **90**：23/21/19/17/10 |

三批均 `published`、decode/audio 技术检查通过。本轮对8个关键词事件分别抽取6个时点：进入前、进入早期两帧、中段、退出早期与退出后，合计48张帧；已实际查看三张事件联系表及每片一张完整稳定帧。它是阶段抽查，不是逐帧全覆盖或实时连续观片。另回读实际可编辑工程，确认5类原生元素与根组/动画属性；没有把工程可读冒称逐个面板交互已验收。源与导出均可解码PCM，但哈希不完全相同，因此未断言无损，也不以音频技术指标代替听感。

系列评审 `style-review-series-7f6ecf570f4e328a3cc5686123e91089698b74c7d2a817aa6991dd1f632b08bf` 已通过原生 POST 保存和 GET 回读：3 cases、3 distinct hashes、`current=true`、`evidenceCurrent=true`，按最低分汇总为 **88**，`meetsInternalThreshold=false`、`listened=false`、`aestheticQualityVerified=false`。Alex 与中文的数值达到90也不能把系列或最终审美写成通过。

剩余具体缺陷：Deborah 的“I could find around the house”显示1.36秒，第二段“she never got upset”仅0.86秒，扣除进出场的稳定预算约0.60秒；尾引号及细线与植物背景分离偏弱。下一步应调整本次应用的阅读保持与空区位置并重出成片，若同类材质问题跨输入重复出现才升级冻结定义。Alex 的右上位置在所查事件帧中同时保留人物和太阳，纠正了旧统一左侧覆盖图示的问题。中文黑底仍不算第三类实拍背景。三个case都未完成原声感知试听。

完整证据：`/Users/zhengwei/Downloads/quotation-design-20261007/candidates/quotation-r11-inputs/`，包括冻结定义、三份manifest/Application、每case `review-draft.json`、`inspection-evidence.json`、`editable-structure.json`、实际MP4与事件帧，以及 `review-series-request.json` / `review-series-receipt.json` / `review-series-readback.json`。

## r12：Deborah 阅读保持与空墙应用返修

依据 r11 的具体失败，只修改本次Application：`centerY .38 → .26`、`minDisplaySeconds=2.0`，保留 `scale=.70`、`centerX=.22`、`headline width=.32`。同一候选 revision 1 未改动；原来的头部/服装铭牌/下方手势保护矩形保持，位置建议选择 `left-top-clear-wall`。第一关键词仍为 `[3,9)` 原句；最后语义段 `[20,26)` 改为 `neutral / keyword=null`，保留所有原始词与字幕分段。片尾只剩1.12秒，无法提供两秒阅读机会，因此跳过，而不是延长原声或伪造ASR。

实际批次 `production-ba2f53cac516076dc27880133afa3b43` 已发布。原生sample-preview与实际工程回读一致：仅一个引用事件、五个原生叶层，全部 **0.86–2.86秒**，早于下一原声词 **2.88秒**。输入转写与冻结定义回读不变，r11/r12导出解码PCM逐样本相同；这是技术一致性，不是感知试听。

检查新片0.80–2.967秒的66张30fps事件帧（左上ROI），另看被取消尾事件6张全画面与1.54秒稳定全幅。尾引号/细线已与植物分开、正文两行完整，约1.03–2.77秒可见完整稳定结构，2.867秒帧已退出，尾部保持原画面。此处66帧覆盖该事件前后，不代表全片每个位置的自动无碰撞证明，也不等于实际速度连续播放。

新Deborah阶段评分 **91 = 23/22/19/17/10**，保留未连续实时观片/原声试听阻断。与未改动的r11 Alex 91分、中文90分精确证据共同组成新series `style-review-series-8544612a9965029d2533ab2f1472d61ddf535b3c7ac28bc3f8ea3ca1068ee263`：最低 **90**，`current=true`、`evidenceCurrent=true`，但 `meetsInternalThreshold=false`、`listened=false`、`aestheticQualityVerified=false`。不能写为通过；此前r11最低88分及其失败结果继续保留。

应用历史context `quotation-deborah-reading-20261007-r12` 含基线→返修→验证结果3条不可变记录，均已回读可恢复；末条 `application-1530b2cfd28e5c767003f921c454fc8de7ceebf2be9dd0195518c8437cea9e27`。证据目录 `/Users/zhengwei/Downloads/quotation-design-20261007/candidates/quotation-r12-reading/` 包含精确历史/评审请求回执、预算与编译时段、源输入前后回读、实际成片和全部检查帧。仍待连续观片、原声试听、移动端和更多画幅验证；两秒保持是此case的应用预算，未变成全库默认。
