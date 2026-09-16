# Agents.md

## Architecture

An ongoing migration is moving all business logic into `rust/`. Each app under `apps/` is a UI shell — it owns rendering, interaction, and platform-specific concerns, but never owns logic. The UI framework for any given app is a replaceable detail.

### `rust/`

The single source of truth for all non-UI code. Everything platform-agnostic belongs here: no components, no hooks, no framework imports.

### `apps/`

Each app is a frontend that calls into Rust. Logic is never duplicated between apps — only UI is, because each platform may use an entirely different framework and language to build it.

- `web/` — Next.js
- `desktop/` — GPUI

## Web

### Product Footage Workbench

产品素材库的核心用途是统一管理素材，最终价值是“先打标，再为后续 AI 自动剪辑提供参考”。
素材描述、分类标签、商品识别和人工标记用于帮助后续 AI 理解素材内容、选择合适片段并参考用户的剪辑偏好。
当前素材库负责整理、打标、人工审核与保存这些信息，不在打标任务中执行后续自动剪辑的选材策略。
“保留原声”和“精选素材”属于后续 AI 剪辑参考的人工标记，默认不勾选，不由 AI 分析或修改。
精选素材“相比常规素材使用次数增加 10%”属于后续剪辑需求；当前仅记录精选标记，不调整使用次数或执行选材权重策略。

产品素材库（`/footage`）仅面向桌面端使用。设计、开发和验收以桌面浏览器为准，
不考虑移动端场景，不为该模块增加移动端适配或移动端测试要求。

原片导入成功分析后只生成一个连续分镜片段，长视频的分析窗口仅用于内部择优。
原片选定范围后以 25%、75% 两个时刻复核方向：提供已实际旋转的 0/90/180/270 度候选画面，由模型选择正立场景，Rust 映射为追加顺时针旋转。抽帧沿用解码器的元数据方向纠正，不重复叠加源旋转；优先人物、地面、桌面与固定文字，不能把商品翻转动作当作场景横倒。无法确认时不追加旋转并保留复核依据；直接上传分镜仍不加工。
直接上传分镜则保留整个文件，仅打标，不切分或加工。
原片分镜审核默认实时预览：入出点、裁切、旋转和调色修改直接更新预览，不触发保存、加工或入库。
原片分镜支持默认关闭的“镜头拉近”：在当前截取范围内，以旋转、裁切后的画面中心从 100% 匀速放大至设定的结束比例（默认 110%，可设 100% 至 200%），画幅不变，边缘裁掉。实时预览随播放或拖动进度更新，保存后最终加工包含该效果；直接上传分镜仍不开放画面加工。
调色以“原色”或“AI 调色”为基础，以左右排列的单选项切换，新生成分镜默认选中“原色”，已有素材保留已保存的调色模式。自定义参数始终可用并叠加在基础调色之后。自定义调色支持亮度、对比度、饱和度、曝光 EV、色温、色调、高光、阴影、白色色阶、黑色色阶和自然饱和度；重置仅恢复自定义参数，不切换基础模式。Rust 合成同一 LUT 供实时预览和最终加工使用。
实时预览与最终加工共用 Rust 裁切几何和自动调色 LUT；编辑区仅保留实时预览与原片切换，不常驻加工结果 Tab。
自动调色使用本机 Image-Adaptive-3DLUT 官方 sRGB 预训练模型（固定版本），Rust 对片段 20%、50%、80% 位置抽帧并平均模型预测，整段使用一套 LUT 避免逐帧闪色。
团队模式的 AI 调色预览由本机 Worker 执行：先校验当前团队库与分镜，再按需下载原片、校验 SHA-256 并复用本机缓存，使用本机模型生成 LUT；NAS 无需安装调色模型。缓存只保存可重建的媒体和 LUT，不建立独立的素材或标签数据库。
预览 WebGL 与导出 FFmpeg 共用同一 LUT 和三线性插值，按原片内容与截取范围缓存；模型失败明确报错，不回退旧曝光。Python 仅承载 PyTorch 模型推理，抽帧、缓存和导出逻辑在 Rust。
未入库原片的旧自动曝光升级为 AI 自动调色；已入库视频及历史快照不自动加工，仅修改元数据仍复用旧视频，修改画面参数或截取范围后使用新算法。
原片分镜有成功入库记录后提供“查看已入库视频”入口，播放最新成功入库的不可变发布版本；二次修改时明确标注上次入库版本不含当前修改。直接上传分镜不显示此加工对照入口，仍不开放加工参数。
人工审核仅需一次“确认打标”，原片分镜随后自动加工并入库，直接上传分镜直接入库，不再二次确认加工结果。
二次修改使用“保存打标结果”：仅元数据变动时复用视频，画面参数或入出点变动时自动重新加工并入库。
保存与确认使用同一事务和版本校验；加工失败可重试，自动入库意图随任务持久化。历史发布快照保持不可变。

视频导入按文件内容 SHA-256 在当前素材库内去重，与文件名、产品、批次、原片/分镜入口无关；不同素材库互不去重。
重复内容提示已有片段并跳过，不新增原片、分镜、分析或同步任务；历史重复记录不自动删除。
此规则识别字节相同的文件，不把重新编码、裁剪或相似画面自动视为重复。
原片列表提供删除入口；删除原片或任一关联分镜时，同一原片及其全部分镜在单个事务中从当前库移除，取消关联排队及失败任务，正在执行的任务结束前拒绝删除。沿用逻辑删除，保留磁盘文件和不可变历史引用，不联动删除 NAS 文件；已删除原片不参与上传去重、手工分镜或新同步任务，可重新上传。

商品识别配置在本地长期保存，支持多个商品，每个代称对应 1 至 6 张参考图。
商品配置包含可选“商品外观”描述，与参考图一同进入任务配置快照，辅助区分商品，不能替代视频中实际出现的证据。确认匹配后，除追加代称标签，还将分镜名称、画面描述及六项细节中明确指向该商品的称呼替换为代称，保留动作和场景；未确认或存在多商品歧义的称呼不替换。修改商品配置不自动回写历史素材，需重新分析打标后应用。
顶部标签设定固定为抓注意力、建立需求、展示商品、行动引导四类，小类由用户填写并在本地保存。
各类示例仅为输入框占位提示，不是默认标签；支持顿号、逗号或换行分隔，不允许同名小类跨类重复。
标签设定和分镜标签使用独立标签项，支持添加、修改与删除；编辑为草稿，显式保存后生效，保存包含尚未确认添加的输入内容。
每个小类可填写可选判断说明（最多 300 字），与标签一起显式保存并随分析任务快照使用；删除标签时清理其说明。结构标签必须有脚本作用证据，普通画面内容写入描述；出现商品不等于证明卖点，出现地点不等于建立需求。
标签设定另有固定“节日”类，小类由用户自定义。AI 仅从任务入队时配置的节日中选择，无匹配则不勾选节日属性；人工可修改节日属性和节日标签，取消属性时清空节日选择。
画面描述下方提供主体、动作、场景、构图、镜头、氛围六项细节描述；AI 分析填写，人工可修改，无法判断则留空。
原声、精选、节日属性、节日标签和细节描述随打标结果保存并进入发布快照；修改这些元数据不触发视频重新加工。历史素材不因新增字段自动重新分析。
分镜审核不再提供旧“适用位置”。标签栏分为自定义标签输入和按顶部四类配置的小类多选，列表与筛选使用新标签。
历史已勾选用途迁移为普通标签并去重，匹配当前配置的小类在选择区显示；保留历史发布快照。正在处理的分镜待任务结束后迁移。
新分析沿用四类用途的判断思路，只输出配置小类，在画面证据中保留每个匹配标签的可见依据和置信程度。没有匹配标签不阻止人工确认入库。
新分析另保存逐标签依据（标签、可见理由、原片时间范围和置信度），后端过滤越界/无效依据；标签旁可查看并定位。历史缺少逐标签依据时仅展示综合证据，不补造时间或标签理由。
修改截取范围保留原标签、商品和节日选择，并标记待复核；只改旋转、镜像、裁切或调色不清空商品身份。确认打标代表已复核当前范围。确认前提示范围变化、仍在使用的已删除配置标签和实际分析错误，不因标签为空阻止入库。
商品结果区分已匹配、未确认匹配、未配置和未记录；未确认匹配不等同于画面没有商品，任务失败单独提示。
新任务使用入队时的标签配置，AI 仅从已配置小类中选择匹配标签，未配置或无匹配则不添加；商品代称仍独立识别。
修改标签设定不回写历史分镜或已发布版本，人工审核仍可编辑分镜标签。
新素材自动对照参考图识别；原片仅识别最终选出的分镜时间范围，直接上传分镜识别全片。
可同时添加多个确认匹配的商品代称；无法确认时不添加。商品代称不能仅凭产品提示或参考图出现而打标。
历史分镜通过标题旁“重新分析打标”默认针对当前范围生成更新建议，使用最新保存的商品、标签和模型配置快照；不覆盖现有人工内容、范围或画面参数。建议按名称、描述、细节、标签、节日和无法证明的卖点逐项选择采纳，默认不选；版本或范围变化后拒绝过期建议。
另提供明确确认的“全部重新生成”：原片重新择取一个连续片段并分析画面参数，直接上传分镜保留全片仅打标；成功后替换旧分析与人工标签，但保留人工原声和精选标记，保留分镜 ID，不新增分镜，重新人工确认后入库。
失败保留旧分析内容并支持重试；修改配置不自动改历史标签，已发布历史快照不变。
任务使用入队时的参考图快照，重新识别结果需重新审核；已发布历史版本保持不变。

存储设置支持 NAS 与本机文件夹两种位置，二者同步内容和目录结构相同：原片及已入库分镜、封面和发布标签快照。
NAS 保留可选同步开关、独立任务队列、SMB 校验和失败重试。本机文件夹在导入及入库后直接同步，不复用 NAS 队列。
本机文件夹不是自动监控导入目录，不新增双向删除机制；`inbox` 仍通过用户手动读取导入。
本机文件夹与 NAS 均以目录区分独立素材库；空目录新建空库，已有素材库目录加载该库，不把当前库复制到新目录。
无素材库标识的普通视频目录首次打开时递归导入视频为原片，复用库内内容去重；忽略隐藏目录与符号链接，不修改原文件。
每个库独立保存素材、任务、标签和商品配置；模型凭据仍保留在机器级配置。目录的 `.moirai-library` 标识关联独立本机数据库，切库时保存原库快照到原目录并暂停原库任务；回到该库恢复任务。
团队模式由一个 Rust 服务独占数据库，成员通过接口访问。库数据库与缓存可位于 NAS Docker 的本地卷 `.moirai-library/data`，不能直接放在 SMB/NFS 客户端挂载上。服务持有库独占锁；旧库使用白名单快照迁移并重写媒体路径，机器凭据不得进入共享目录。目录离线时拒绝写入，不回退到陈旧本机副本。部署入口见 `deploy/footage/README.md`。
已打开的旧版本素材库首次切换前绑定原目录，保留历史数据。切库后刷新页面并拒绝旧页面跨库写入；目录不可用不能删除本机缓存或应用内素材。

### React

- Read components before using them. They may already apply classes, which affects what you need to pass and how to override them.

## Same-Directory Parallel Work

本项目允许多个 Codex 任务在同一个工作目录并行修改，以高效并行为优先：

- 开始编辑前快速查看目标文件的最新内容，尽量按文件或模块分工；发现冲突时在现有修改上继续编辑，不覆盖其他任务。
- 服务重启前先确认是否会影响其他任务；能复用现有服务就复用，必须重启时只重启自己启动的进程，或先告知并协调其他任务。
- 测试和临时文件尽量使用任务专属路径，避免写入共享数据库、NAS 或真实素材；完成后清理自己产生的临时文件。
- 收尾运行必要的检查（至少 `git diff --check`），跨模块改动再由主任务统一跑完整测试。

## Local Startup and Optional Services

When asked to install or start this project, first inspect existing local configuration.
On first setup, ask whether the user wants to configure (1) an optional mounted team
NAS directory and (2) an LLM Base URL and model for footage analysis. Respect an
existing answer; do not repeatedly ask or overwrite existing credentials. NAS is
optional and the workbench must remain usable locally. Explain that automatic
analysis requires a compatible video model; skipping LLM configuration still allows
local import and manual review. Never ask the user to paste API keys into chat:
use the hidden terminal prompt in `bun run setup:footage`.

Use `bun run setup:local` for first startup; it prompts for optional integrations,
checks media tools, builds and starts the Rust footage service and starts the web
editor. Use `bun run setup:footage` to reconfigure later. For explicitly requested
unattended local setup use `bun run setup:local --local`. See
`rust/crates/footage/README.md` for prerequisites and endpoint compatibility.
Keep paths machine-local, credentials outside the repository, and NAS sync disabled
until the user enables it. Verify `/api/footage/state` and `/footage` after startup;
report missing dependencies or untested model connectivity instead of claiming the
entire AI workflow works. Do not upload user videos just to test an endpoint.

## Smart Edit Protocol

Before controlling a Moirai Cut project, read
[`docs/agent-smart-edit.md`](docs/agent-smart-edit.md). It defines the two Codex
entry points, `opencut://` context schema, scene/time-sequence inspection,
multimodal media catalog, revision/idempotency protocol, and the exact tool
order for iterative human/Agent editing.
