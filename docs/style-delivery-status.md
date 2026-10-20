# 样式工作台交付状态（2026-09-28）

本页区分整片模板与可组合样式，纠正最近进度说明中“20 个模板尚未完成”的笼统表述。旧整片模板已有 20 款当前版本内部评分；这不代表后续重心转向的重点词、花字、字幕和装饰样式已经同样验收。

## 最新复核（2026-09-29）

当前只读审计：`/Users/zhengwei/Downloads/style-delivery-audit-20260929-v5.json`。旧整片模板仍有20款当前版本内部评分90–92（10款90、8款91、2款92），60份磁盘视频哈希与评审/批次匹配；全部未试听，本轮没有重新进行视觉评分。

独立样式现有26个使用中条目、48个已归档条目。10份历史应用评审中，4份仍对应使用中样式的当前版本和有效证据：青色双笔触86、青色弹字84、双引号79、消散重影82；这4份评审的12个磁盘视频哈希独立复核通过。清晰逐词字幕已更新v3，v2的86分与v1的84分保留为历史，不继承到v3。没有当前应用达到90分，22个使用中条目没有当前应用评审。条目中包含候选变体，不能将26个条目视为26种独立风格。

因此“旧20款内部评分达到90”和“独立样式质感/适配尚未验收”必须分别报告。下面的9月28日清单是历史快照，后续按文末逐次记录追溯；不能从旧模板分数推导新样式已达标，也不能笼统说旧20款没有评分或成片。

## 历史快照（2026-09-28）

| 对象 | 本次核验 | 不能据此推导的结论 |
| --- | --- | --- |
| 整片模板 | 实时目录有 20 款当前版本内部评分 90–92，评审无登记阻断项 | 分数不等于用户审美认可或开拍同等质感 |
| 对应成片 | 60 份磁盘视频的 SHA-256 与评审、生产项逐一匹配；版本一致 | 本次没有重新逐帧观看、完整解码或试听 |
| 独立样式库 | 最新回读：19 个使用中条目、42 个已归档条目 | 17 个已分类样式，2 个未分类固定文字条目；条目数不等于独立风格数 |
| 创作与重建候选 | 18 个带 style-/live- 标识的条目，见下表 | 其中存在衍生版本，不能直接计为 18 种不同风格；没有继承旧模板评分 |
| 最近组合试验 | 字幕、重点词、图标经两轮三输入导出；修正固定图标间距和长词字号 | 仅两个同场景英文片段与一个中文音频黑底，不是广泛实拍适配 |

只读复核脚本：`scripts/templates/audit-current-style-delivery.mjs`。本机结果：`/Users/zhengwei/Downloads/style-delivery-audit-2026-09-28.json`。旧评分依据及限制见 `docs/template-delivery-final.md`；所有评分记录仍为 `listened:false`。

清理后的复核结果：`/Users/zhengwei/Downloads/style-delivery-audit-after-cleanup-2026-09-28.json`，20 款旧模板、60 份评审视频依然匹配。17 个已确认脚本来源的历史验证条目已归档；本轮预览等待失败的 1 个样例在原因定位并回归通过后归档。恢复清单、原定义及归档回执保存在 `Downloads/style-fixture-archive-2026-09-28.json`。另有本轮成功创建的 4 个测试样例自动归档，因此归档总数从 15 增加到 37；没有删除定义或媒体。

新建用途和完整编辑流程验证脚本均接入 `archive-test-style.mjs`：仅在成功后归档本次创建的条目，失败时保留现场。新建测试改为唯一名称，避免复用或修改已有样例；更新了列表选择器，并等待预览加载完成后再验证定位帧。实际回归已通过三种用途新建、搜索、保存、非空预览、手机布局，以及图层添加/复制/删除、独立样式与动效编辑、保存回读、撤销和播放；原有库定义保持不变。

## 样式候选清单

| 样式 | 当前版本 | 正式独立样式评审 |
| --- | ---: | --- |
| 小小庆祝 · 彩纸散开 | 2 | 待补 |
| 居家学习 · 插画浮入 | 1 | 待补 |
| 灵感提示 · 灯泡轻弹 | 1 | 待补 |
| 信息提示 · 青色侧标 | 2 | 待补 |
| 观点引用 · 双引号 | 5 | 中央横屏应用阶段性 79/100，手势遮挡待处理；其他应用另计 |
| 温暖批注 · 文字边缘星光 | 2 | 待补 |
| 轻量讲述 · 宋体重点 | 2 | 待补 |
| 入场强调 · 消散重影 | 1 | 待补 |
| 便签批注 · 纸签贴入 | 4 | 当前横屏应用阶段性 85/100，仍需完善；v2 的 82/100 保留为历史 |
| 重点标记 · 闪亮跟随 | 3 | 待补 |
| 重点标记 · 自适应底色 | 3 | 待补 |
| 重点标记 · 色块侧签 | 2 | 待补 |
| 综艺强调 · 双层花字 | 3 | 待补 |
| 清晰讲述 · 逐词字幕 | 3 | 三实拍 97 词高亮验证；去除影响短词阅读的整句透明度渐变，正式评审待补 |
| 参考实测 · 青色强调字 | 2 | 固定文字参考，非动态关键词样式 |
| 口播强调 · 青色弹字 | 1 | 待补 |
| 方向提示 · 箭头轻推 | 2 | 待补 |
| 圈选提示 · 双圈强调 | 2 | 待补 |

## 后续验收缺口

1. 现有评分契约绑定整片模板 revision、批次和成片哈希。独立样式尚需建立对应版本与应用实例的证据关联，不能展示来源模板的旧分数。
2. 验证样例仍混在使用中列表；应在确认脚本来源后归档，保留恢复入口，不按名称批量删除。
3. 样式适配需要补不同实拍构图、竖屏、长短文案与组合冲突检查；已有中文实拍参考含烧录字幕，不应当作无字幕原片直接叠加验收。
4. 创作候选要按可见的排版、素材结构、运动区别筛选，而非按条目数和配色变体计数。每项评分要与具体当前版本及实看片段关联。

本页是状态校准，不是新增完成声明；工作台易用性与样式质量优化目标仍在进行。

## 组合试映入口（2026-09-28）

“用声音试效果”页增加叠加样式选择、逐项区域设置与移除。选择的版本、实例标识、区域写入链接；刷新后复用相同组合。主样式调用 Rust application，额外样式依次调用 Rust insert；前端不合并元素、不重写时间事件。组合完成前不启用预览或生产表单，失败显示服务错误。主样式的字幕行宽控件仅在主样式有字幕时显示，不暗示可以调整额外字幕。

`verify-effect-trial-composition.mjs` 验证了 signal + caption + idea 五个原生元素、保留 active-word treatment、区域切换、链接刷新、实际非空渲染、移除与 1280/390px 无横向溢出；所有库定义与归档记录前后相同。手机长页截图已检查，类型检查通过。修复了试映实例 ID 最初超过原生 40 字符限制的问题。此轮没有从新界面提交完整 MP4 生产；此前相同 application/insert 链的组合 MP4 证据不能替代该界面的提交验证。

当前额外样式可选完整/上半/下半区域，尚无逐项精细位置与比例控制；组合也未自动避让或按语义决定装饰用途。这些限制应继续通过实际试映与交互完善。

### 页面提交与自定区域补验

后续已为每项叠加样式增加自定区域（左侧、顶部、宽度、高度，均为画布比例），通过现有 Rust insert 的 placement 执行；链接保留区域，刷新后恢复。超界区域由原生验证拒绝。区域缩放会等比缩放样式整体，不等于独立改变字体与字幕行宽。

`verify-composed-trial-export.mjs` 从真实页面添加样式、调整区域、刷新、选择原声输入、标注三段重点，再点击生成草稿预览。没有拦截或模拟生产接口。最终批次 `production-ebe1b627278a5dee3e697604209b7279` 成功导出一个 7 秒 MP4，提交含五个独立元素、实测 transcript revision 1 和三段关键词；库定义及归档记录保持不变。类型检查通过。文件和提交链接在 `/Users/zhengwei/Downloads/composed-trial-ui-final-2026-09-28/`。

三轮试映暴露并区分了真实问题：首批 `production-32229cfe438f4eb894b0764b123ba713` 将字幕作为半屏附加样式，字号过小；第二批 `production-7c791d199f8e520a5a34b6422b255811` 以字幕为主样式恢复其字号，但全画布重点区遮到下脸；最终通过自定区域将重点区下移。已检查三版全片 2fps 联系表，最终 sampled frames 中字幕、重点区和人脸分开。图标仍是固定应用位置，没有从界面建立文字边界依附。

剩余问题：附加字幕需要支持独立字号/行宽与位置，避免缩小区域时把字幕一起缩小；也需要从界面设置跨样式的文字边界依附。单一采访、短关键词和一次最终导出不能证明任意组合合格。未试听、未给新组合审美评分。

### 附加样式独立大小与字幕行宽已接通

Rust `Insert` 新增可选 `transform` 与 `captionWidth`，提供时要求 `placement`。`insert_configured` 复用现有 `application` 投影，再经过同一套命名隔离与合并逻辑；未提供新字段的旧插入行为保持原样。主模板原有元素及素材定义不变，版本错配、重复实例、非法行宽等被拒绝。MCP `insert_dynamic_asset` 暴露同一契约，不在 Web 重做缩放业务逻辑。

每项附加样式现在可开启独立位置与大小；含 sentence 文字的附加样式还可单独控制字幕行宽。所有参数写入试映链接并刷新恢复。手机截图发现横排控件被挤成窄列，已改为分项卡片布局；重新查看 390px 截图确认标签、数字输入及移除按钮可读，页面无横向溢出。

验证：22 项 dynamic_asset Rust 测试通过，包含新增的行宽变化不缩放字号/动效、原元素不变、版本/冲突/边界拒绝；MCP 参数传递与错误保留测试、Web 类型检查通过。真实页面验证将附加字幕行宽 0.84→0.6→0.84，字体样式和动效未变，刷新后保持。库定义与归档记录前后相同。

批次 `production-4b48f0083ac61425c9504a0a4997def0` 从页面实际提交并成功导出，重新走“重点词主样式 + 附加字幕 + 图标”的原始出错路径。字幕独立 scale 0.65、centerY 0.9、captionWidth 0.84；技术解码/音频覆盖通过，已查看 4.2s 成片帧确认附加字幕字号恢复、与重点词分区。证据：`/Users/zhengwei/Downloads/composed-trial-ui-independent-caption-2026-09-28/`。这关闭了附加字幕尺寸问题；跨样式文字边界依附的界面入口、更多构图与长句适配、正式样式审美评审仍待补齐。

### 跨样式文字依附：页面配置与实际导出

Rust Insert 增加 attachments：来源必须为本次插入的唯一元素，目标必须为既有文字，要求 text_box 与 followMotion。依附替换来源原有空间关系并由原生完整校验；主模板元素和保存的素材定义不变。MCP 描述及实时 schema 暴露相同字段。

试映页每项样式的“跟随文字边界”展开后，可逐层选择主样式或前面样式里的文字，调整方向、间距及偏移；取消后重新从保存版本应用，恢复原布局。参数存入链接。移除被依附的样式时清除相关覆盖关系并明确提示。灯泡与底盘可分别设置，未提供自动居中组合或自动避让。

验证：23 项原生 dynamic_asset 测试通过；MCP 传递和 Web 类型检查通过。真实浏览器验证依附 API 回包、链接刷新、移除被跟随字幕后的关系清除、实际渲染与 1280/390px 无横向溢出。库定义及归档记录前后相同。

真实页面提交批次 production-cc38a64530039432f4a41cf5d9aca5f4 成功导出 1 个 7 秒 MP4，五个元素，灯泡和底盘均依附 headline 的文字边界。检查全片 2fps 联系表、第一处入场连续帧及 4.2s 稳定帧：图标随 love、good thing、workers’ lives 的文字宽度改变位置，稳定帧没有遮脸，字幕在底部。灯泡视觉偏大，尚需更多构图与长词压力验证；没有试听或正式审美评分。证据：/Users/zhengwei/Downloads/composed-trial-ui-attachments-2026-09-28/。旧整片模板的 90–92 分不代表这套独立样式已获同等验收。

### 三画幅适配与原视频焦点闭环

`verify-style-format-adaptation.mjs` 使用实测的两段英文访谈和一段中文纯音频，生成横屏/竖屏/方屏共 9 个隔离预览；关键词候选改为最多两行，灯泡按 0.1 画布宽度的区域应用（实际图层更小），图标与底盘分别依附。批次 production-7a80ddcd13f5e431c60370ee2a8a20ff 全部成功，解码/音频流技术检查通过。已查看九个最后关键词稳定帧及横屏、竖屏长英文原尺寸帧，长英文和中文均可换成两行，未见文字或图标越界。两行改动当前只在候选试映模板，尚未更新库内 signal revision 1；没有据此宣称九个新模板完成。

适配暴露并修复原生问题：`transform_projection` 原先也缩放非文字样式的闲置 fontSize，导致小图标触发字号下限错误。现在仅对实际被文字引用的样式缩放字号，真实文字继续受原有可读性约束。新增回归检查小装饰成功、源码不变及小文字仍拒绝；修正两项旧测试，让缩放断言针对真实被文字引用的样式而非闲置样式。24 项 dynamic_asset 测试通过，已在无运行任务时更新本地服务；组合浏览器回归继续通过。

首轮竖屏裁切把人物右侧裁掉，属于素材构图问题。提取复用已有 FocusFields UI，在生产样例的“原视频构图”中增加焦点控制，仅视频显示。焦点放在 sample 内，实时 sample-preview 与生产 author 传递同一字段，不改变样式或原视频。类型检查通过。真实页面验证设置 x=0.64，检查预览请求成功及生产载荷保留该值；批次 production-77b11398ae9a4fbbcb41863da812d49e 成功导出，已查看 4.2s 竖屏帧，面部完整、花字和字幕分区。此控件是手动焦点，不是自动人脸跟踪。

证据：/Users/zhengwei/Downloads/style-format-adaptation-2026-09-28/review.html、long-montage.jpg；/Users/zhengwei/Downloads/style-portrait-focus-ui-2026-09-28/portrait-focused.mp4。尚未试听，九片的全时段连续视觉检查未完成，中文只有黑底音频不证明复杂画面适配；正式独立样式审美评审、更多场景和自动避让仍未完成。

### 两行重点词正式写回样式库

基于上一轮三画幅长词稳定帧检查，将 style-study-20260928-signal 从 revision 1 保存为 revision 2，仅将 headline-style.maxLines 从 1 调整为 2。保存使用 baseRevision=1 和幂等键；旧 revision 1 的 application 仍返回 maxLines=1，新 revision 2 返回 2，未覆盖历史版本。备份及保存回执在 style-format-adaptation-2026-09-28/signal-before.json 和 signal-save.json。

同步 author-editorial-styles.mjs 的 signal 创作定义，避免重跑作者脚本把此修订改回一行；verify-style-format-adaptation.mjs 改为使用保存的 v2，不再直接修改试映副本。新增 verify-saved-multiline-style.mjs，实际浏览器检查属性面板为 2、刷新仍为 2、“用声音试效果”提交 assetRevision=2 且原生投影 maxLines=2，测试前后库内容一致。已通过。该验证证明库到工作台到试映的版本闭环，不代表完整审美验收。

再次检查输入库：75 秒 input-78c44ead8594fa3c15d54b6c539702f4 虽名为用户原片，但抽取每 10 秒画面可见已烧录的青色字幕、红色花字及版式变化。不能把它当干净中文视频叠加后宣称场景多样性通过。抽帧证据 /tmp/original-scene-review.jpg；现有干净英文样例仍主要来自同一访谈。后续应补充干净不同场景或明确分离声音/画面来源的适配样例，并继续独立样式审美评审。

### 组合试映保存为独立可编辑样式

试映页新增组合名称与“保存组合为新样式”。Rust `/dynamic-assets/capture` 将应用中的可编辑视觉图层、样式、资源槽/绑定、处理效果和文字依附转换成 revision 0 定义，再经已有 CAS/幂等保存接口入库；原素材定义不变。AI 通过 capture_dynamic_asset 和 save_dynamic_asset 使用相同契约。样例原声、转写与原视频焦点不进入样式。保存的是独立副本，界面明确说明原样式后续变化不自动同步。

Capture 对样式模型不能保存的场景调度、编排组、转场等关系明确拒绝，不悄悄丢弃。应用阶段已展开的图层保持独立编辑；本功能不宣称完整整片模板都能转换为动态资产。保存失败重试在相同页面/同一组合下复用捕获定义和幂等键，保存时阻止组合控件编辑及普通链接离开。

25 项原生 dynamic_asset 测试、MCP capture 传输测试、Web 类型检查通过。原生测试覆盖图层、样式、动画、高亮、文字关系与资源结构保存，并拒绝不能保留的组。已更新空闲本地服务。

真实网页验证通过组合试映→命名保存→打开库中样式→重新声音试映。五个元素、三条关系和 text_highlight treatment 保留；0.35、0.5、0.65、0.9、1.5 秒五帧保存前后 PNG 完全相同，涵盖关键字入场及字幕高亮变化。所有旧素材逐项未变。两个成功验证资产均自动归档，最新 dynamic-49295e19-fe9e-42e1-a84f-cc99add645ef。证据在 /Users/zhengwei/Downloads/style-combination-save-2026-09-28/。这关闭组合只能靠链接复用的缺口；尚未以新组合资产进行独立的完整 MP4 回归，正式审美评审仍未完成。

### 保存组合后的完整 MP4 回归

从库内组合 dynamic-49295e19-fe9e-42e1-a84f-cc99add645ef revision 1 打开声音试映，重新选择真实 7 秒访谈输入、标注三段关键词并从页面提交。批次 production-e43fcb23db4cf66b951ab428373d8514 成功导出，五个元素、三条文字依附及 transcript revision 1 保留；没有修改库记录或原工程。

与保存前 production-cc38a64530039432f4a41cf5d9aca5f4 的 MP4 对照：FFmpeg 解码逐帧 framemd5 全部 211 帧一致，304 个解码音频块及时间校验一致。验证不只覆盖静态预览，也覆盖整个 7 秒导出的视觉/声音数据复现。未额外试听，不据此给审美评分。证据 /Users/zhengwei/Downloads/saved-combination-export-2026-09-28/，含 MP4、提交/批次和 comparison.json。脚本 verify-saved-combination-export.mjs、review-saved-combination-export.mjs。

补充 Capture 边界：对顶层 layoutEntrances/transitionRules 同样拒绝，防止只检查 composition 而丢掉场景转场。原生回归使用有效的双布局 dissolve 模板确认明确拒绝；测试通过，服务在队列空闲后更新。

### 样式视觉盘点与纸签差异化

对使用中的 15 个 style-/live- 候选，在真实工作台用相同示例抓取 0.5/0.7 秒预览，库数据前后不变。证据 /Users/zhengwei/Downloads/active-style-gallery-2026-09-28/manifest.json 与 gallery.jpg。观察到便签、adaptive、marker、sparkle-follow 多款依赖黄绿色底块，不能将条目数量视为等量的设计差异；静态盘点也不能证明动效或成片审美合格。

将 style-study-20260924-note 修订为 v2“便签批注 · 纸签贴入”：暖色纸面、棕色偏移底层、最多两行文字，加一层独立可编辑胶带矩形，按文字边界依附顶部并跟随动作。保留原生 opacity/rotation/y 动画，作者脚本同步。旧 v1 保留。新结构与绿底重点标记有可观察差异，不只是改名或换色。

批次 production-75a6f9e1b2fb4e5e73874d6dc82b1449 的三份实测输入全部导出并通过解码/音频流校验。查看新版工作台稳定帧、中英文最长重点词原尺寸帧、英文长片全程 2fps 联系表以及首个英文关键词连续 30fps 入退场帧：纸面、底层和胶带组合保留，两行文字可读，所查画面未遮脸。纯关键词样式没有附加完整字幕，属于独立样式测试；没有据此授予 90+ 审美分。中文仍是音频黑底，同景英文不能证明场景多样性。证据 /Users/zhengwei/Downloads/paper-note-refinement-2026-09-28/，含三段 MP4、稳定帧、入场联系表及 review.html。

### 增加原生箭头与双圈装饰

新增 style-study-20260928-arrow“方向提示 · 箭头轻推”和 style-study-20260928-rings“圈选提示 · 双圈强调”。箭头由六层可编辑矩形构成（箭杆、两翼及其深色衬边），统一位移/透明度动作；双圈由四层椭圆描边构成，内部透明，使用旋转/缩放/透明度普通关键帧。没有外部素材、烘焙图片或自动追踪。最终库内 v2 仅将 v1 英文图层标签改成中文；application 比较证明 elements（除 description）、styles、composition、canvas 和资源字段完全相同，回执 label-revision-check.json。

箭头试映实际组合了已保存的青色重点词 v2 与逐词字幕 v2，六个箭头图层分别以相对偏移附着到同一重点词的文字边界，保持整体形状并跟随文字宽度。双圈样例是手动摆放的画面圈选：尺寸固定、可编辑，不自动匹配词宽或追踪对象，不应将重复出现在人物附近理解为语义选择已通过。

批次 production-2ac8ed617211dca46ec8751847771da4 使用装饰 v1 生成六个实测声音样例，全部导出并通过技术解码/音频流校验。已查看工作台两款稳定帧、箭头配长英文两行文字及双圈原尺寸成片帧：箭头指向关键词，字幕在底部；双圈中空、边缘可见。尚未完成六段连续视觉/听感验收，不授予 90+ 分。资料 /Users/zhengwei/Downloads/native-attention-marks-2026-09-28/；item-0.json、item-1.json 内含实际批次模板；designs.json/effects.json 是后来中文标签 v2 的待重新提交作者输出，应以批次 item.output.template 判断已导出的版本。输入仍是同景英文访谈及中文纯音频，不能据此宣称更多真实场景适配完成。

### 样式列表增加真实渲染缩略图与手机卡片

样式列表现在显示版本对应的预览缩略图，复用 EffectPreview 的原生 preview 编译和共享 CanvasRenderer；没有在 Web 重做样式业务逻辑。缩略图模式不输出播放/编辑控件。IntersectionObserver 按可见区域触发，最多同时准备两个缩略图，内存缓存按 asset id/revision 索引并限制 80 项。失败保留“点开查看”，仍可正常选择。预览裁掉透明/黑色空白边缘，解决箭头等小装饰在完整画板缩略图中难以辨认的问题；它展示默认示例的一个原生建议时刻，不代表完整动效或成片验收。

手机截图发现旧 max-height 把列表压成半行，改为 106px 高的横向卡片区，完整保留缩略图、名称与用途；桌面仍为侧栏列表。真实浏览器验证缩略图出现、重复筛选命中缓存、点击后正确进入可编辑样式、箭头墨迹在 192px 源缩略图内宽度至少 110px、390px 卡片完整可见/可滚动以及 1280/390 无页面横向溢出。无 pageerror，所有库数据测试前后不变；Web 类型检查通过。已查看 /tmp/style-thumbnail-cards-final.png。

另外按已存在的脚本/文档来源记录归档三个验证素材：text-attachment-validation-20260928、effect-follow-validation-20260923、dynamic-ac330f19-affe-4aed-b3c4-a6b63f2c85ae。均保留定义和历史版本，回读确认定义未变。备份/回执 /Users/zhengwei/Downloads/remaining-style-fixtures-2026-09-28.json。未删除媒体，也未把它们计入合格样式数量。

### 青色参考花字改为可复用关键词样式并验证

保留 live-cyan-caption-20260919 revision 2 参考定义，另存 style-study-20260928-cyan-impact revision 1“口播强调 · 青色弹字”。关键词绑定取代原固定“全域推广”，移除原片 0.2 秒偏移；入场/退场使用 0.16/0.1 秒，最多两行，黑色描边加粗，原缩放曲线拆成互不冲突的 X/Y 比例动画。样式与独立逐词字幕组合，使用三份已有实测声音输入；没有修改原工程。

批次 production-b6266fe3ea53b6e9665a87bfa17c008c 成功导出三片，解码和音频流校验通过。新增 verify-cyan-keyword-timing.mjs 从真实批次编译文档对照输入词时间：14 处关键词的内容、开始、持续时间全部通过（120000 ticks/秒容差一 tick），保留独立 caption--headline 层。文本断言尊重 Rust 现有的句末标点去除规则，不移除词内标点。回读确认参考定义未变、新样式与已验收版本一致。

已查看中文/长英文最后关键词原尺寸帧，以及首个英文关键词 30fps 入退场联系表：两行正常显示，与底部字幕分区，英文所查帧没有遮脸。三段全片 2fps 联系表已生成，但此轮未逐张完成视觉验收；未试听或授予审美分数。中文仍为黑底音频，英文仍为同一访谈场景；不宣称复杂场景或自动关键词选择通过（关键词是作者标注）。证据 /Users/zhengwei/Downloads/cyan-keyword-style-2026-09-28/，含 review.html、三个 MP4、timing-verification.json 和 entrance.jpg。

### 工作台明确样式、内容绑定与声音时间的边界

在样式用途处解释分类可多选，花字外观与重点词/句子绑定独立；文字图层根据当前 binding 显示具体应用说明，提醒固定文字不会随新文案替换。示例预览明确其节奏仅用于检查外观与动效；真实 TTS/原声应用生成时间。高级时间规则说明上限限制的是单次展示，不是成片总时长。仅调整 UI 说明，没有复制 Rust 编排逻辑。

Web 类型检查通过；临时真实浏览器检查青色弹字绑定仍为 keyword、对应说明出现，1280/390px 无页面横向溢出、无 pageerror，并等到共享预览 Canvas 可见。已查看手机截图 /tmp/style-guidance-mobile.png。此项是上手引导改进，不构成整体可用性或审美验收。

### 手机点选样式后直接查看完整预览

完整 Canvas 截图核实上一轮首屏黑色区域不是选帧错误：Rust 已建议 0.6 秒，画布中文字正常，但原布局画布从页面 y=667 延伸到 y=1171，重点词落在 900px 首屏之外。保留原生代表帧算法。手机点选样式时将详情滚入视野，增加“返回样式列表”；桌面不自动滚动、不显示此按钮，未保存修改仍先阻止切换。

verify-style-mobile-navigation.mjs 真实浏览器验证通过：390×900 点选后完整画布位于视口内、返回后列表顶端可见、未保存名称未丢失、撤销有效、桌面返回按钮隐藏、无 pageerror、库记录前后相同。类型检查通过。已查看 /tmp/style-mobile-navigation.png，重点词和播放进度完整可见；这是移动端导航改进，不将其当作更广范围的视觉适配验收。


### 当前库绑定盘点及六款单行样式长文案检查

实时回读为 19 个使用中、42 个已归档条目。17 个有用途分类：文字主体按 keyword/sentence 绑定，固定双引号属于有意保留的装饰；另两个未分类条目是固定参考“参考实测 · 青色强调字”和“验收 · 双层花字”。后者尚未证明具体创建来源，本轮不归档或改写。更新页首清单版本，历史事件段落保留当时数值。

review-active-style-gallery.mjs 增加 EXAMPLE_TEXT/EXAMPLE_KEYWORD 参数。对 measured-sparkle、echo、sparkle-follow、adaptive、marker、offset 六款单行样式分别输入“真正打动你的地方”和“huge impact on my life”，每款每语言保存 0.5/0.7 秒实际工作台 Canvas，共 24 PNG；两次运行确认库数据前后不变。查看两张 0.7 秒总览，中文八字与英文五词完整，所查稳定帧未见裁切或装饰错位，因此不为追求统一参数而盲目改两行。三种黄绿色标记仍有明显风格重叠，不视为三份独立的 90+ 设计。

本次是合成时间样例的稳定帧压力检查，不证明完整动效、声音同步或真实画面可读性。资料在 Downloads/style-long-keyword-audit-2026-09-28/ 和 style-long-english-audit-2026-09-28/；前者 audit.json 关联当前定义版本/哈希及 24 张图片哈希，library-snapshot.json 保留盘点原始响应。正式独立样式评分仍待建立和完成。

### 独立样式应用评审契约接通

新增 Rust style_reviews，复用五项评分与成片证据校验，先按当前样式版本和 Application 重建完整模板，与实际生产 output.template 对比（仅模板 ID/revision 可变）。记录来源/应用哈希；读取重新验证，版本、图结构或成片证据变化会使 current=false。普通生产分配的新模板 revision 与预览批次 revision 均有测试覆盖。组合须先捕获保存，避免把额外图层的质量冒记到单一样式。

GET/POST dynamic-assets/reviews、动态 schema、MCP review_dynamic_asset/list_dynamic_asset_reviews 和工作台“应用验收”详情接通。UI 显示该版本各具体应用的内部评分、范围、限制和试听状态；未保存编辑明确提示仅对应保存版。无记录显示待评审，没有自动沿用旧整片评分或伪造 90+。

4 项新旧原生评审测试、MCP 转发检查、Web 类型检查通过。实际 API 使用青色弹字＋字幕批次验证单一样式关联被拒绝且评审库不变；浏览器待评审与未保存提醒通过，样式数据未变。脚本 verify-style-review-surface.mjs。使用内存测试验证的成功写入不等于真实样式已获评分；后续仍须正式观片、试听与更多场景。接口顺序和边界见 docs/style-review-protocol.md。


### 第一份真实样式应用评审：纸签 v2

检查三份实际纸签导出的全程 2fps 联系表、三份首关键词连续入场帧，结合已查最长关键词稳定帧，为横屏 1280×720、scale 0.85、center (0.5,0.8) 应用提交阶段性评审：构图 22/25、动效 20/25、素材 17/20、适配 14/20、编辑性 9/10，总计 82，meetsInternalThreshold=false。所查帧文字清晰、不遮脸、两行可读；纸签层次较弱，短词入退场占比高。未试听，缺少不同实拍场景、竖屏与字幕组合验证，以及所有边界的连续检查，明确登记两项最终验收阻断。不是为达 90 分倒推结果。

真实正向提交暴露 JSON 往返浮点问题：0.40640624999999997 与 0.40640625 被原严格比较误拒绝。Rust 改为仅允许最多 4×EPSILON×max(1,abs(a),abs(b)) 数值误差；不做参数量化、不忽略字段，整数仍精确。新增测试证明末位误差通过而 1e-10 差异、文字改变、数组换序、额外字段、大整数变更不通过。两个 style_reviews 原生测试和类型检查通过。

submit-paper-note-review.mjs 固定源 revision 2 和批次 production-75a6f9e1b2fb4e5e73874d6dc82b1449，先验证本地已看 MP4 的 SHA-256 与生产证据，再提交并回读 current=true，确认源定义不变。记录 style-review-e2ad667b505cbeeebc2d0e74d00f43b2501473f3937842f22c219a097ce8e177。工作台增加五项分项依据展开；verify-paper-note-review.mjs 检查刷新后仍显示 82/100、需完善、未试听、分项依据和阻断原因。资料在 Downloads/paper-note-refinement-2026-09-28/style-review-request.json、style-review-receipt.json、style-review-ui.png。原评审协议的“真实成功写入未验证”限制由本条更新，整体正式审美验收仍未完成。


### 纸签 v4：延长稳定阅读、加强胶带与纸层区分

根据 v2 评审修改作者脚本：入场 0.18→0.10 秒，退场 0.10→0.06 秒；三层保持同步。纸面与文字对比调整，棕色底层更清晰，胶带从宽 0.18/高 0.05 调为 0.20/0.065，稳定透明度 0.82→0.9。v3 原尺寸检查发现新增文字阴影产生不合适的浮雕感，因此 v4 去掉字影，仅保留可编辑底层和胶带层次。不是给整张纸加了纹理或阴影滤镜。

v3 批次 production-3bf2d9670601dfbfd742b8c3d62acff7 与最终 v4 批次 production-ccbc67b85c8f4b84b0dae962042c0ce5 各导出三份实测声音样例，全部通过解码/音频流检查。已查看 v3 短词 30fps 入退场联系表、v3/v4 中英文长词原尺寸帧。最终英文所查帧未遮脸，两行完整。对比实际编译文档：14 处 headline 内容、开始、持续时间完全相同，所有全不透明稳定时段增加；0.4 秒 love 从 0.12 增至 0.24 秒，不延长声音或时间事件。

新版尚未完成全部视觉/听感复评，不增加分数。真实 API 确认 v2 评审 current=false，历史记录保留；verify-paper-note-review.mjs 更新为同时验证当前/历史状态，页面刷新后 v4 显示待评审，不出现旧 82 分。最终证据 Downloads/paper-note-v4-2026-09-28/，含三片、review.html、原尺寸帧和 comparison.json。通用 reviewer 标题改为批次名称，并转义 HTML，避免沿用“三画幅”误导。

### 历史评审与原成片查看闭环

工作台不再完全隐藏旧评审：当前版本记录与“历史评审”分开，历史明确标注原版本、历史分数及不代表当前版本。v4 主状态继续是待评审，v2 的 82 分仅在展开历史后出现。未保存提醒改为对应各记录标注的保存版本，避免历史记录被误称为当前 v4。

Rust 新增 evidenceCurrent 读取标记，独立复用生产模板/成片证据校验并比较应用哈希；仅源样式升级时，旧成片仍可查看，生产图或登记哈希变化则禁用对应播放入口。此检查不重新解码文件。UI 的三个播放器仅在“查看评审成片”展开后创建，折叠卸载，不自动播放。

两个 style_reviews 原生测试（含历史源版本与证据变化的区分）、Web 类型检查通过。本地服务在队列空闲后更新。真实浏览器验证刷新后 v4 仍待评审、v2 历史标识和 82 分、展开产生三个真实视频、首片 metadata 时长约 7.04 秒、折叠卸载。另复验不相关真实组合评审仍被拒绝且库无写入。未播放声音，不记为试听；当前目标的视觉/听感验收缺口不因该功能改变。

### 纸签 v4 与独立字幕的三画幅组合验证

检查主素材库 /state：另有 36.3 秒产品实拍源 47e7803d-a1b6-4ef1-9b9f-50c5c4471d18、15 个镜头。每两秒抽帧可见产品和人物镜头已有烧录字幕，不能作为干净新场景验收；未导入、改写或上传该素材。源 ID/哈希与抽帧联系表保存于下述组合目录 source-candidate-review.json、source-candidate-sheet.jpg。已询问用户是否有其他无字幕实拍本机路径，尚未收到补充，不把缺失素材当成通过。

verify-paper-note-format-composition.mjs 用纸签 v4 + 逐词字幕 v2，横屏/竖屏/方屏，各使用三个已有实测声音输入。明确设置样例焦点 (0.64,0.5)，不是自动人脸跟踪。批次 production-e99b8fb48f79148d295748a4e31e76b9 导出九片、技术检查通过。查看九个长词稳定帧、长英文竖屏联系表及原尺寸竖屏/方屏帧：人物、纸签、字幕分区；首版方屏字幕离底部太近。

只重做方屏：纸签 scale 从 0.82 减到 0.75，字幕 centerY 从 0.93 调到 0.90，其他内容不变。批次 production-05d457242c6b16db878400132ab858ae 三片导出通过；已看中英文最长词原尺寸帧，底部留白增加，纸签与字幕仍不重叠。作者脚本支持 PILOT_FORMAT 选择单一画幅，避免重跑无关格式。这是应用参数改进，没有再修改纸签 v4 的保存定义。

最终九份样例（前批横/竖六片 + 修订方屏三片）在 Downloads/paper-note-composition-formats-2026-09-28/final-review.html，带三种可直接继续调整的工作台链接。verify-paper-note-format-links.mjs 实际打开三条链接，核对原生 insert 返回的画布、图层、样式、关系和资源与对应导出模板一致，仅容许 JSON 浮点末位误差；真实预览就绪、无 pageerror。试用链接保留样式版本与组合参数，声音样例及人物焦点需在试用页另选，页面明确说明。

九片不等于九种设计；仍是同景英文及中文黑底。全片连续运动与听感、更多实拍背景及最终审美评分尚未完成。未上调分数，也未将不同画幅方案重复计入样式库。

### 评审视频折叠与切换的播放生命周期

真实静音播放复现旧问题：收起历史 details 后，视频仍 connected=true、paused=false，存在关闭的祖先 details，即隐藏后继续播放。现在收起视频区、历史区或整个应用验收区都会卸载播放器；切换 asset/revision 时重新挂载评审组件，避免旧视频/记录短暂残留。每个播放器卸载明确 pause、清除 src 并 load 释放媒体资源，同区开始播放新样例时暂停其他样例。

首轮清理逻辑暴露开发模式重复挂载问题：effect 清理移除了 src，但第二次 setup 未恢复，readyState/networkState 均为 0，play Promise 一直等待。确认真实 DOM src=null 后修复：setup 同步恢复当前 src，cleanup 对称释放，并依赖 src。旧诊断进程明确停止后才重跑，验证脚本为播放等待增加 15 秒失败界限。

verify-review-playback-lifecycle.mjs 通过真实静音播放验证四条折叠/切换路径、播放第二段暂停第一段、卸载后 paused=true/connected=false/src=null；库和评审记录前后不变、无 pageerror。Web 类型检查通过。这验证播放控制，不是听感评审，不修改 listened 状态。

### 样式试映内直接配音、转写与恢复

ProductionCreate 接入 ProductionSpeech，复用已有 TemplateSpeech 本地配音组件。生成后轮询同一 input 的词级转写任务，成功后自动选入当前试映，通过 Rust /plan 生成语义段；生成和检查期间锁定关联编辑。相同合成输入再次返回时保留当前表单的关键词标注。失败读取可检查同一输入；终止失败可显式重新转写同一声音；也可保留声音稍后处理并恢复生成入口。没有复制时间编排或合成业务到 Web。

实际生成中文“让重点更加清晰，让表达更有力量。”，input-2a7dc38df99bce8407996f888c2d4932，3.650249 秒，原生转写任务 c2224664-2aa3-4bd9-a770-421efaf07a92 succeeded。ASR 返回繁体字，仍需用户校对，不把 TTS 原文直接冒充实测转写。选定词索引 [1,3) 后，实际 sample-preview 中“重點”的开始/持续 ticks 与词级时间精确一致，浏览器真实画布完成渲染。

发现无关键词时预览返回 no supported elements to apply；UI 对这个确切错误增加中文操作提示，引导展开“内容重点”选择起止词，未忽略其他错误；无预览数据时显示素材标题，消除“· 秒”空占位。

verify-style-speech.mjs 通过：真实本地 TTS/转写/自动选择/预览；注入一次读取 503 后恢复且只发起一次合成；原生合成去重保留标注；注入终止转写失败后调用同一 input 的 transcribe 接口及恢复；“稍后处理”解除锁定并保留已有标注。最后两项是 UI 故障注入验证，未故意破坏或重启真实 ASR。Web 类型检查通过。结果与截图 /tmp/style-speech-verification.json、/tmp/style-speech-verification.png。

本次不包含导出或听感验证，不新增审美分数。刷新后尚不自动恢复等待中的配音上下文，声音本身保留于原生输入库。最终独立样式审美、更多干净实拍场景和连续动效/听感验收仍待完成。

### 新配音从样式试映到实际成片，以及刷新恢复

通过真实页面选择上一条中文配音、标注 [1,3)“重點”，提交草稿试映，批次 production-d6e79ba284d7337eb930a38a4af3d944 已 published/render succeeded，独立工程 tpl-preview-e30024dc79998fa40a22c9878f9c867a-0-0，未改正式原片工程或样式定义。编译后成片与实时 sample-preview 的关键词文字、开始和持续 ticks 一致。实际下载 MP4 的 SHA-256 与原生登记证据一致，decodeVerified/audioQuality.validated 均为 true。

查看导出 0–0.8 秒的 30fps 连续帧联系表，关键词入场、保持、退场可见。它是 3.65 秒中文声音的黑底单一样式功能样例，不是完整字幕成片或新背景审美验收；未试听。证据：Downloads/style-speech-export-2026-09-28/preview.mp4、keyword-motion.jpg、verification.json、item.json、realtime-preview.json。脚本 verify-style-speech-export.mjs；首次下载阶段发现 Node Response.ok 误写函数调用，修正后使用 RESUME_BATCH 回读同一已完成批次，未重复生产。

ProductionSpeech 增加按当前页面路径隔离的 sessionStorage 待处理输入 ID，刷新后回读同一个原生输入/任务，不重复合成；完成或选择“稍后处理”清理待处理引用。仅缓存 ID，不缓存词级时间、任务状态或业务计划。浏览器存储不可用时仍可生成，素材仍保留原生库。更新 verify-style-speech.mjs：真实合成后注入读取失败、刷新页面，自动恢复选入、合成次数仍为 1，随后关键词计时/画布、去重保留标注、失败重试与解锁全部通过；类型检查通过。本条替代上一条“刷新后尚不自动恢复等待中的配音上下文”限制。尚未收到合成响应前就刷新，以及完成后全部试映表单草稿的恢复，不在此实现保证内。

### 重点词直接点选：减少试映标注操作

SampleContent 的转写词改为可点击、可键盘操作的词按钮：点一个词立即提交单词重点；再点同段另一个词扩展成连续范围（支持反向点选）；完成选择或 Esc 结束扩展，清除重点直接移除范围。保留精确起止词下拉框，切换精确选择时清理旧点选起点；拆分/合并仍调用 Rust content/edit 并清理点选状态。每段一个关键词范围的现有契约未变，页面明确提示多重点需拆分。

verify-keyword-word-picker.mjs 真实浏览器 390×844 验证：单词与双词选择、反向选择、Enter/Escape、清除、下拉框一致性、Rust 拆分后词索引正确、触控按钮高度至少 44px 且不溢出。调用实际 sample-preview，选定“重點”的开始 16800 ticks、持续 52800 ticks（0.14–0.58 秒）与已有真实配音时间一致。无 pageerror，Web 类型检查通过。已查看手机截图 /tmp/keyword-word-picker-mobile.png，文字按钮及选中色块清晰；验证数据 /tmp/keyword-word-picker-verification.json。未生成额外配音或导出，也未修改保存的样式定义。

### 纸签 v4：全部关键词边界逐帧检查与当前版本阶段评审

review-keyword-motion.mjs 回读现有批次 production-ccbc67b85c8f4b84b0dae962042c0ce5，校验三份实际 MP4 的 SHA-256，再按编译文档的 14 个 headline 事件提取 30fps 连续帧，含出现前两帧和消失后两帧。裁切下半画面用于检查文字/纸/胶带；不把裁切图当全画面构图证明。已实际查看全部 14 张逐帧联系表：未见所查事件中跳字、保持阶段换行抖动、纸与字脱离或胶带遮字；中文八字及英文五词长文案保持两行。0.4 秒 good thing 等短语的阅读窗口仍偏紧，不能因为导出正确就宣称阅读节奏通过。

提交新评审 style-review-a34c65c9f778fa7fa50c526c1bdb3a2ec9da5153dfd3b3cae9709cb279fec59a：构图 22、动效 22、素材 18、适配 14、编辑性 9，总计 85/100，current=true，meetsInternalThreshold=false，listened=false。动效加分来自稳定时段延长并补齐事件边界检查；素材加分来自胶带/纸层区分和去除字影，未声称增加纹理。限于 v4、1280×720、scale 0.85、center (0.5,0.8) 的单一样式应用；没有借用其他画幅/组合证据为它加分。保留新场景和听感两项最终验收阻断。

submit-paper-note-v4-review.mjs 固定该 revision 和批次，确认本地已查视频哈希、原生写入回读和源定义不变。证据在 Downloads/paper-note-v4-2026-09-28/motion-manifest.json、motion-*.jpg、style-review-request.json、style-review-receipt.json。verify-paper-note-review.mjs 更新为区分当前记录与历史记录，实际刷新后 v4 显示 85 分、需完善、未试听，v2 保留历史 82 分；历史视频加载/折叠通过。首次测试在 details 异步挂载前读取，补等待对应评审区域后通过。verify-review-playback-lifecycle.mjs 在新旧评审并存时复验四条关闭/切换路径及互斥静音播放通过，数据未变化。

### 试映质量提示改为可操作的中文

检查原生 rhythm.rs 后确认 reading_speed_exceeds_limit 针对字幕 cue 的字符/秒阈值，不代表重点词扣除入退场后的稳定阅读时长。未在前端新增阈值或混用这两个含义。新增 plan-warning.ts 仅格式化已存在的 Rust 提示：字幕句号转为从 1 开始，阅读速度、长度、显示时长超限各给中文解释和对应操作建议；未识别提示保留原文，不静默忽略。缺失关键词及自动语义分段已有提示同样转成可读文案。

手机实际检查发现同一建议连续重复九次，随后按已识别问题类型合并，保留全部受影响句号、仅显示一次建议。加载新声音时隐藏旧预览的检查结果，避免把旧示例提示当作新输入结果。页面明确字幕分段检查与花字动效检查的区别。

verify-preview-warning-copy.mjs 使用真实英文输入和逐词字幕 v2 的 sample-preview（未模拟服务）：原生九条阅读速度警告在手机页合为一条中文建议，句号 1–9 完整、无英文代码和 pageerror。已查看最终 390px 截图 /tmp/preview-warning-copy-mobile.png，文案不再占满整屏。Web 类型检查通过。此次不自动改变声音、字幕时间或样式，不因此关闭纸签短词阅读与听感验收缺口。

### 内容重点旁直接试听句子与关键词

SampleContent 增加“试听本段”和“试听重点”，使用原生输入 media/audio 和已返回的词级 start/end；不在 Web 重新识别、分段或修改时间。use-range-audition 仅控制播放器，按范围定位、到末尾停止；再次点击停止，切换范围先停止上一段。收起内容重点、修改标注、拆分/合并、页面隐藏及卸载均停止；卸载释放 src。主效果预览与局部试听互斥，暂停事件同步主预览播放状态。

verify-range-audition.mjs 通过真实媒体的静音浏览器播放验证：中文“重點”目标 0.14–0.58 秒，实际 playing 起点 0.14018、停止 0.584912 秒；折叠、标注修改、卸载与主预览双向互斥均通过，无 pageerror。第一次测试读取 details 状态早于异步 toggle，改为等待实际 paused 状态后通过。verify-keyword-word-picker.mjs 复验手机点选、反向范围、键盘、清除、原生拆分和实际预览时间通过；已查看手机截图，两个试听入口可见且不溢出。Web 类型检查通过。

此能力让用户能直接检查声音边界；静音自动化只证明播放控制，没有试听语音内容，评审 listened 标记保持 false，也不自动提高样式质量分数。

### 补充公开实拍输入：不同人物、深色演播室与手势遮挡验证

从已有 NIOSH 参考的 Commons 来源继续检查公开视频，保留 source-metadata.json（含页面、许可）、每个原片的 provenance.json 和 SHA-256。NIOSH Deborah/Sudha 虽为新人物但与原 Liz 同一布景，不把它们当新背景。另取得 NASA Alex Young（Commons 137076990）与 John Bolten（144276172）公开访谈，Commons 标注 Public domain；两者同属几何墙演播室，显示屏图像不同，与 NIOSH 的浅色墙/植物场景不同。原场景标志未移除，不表示机构或受访者认可本产品。

首轮粗截取夹有题卡，逐个查看 2fps 联系表后重新选段：Deborah 原片 34–41 秒、Alex 22–36 秒、John 22–36 秒。复查这三段所查帧没有题卡或烧录字幕；不是逐帧 OCR 认证。源资料、区间、原片/片段哈希和范围限制在 Downloads/style-public-scenes-2026-09-28/README.md。Sudha 原片仅作候选，未导入；三段正式输入分别为 input-99fa58d72fd4c9ad5cc2eed30b95b6a1、input-80f248b968faad87d3460b76ec8badd1、input-d7a4d9279a7832764481dcb607bf9f70。三个本地转写任务均 succeeded，revision 1，未上传音频到外部分析服务；开头可能是原句中部，不作为完整发言发布。

import-public-style-scenes.mjs 检查片段哈希、按原生内容哈希去重导入，仅无现存转写/任务时排队，不因观察超时重启。verify-paper-public-scenes.mjs 固定纸签 v4，按实际词表断句并指定 11 处重点；保留 measured 时间。原中央应用（scale .85、center .5/.8）批次 production-ff383c7c9d4d0dbba240b88540a112c6 导出三片，实际 2fps 联系表暴露纸签遮手势。左移至 x=.22 的批次 production-5075e90cd134b153db580d645b91047e 三片中，原尺寸 long sunlight 帧确认长纸签仍遮手，因此没有标记通过。

继续只改应用：scale=.5、centerX=.16、centerY=.8，批次 production-7c5b855620d1e1b489121c99613b5b98 三片已导出。已查看三份原尺寸最后关键词稳定帧，文字清晰，主要手势暴露较多；Alex 纸签边缘仍靠近手部，尚未逐帧验证全部手势边界，不声称全程无遮挡。源样式定义没变；对比编译图，11 处关键词内容、start/duration 完全一致。九份本地 MP4 哈希与原生登记一致，解码/音频流技术检查通过，未试听、未新增审美分数。

最终对比入口 Downloads/paper-public-scenes-compact-2026-09-28/compare.html 包含中央/较小左下版六个视频、三张稳定帧和继续编辑链接。链接保留样式版本与 transform，不保存声音/标注，说明需重新选择。三个候选目录保留旧结果，不覆盖已有 v4 的 85 分评审（其应用不同）。新输入减少了不同人物/背景样例不足，仍缺中文干净实拍、户外/产品场景、全程手势与听感检查，整体质量目标未完成。

### 按输入调整纸签位置：Alex 右下版完成定点复核

补查 compact 批次全部 11 张关键词边界联系表：Deborah/John 所查时段未见手部遮挡；Alex 的 longer sunlight 在约 10.9–11.4 秒仍碰到手部边缘。因此不把统一左下布局作为通用通过方案。

verify-paper-public-scenes.mjs 增加 PAPER_SOURCE_PAGE 过滤，未知来源明确失败，输出实际样本数。仅为 Alex 生成一份独立右下应用（scale=.5、centerX=.84、centerY=.8），批次 production-b0d310bc751a99e6b4e9604cbbffd050，保留源纸签 v4 不变。实际导出 succeeded，解码与音频流检查通过；review-keyword-motion.mjs 校验本地 MP4 哈希并提取四个关键词全部 30fps 动效边界帧。实际查看四张联系表与最后长词全幅稳定帧，所查帧未见纸签覆盖手部，右边距仍保留。December 时段手部仍接近下边缘，不把结果扩大成任意输入的自动避让保证。

对比原左下与新右下编译图，四个关键词文字、startTime、duration 完全一致；证据 Downloads/paper-public-scenes-right-2026-09-28/timing-comparison.json。对比入口同目录 compare.html，包含前后真实视频。Deborah/John 保留已有左下应用；这次只改输入对应的布局，不改变声音时机。未试听、未新增审美分数，不改变已有 85 分评审的适用范围。仍需更多独立样式与完整质量验收。

### 试映内容显式保存与刷新恢复

ProductionCreate 在草稿试映中增加“保存试映内容／恢复试映内容”。按当前 pathname 隔离 sessionStorage，仅保存选中输入 ID、转写 revision、重点/字幕标注、标题、焦点和素材绑定，以及当前预览输入；不缓存转写正文、媒体或编译结果。样式与位置仍使用当前页面配置，保存内容不把声音时机写回样式。说明明确限本标签页，恢复会替换当前素材与标注，未保存原文校正时禁止保存/恢复。

恢复先回读每份原生输入，核对转写 revision，再调用 Rust /plan 校验该内容与当前模板；全部成功后才替换当前表单。转写变化、损坏存储或 API 失败时保留当前内容；恢复期间锁定编辑与配音入口。不新增 Web 分段或时间编排业务逻辑。此功能是显式保存恢复，不是全表单自动保存，不恢复任务名称或尚未保存的原文校正，也不是跨设备共享。

verify-trial-content-restore.mjs 真实浏览器验证：选择已有中文 TTS 输入、标注“重點”、保存、刷新、恢复；实际 sample-preview 返回 16800 startTime / 52800 duration ticks（0.14–0.58 秒），与保存前一致。注入转写 revision 变化时拒绝恢复且旧标注保持；损坏 sessionStorage 时显示中文错误并保留输入。注入未修改原生转写。无 pageerror，Web 类型检查通过，已查看 /tmp/trial-content-restore.png；证据 /tmp/trial-content-restore-verification.json。未新增导出、配音或质量分数。素材绑定/多输入路径有实现，本次浏览器专项仅验证单音频重点标注恢复，不扩大测试覆盖范围。

### 多输入恢复与第二份转写失效的原子性验证

新增 verify-trial-multi-restore.mjs，真实页面同时选择已有中文 TTS 和 NASA Alex 视频，各自标注第一段词索引 [1,3)，把 Alex 设为当前预览，保存后刷新恢复。两份输入均恢复选中，当前预览仍为 Alex；实际 sample-preview 中关键词开始 ticks 与 Alex 自身实测词级时间一致，没有串用中文配音的时间。随后先修改当前中文重点至索引 5，再仅对第二份 Alex 回读注入转写 revision 变化：恢复明确失败，第一份已通过读取/plan 的旧标注也没有部分写回，中文索引仍为 5，当前预览仍为 Alex。无 pageerror。

证据 /tmp/trial-multi-restore-verification.json。本轮复用既有输入，未重新合成、转写、导出或改变原生转写。验证覆盖从单音频扩展到音频+视频、当前预览保持、第二份失败时整批表单保留；未声称覆盖全部素材绑定类型或达到审美验收。

### 双引号花字 v5：实拍排版与短词入退场优化

回读 style-study-20260928-quotation v4，并用三份公开实拍既有标注生成 production-f7c02e1123dedbcc1c42a336b9f65ac8。查看三个最终关键词全幅稳定帧及 December 动效联系表：中央 scale=.65 的 never got upset / longer sunlight 被挤成两行，Alex 左引号/文字与手势相遇，短词入退场占时偏多。

refine-quotation-style.mjs 固定 v4 为基准、先保存原定义，再通过原生 inspect/save 写入 v5：主文字区 x=.12、width=.76，字号 96→80，引号 116→96，三层 enterSeconds .18→.10、exitSeconds .10→.06。没有改变 keyword 绑定、原声时机或依附关系。v5 中央同参数三输入批次 production-3d46a821ac714de471ae0a0f3ec9fb1f 已导出；查看三张全幅稳定帧、三张 2fps 联系表与 December 连续帧，确认前述两个短语成为单行，最长 from space 短语仍合理两行。11 处关键词内容/startTime/duration 完全不变，证据 quotation-refine-2026-09-28/timing-comparison.json。中央 Alex 仍遮手，不宣称解决。

再单独为 Alex 使用 v5、scale=.5、center(.84,.8)，批次 production-acc985d33bd79215703647a765952332 导出一片。实际查看最后关键词全幅帧与全部四张 30fps 动效联系表，所查帧未见手部覆盖或画布裁切；它是该输入的人工位置调整，不是自动避让。三个批次共七片解码/音频流技术检查通过，motion 脚本已校验视频哈希；未试听。旧/新/右下对比：Downloads/quotation-refine-2026-09-28/compare.html。仍需中文样例、多画幅、其他七处逐帧动效与正式评分，不继承纸签或旧模板分数。

verify-paper-public-scenes.mjs 现允许指定 STYLE_ASSET_ID/STYLE_REVISION，默认仍为纸签 v4；样式版本强校验、原定义回读不变、按内容幂等、独立预览工程机制保留。

### 双引号 v5：中文及三画幅验证与实拍位置修正

verify-quotation-formats.mjs 复用已存在的中文阅读 revision 4 与 Alex revision 1，生成横屏 1280×720、竖屏 720×1280、方屏 720×720 共六片，批次 production-c3a34dcfe74a514485a54e71d3242783。未重做 TTS/ASR。check-quotation-format-timing.mjs 核验 27 个主文字事件：三画幅文字与 start/duration 一致，每个事件两侧引号具有相同时间窗。原生样式 v5 回读不变。

查看中文三画幅最后长句全幅帧与竖屏全部五张 30fps 联系表，最长“真正打动你的地方”保持两行，所查帧未见裁切、换行抖动或引号脱离。中文输入是黑底音频，仅证明排版与动效，不算中文实拍。查看实拍竖屏/方屏全幅帧发现中央应用仍与手部相遇，故另为这两种画幅设置 scale=.5、center(.66,.8)，生成 production-feb5252c50a41a8bcb9b117404a92b77 两片。已查看其全部八张 30fps 关键词联系表与两张全幅稳定帧，所查窗口未见文字遮手或画布裁切；声音时间与调整前一致。最终横屏实拍沿用上轮 x=.84 的已查版本。

共八份新导出解码/音频流检查通过；motion 提取对本次查看的竖屏中文/实拍与调整后两种画幅 MP4 校验哈希。review-keyword-motion.mjs 增加 REVIEW_ITEM_INDEX 与独立文件名前缀，避免多设计批次只检查第一个设计或覆盖已有证据。最终六格试映入口 Downloads/quotation-formats-adjusted-2026-09-28/review-final.html；时间证据分别在原始目录 timing-verification.json 与调整目录 timing-adjustment.json。未试听、未新增审美评分；仍需各独立样式完整验收，不能用这一款的六格样例代替整个库完成。

### 双引号 v5 的阶段性评审写回及工作台展示验证

补齐并实际查看中央横屏三输入全部 11 张 30fps 联系表，除了已知 Alex longer sunlight 遮手，还确认 John learned so much 约 5.9–6.4 秒盖到合拢的双手。没有用不同位置的后续试映掩盖该应用的问题。submit-quotation-v5-review.mjs 锁定源 v5、批次 production-3d46a821ac714de471ae0a0f3ec9fb1f 和三份已查本地视频 SHA-256，提交原生记录 style-review-e21407a496836e4cbda85ac4f00a895992228f98f3b9c3bf9901e2bb25b23384：构图 18、动效 21、素材 17、适配 14、编辑性 9，总计 79/100，current=true，meetsInternalThreshold=false，listened=false。

应用限定 1280×720、scale .65、center(.5,.8)。评分依据、两个遮手时段、December .36 秒短窗及未试听限制均写入，不代表右下版、其他画幅或中文试映的评分。源定义回读未变化。verify-quotation-review.mjs 真实浏览器检查进入/刷新后仍为 v5 79 分、需完善、未试听；分项依据与阻断项可见，按需展开三个视频，首片媒体元数据时长 7 秒，折叠后卸载。无 pageerror，已查看截图 quotation-refine-2026-09-28/style-review-ui.png。下一步应处理 John 应用位置，并为调整后的实际应用补齐评价，而非继续提高中央版分数。

### John 双引号遮手修正与评审布局直接展示

对 John 单输入生成双引号 v5 的左下应用：scale=.5、center(.16,.8)，批次 production-beef96b6cfc228efb8c5b2bf2bc3d4ad。查看全部四张 30fps 关键词边界联系表及最后长词全幅帧，原 learned so much 盖住合拢双手的问题在该应用所查帧中消失，其他三个窗口未见手部覆盖或画布裁切。四个关键词文字与 start/duration 对比原中央版完全一致，源样式未变。解码/音频流检查和视频哈希校验通过。对比 Downloads/quotation-john-left-2026-09-28/compare.html，时间证据 timing-verification.json。未试听，不新增分数或改变中央版 79 分记录。

StyleReviews 直接显示评审布局：有独立 transform 时列出大小、水平/垂直中心百分比，否则列出原生 placement 区域；配置独立字幕行宽时同时显示。此前仅版本和画幅在标题中，具体布局藏在长文依据，容易误解同版不同布局的评分范围。此次仅展示原生记录字段，不在 Web 新增评分规则。verify-quotation-review.mjs 实际进入与刷新后确认“大小 65%，水平中心 50%，垂直中心 80%”，79 分、需完善、未试听、分项与证据视频加载/折叠仍正常；Web 类型检查通过。

### 从当前应用评审直接进入相同布局试映

StyleReviews 增加“用这个布局试自己的声音”入口，链接保留 asset revision、画幅、区域、独立大小/中心和可选字幕行宽，声音与重点词由用户重新选择。只对当前记录、30fps 三种工作台画幅、可准确表达的预设区域、无自定义输入覆盖的应用显示；历史记录、自定画幅/区域、不兼容 transform 区域不生成近似链接。此轮未扩大试映页所支持的原生参数范围。

verify-quotation-review.mjs 在原评审显示/刷新/证据媒体验证之后，实际点击 v5 中央应用入口，捕获真实 Rust application 请求，对比评审的全部应用字段；原生记录默认 inputs:{}，请求省略等价空值，验证仅补齐该默认值。最初直接比较暴露这一默认差异，修正比较后通过；没有忽略其他字段。刷新试映页后请求仍一致，未自动选择原评审媒体。Web 类型检查通过。该入口减少重复手填布局，不宣称把旧声音或评分应用到新内容。

### 动态字幕 v3：修复句首句尾短词被淡入淡出削弱

复用三份公开实拍及其既有分段，字幕 v2 以 scale=.65、center(.5,.9)、captionWidth=.84 生成 production-9425aa63cf2edae0e46826e260c40468 三片。查看全片 2fps 联系表及每个词中点的底部区域联系表，发现 Deborah 的 But/she、Alex 的 For/the、John 的 It 等句首短词处于低透明度；句尾也受淡出影响。高亮计时正确不等于视觉可读。

refine-caption-readability.mjs 固定 v2，保存原定义后通过原生 inspect/save 写入 v3：只移除 sentence 元素的 opacity 动画，保留逐词高亮、轻微 y 位移、原字体/描边/位置和词级时间。新批次 production-caf2b9f20ee3e8af2211b5214710838e 三片已导出。verify-caption-public-highlights.mjs 分别验证旧/新样例：全部 97 个词的 text.wordTimings 字符切片、绝对开始/结束 ticks 均与原生 transcript 一一对应且无遗漏；v3 所有字幕 opacity=1、无 opacity 动画；六片本地视频哈希对应各自证据。技术解码/音频流检查通过。

实际查看新版三张逐词中点联系表，与旧版同时间对比，所述句首短词恢复清晰，句尾保持可见，当前所查帧未见高亮错词或文字裁切。此抽样不是完整逐帧验收，尚未检查所有边界瞬间、中文/其他画幅的新版本、完整声音与画面节奏，不新增评分。前后入口 Downloads/caption-readable-2026-09-28/compare.html；证据 highlight-verification.json、highlight-0/1/2.jpg，原定义 original-v2.json 保留。旧组合/脚本仍引用其固定 v2，未悄悄升级已有工程。

### 动态字幕 v3：中英文三画幅逐词与时间独立性核验

复用中文 input-941335914fe590272ed1f8cef9af917a revision 4（38 tokens）与 Alex input-80f248b968faad87d3460b76ec8badd1 revision 1（37 words），已有批次 production-4a4b28445ed740ff9b789c94bb331280 生成横屏、竖屏、方屏六片。应用 scale=.65、center(.5,.9)、captionWidth=.84，源字幕 v3 未随试映改写。

本轮补跑 verify-caption-public-highlights.mjs 的横屏和方屏，两者均通过 75 词；结合已有竖屏记录，三画幅共 225 个词实例的内容切片、绝对词级时间、全词覆盖、opacity=1 和无透明度动画均通过，核验时本地视频 SHA-256 与原生预览证据一致。新增 check-caption-format-timing.mjs 并执行通过：直接对比原生编译文档，三画幅的字幕正文、句段 start/duration 及完整 wordTimings 完全相同。这证明本次改画幅没有改写声音时机，而非仅比较视频总时长。

本轮实际查看英文竖屏、中文/英文横屏及方屏五张逐词中点联系表；结合上一轮已查中文竖屏，所查帧未见错词高亮或文字裁切。但 Alex 三种画幅均有字幕与手势相遇，尤其第三、第四句，不能判定默认底部位置适用于任意实拍。中文只有黑底声音，不能代替中文实拍背景验证。尚未做全边界逐帧检查或试听，不新增质量分数。

Downloads/caption-formats-2026-09-28/review.html 已补充明确的核验结论、遮手限制、三份逐词核验记录、六张联系表以及 timing-verification.json 链接。下一步需要处理实际输入下字幕位置与画面主体的关系，并继续检查工作台的样式编辑/组合主线；本轮不代表整个样式库或 20 款 90 分目标完成。

### 按样式用途新建：分类与创建入口保持一致

检查工作台主线发现，筛选动态字幕时“新建样式用途”仍可停留在默认花字，统一按钮文字掩盖了实际创建类型。DynamicAssetLibrary 现在在无未保存修改、非忙碌状态点击具体用途分类时同步新建用途，按钮明确写“新建重点词／花字／动态字幕／装饰素材”。创建完成后保持所创建的用途分类并清除旧搜索，避免新样式消失或回到混杂的全部列表。“全部”和“未分类”不擅自改变创建用途；修改中仍可筛选，但不会修改被锁定的新建设置。整片模板内的创建入口保持原行为，原生创建与绑定逻辑没有搬到 Web。

verify-effect-create-purposes.mjs 改从实际分类按钮进入，核验选择器同步、创建 POST 的 purpose、创建后分类保持，以及三种类型各自的内容 binding / 时间 anchor、逐词高亮、保存、搜索、非空预览。实际运行通过，原有资产逐项不变，三份本次测试资产成功后归档；已查看 390px 全页截图，新建按钮和分类清晰且无横向溢出。Web 类型检查通过。

verify-effect-decoration.mjs 同步新按钮与现有分类按钮结构，并在成功后仅归档本次创建资产。第一次运行在页面初次加载阶段未等到保存回包而超时；补充等待已选资产加载、并将点击与响应等待纳入同一 Promise 后重跑通过，未将首次超时当成功。实际验证装饰无文字输入、矩形图层、保存刷新、用途筛选与桌面/手机预览，成功资产 dynamic-55ff7dd2-f2bd-4c2c-babb-1da0e7415ac0 已归档。这是创建入口一致性的改进，不代表剩余样式适配与质量验收完成。

### 组合试映按用途和名称查找样式

EffectTrial 的叠加样式选择新增用途下拉（重点词、花字、动态字幕、装饰素材、全部）与名称搜索，两项共同筛选原生目录返回的 purposes/name；已归档条目仍不显示。改变筛选会清空尚未添加的选择并禁用添加按钮，避免把已经不可见的候选意外加入。无匹配时明确提示。筛选只作用于候选目录，不改变已叠加实例、应用参数或 URL；组合编排仍通过 Rust application/insert。

扩展 verify-effect-trial-composition.mjs 并实际通过：动态字幕候选 ID 与原生目录用途一致；无结果时清空待选项且禁止添加；名称筛选正确；筛选前后应用链接不变；已有两项组合在改变用途时保留。原有五元素组合、高亮、独立字幕行宽、文字依附、刷新恢复、移除与解除依附、真实非空渲染和 390px 无横向溢出回归通过；整个库定义和归档状态前后相同。Web 类型检查通过。未生成新资产或成片。

全页自动截图出现重复绘制影像，因此没有直接用其作为移动端视觉通过依据。另用独立 390px 页面检查，DOM 中工作台、标题栏、选择器各只有一个，宽度 390；实际查看 /tmp/trial-picker-viewport.png，用途、搜索与选择按钮均可读且未挤出屏幕。该图截取时预览仍在更新，仅用于候选选择控件布局；真实非空预览由前述组合回归另行验证。仍需继续解决实拍遮挡适配与独立样式审美验收。

### 字幕位置候选验证：统一上移不能解决手势冲突

verify-caption-formats.mjs 增加 STYLE_CENTER_Y，仅覆盖试映应用位置，不修改源字幕 v3。先试 .96，原生 application 明确拒绝 layout must fit normalized canvas，未提交生产；没有绕开布局约束。随后仅复用 Alex revision 1，以 centerY=.72、其余 scale=.65 / centerX=.5 / captionWidth=.84 保持原值，批次 production-867f088c6e53e106bb8c688c39718b31 三画幅成功导出。

三片解码与音频流技术检查通过，逐词核验各 37 词（合计 111 词实例）、完整 opacity 和视频哈希通过。verify-caption-public-highlights.mjs 支持下半画面取样，防止上移后仍裁取底部四分之一而漏掉字幕。本轮实际查看三张全幅最后长句稳定帧及三份逐词中点联系表：末句部分低位手势遮挡减少，但约 6–8 秒抬高手势仍与第三句重叠。因此拒绝将 centerY=.72 宣称通用修复，不更新库样式或提高评分。

对比前批次 Alex fixture 1 与本批 fixture 0，三画幅的字幕正文、句段 start/duration 和完整 wordTimings 均一致，证据 Downloads/caption-chest-2026-09-28/position-timing.json；compare.html 提供六视频前后对照并明确未通过原因。未试听、未做全部边界连续帧检查。

代码核对显示原生 Layout 已有 videoRegion，source_layout.rs 会按该区域裁切画面；动态样式 application 当前固定使用 full_frame 视频区域。后续应考虑在应用层开放画面区域与字幕分区，而非把固定画面布局写回可复用字幕样式，也不能仅再换一个中心点声称消除动态手势遮挡。此能力尚未新增到试映界面。

### 原视频区域作为应用配置：Rust、AI、页面与成片接通

Application 新增可选 videoRegion，原生仅在投影后设置应用 Layout.videoRegion 并验证归一化边界；省略保持满屏，字幕元素、字号与动效不变，源样式不变。Insert 叠加不覆写宿主视频区域。AI prepare_dynamic_asset_application 描述与原生 schema 使用同一字段。试映页新增自定原视频区域，默认上方 80%，可编辑四个比例；参数进入链接、刷新恢复，取消回到原满屏。文案明确裁切填满、需要时使用素材焦点、纯音频不受影响。评审显示视频区域，试用链接携带同一字段；组合保存不将原视频布局写入字幕资产。

25 项 dynamic_asset 原生回归、2 项 style_reviews 回归和 MCP 参数透传测试通过，Web 类型检查通过。本地服务在确认无 running/queued 工作后更新。verify-trial-video-region.mjs 真实浏览器验证开关、区域修改、原生回包、字幕图层/样式不变、刷新恢复、越界拒绝与修复、取消完全恢复、390px 无溢出、库不变；实际查看手机截图。组合回归增加 videoRegion=.8，确认插入、刷新与移除后宿主区域仍在，原有五元素、高亮、行宽、依附、渲染均通过。

真实三画幅批次 production-45c9fbe42673b4383d93fe3c9ece9fcf 使用 Alex、字幕 v3，videoRegion 上方 80%、字幕 centerY=.9，三片成功导出。但全幅稳定帧发现横屏中心裁切截头顶，未直接通过。再用既有输入 focalPoint={x:.5,y:.4}，生成 production-4874a4e71d93b31373399c33766ae8dc 三片。最初脚本误用 focus 字段被 422 拒绝，改为原生 focalPoint 后提交成功，未绕过校验。

最终三片技术解码/音频流通过，逐词 37×3=111 实例、opacity 与 MP4 哈希核验通过；实际查看三张全幅末句稳定帧、三份逐词中点联系表。所查字幕均位于独立黑底，未见手势覆盖或文字裁切，横屏头顶恢复；画面裁切牺牲部分低位手势，是分区版式的取舍，不是保持所有画面内容的自动避让。对照原满屏版三种画幅的字幕正文、句段与完整 wordTimings 一致。未试听、未新增评分、未宣称全部边界帧通过。

最终对比 Downloads/caption-separated-focus-2026-09-28/compare.html，时间证据 position-timing.json，三份 highlight-verification 记录。功能主线完成了这项应用布局闭环；剩余独立样式质量与更多场景验收仍继续。

### 原视频分区从真实页面导出，并发现默认英文分段缺口

新增 verify-caption-region-ui-export.mjs，真实页面打开字幕 v3，开启 videoRegion 上方 80%，选择已有 Alex 输入并设置 focalPoint (.5,.4)，直接点击生成草稿预览。批次 production-ad57e784feee59177032d3b18e294a95 成功导出 14 秒一片；没有拦截生产接口。捕获实时 sample-preview 与生产 author 的完整模板并逐项比较一致；输入/转写 revision、焦点均正确，库数据前后不变，无 pageerror。

首次脚本使用 Playwright check 验证异步选择输入，因勾选状态需等待原生 plan 回来而提前报错；改成真实点击并等待 sample-preview 成功后跑通。首次截图还停在视频加载状态，不能作为视觉证据；修正为等待 14 秒真实素材、aria-busy=false 和指定 10.9 秒对应的画布 generation 后重取，仅复查预览、不重复提交生产。实际查看新的 page-preview.png，原视频、底栏和逐词高亮可见。

导出解码/音频流检查通过，37 词的原生时间窗、内容、完整不透明度及 MP4 SHA-256 核验通过。查看完整逐词中点联系表，底栏未见手势覆盖或文字裁切。但这次使用页面默认 captionSpans=[]，暴露默认英文字幕分段过碎：the northern / hemisphere has、giving us the / summer or longer 等。本次两段语义单元不同于此前手工四段字幕，不能声称视觉与此前手工样例相同。代码定位 rhythm.rs 按 segmentation.maxCharacters=16 切分；当前未修改全局默认或手工篡改样例掩盖问题，应完善声音内容层的分段策略及可配置入口，保持独立于样式定义。

review-style-format-adaptation.mjs 代表帧选择允许无重点词字幕使用最后 captionSpan/semanticUnit，不再要求每个输入强行标重点。证据 Downloads/caption-region-ui-2026-09-28/ 包含页面预览、原始请求、生产载荷、MP4、逐词画面与 review.html。功能导出闭环通过；自动分段质量尚未通过，未试听、未加分。

### 每份声音可独立重新生成字幕分段

CaptionContent 新增“重新生成分段”：可设置每句字符上限、时长上限、停顿阈值，明确点击后替换当前声音的手工拆合结果。调用既有 Rust /plan，临时传入分段参数，仅将原生返回的 caption wordSpan 写入本份声音；不改应用模板的 segmentation、不改样式库、不计算或伪造词时间。参数是本次生成设置，刷新恢复默认；生成的范围可通过已有保存试映内容恢复。失败保留当前范围。阅读速度仍沿用模板原值，未声称这个入口解决所有阅读速度警告或自动语言适配。

从页面实际试了两版：42 字符/5 秒生成 production-a40032d74f9b2fddb2a345b18bf00cc5，回读 7 句，仍有孤立 the sun / day，未判通过。60 字符/5 秒、停顿 .32 秒生成 production-196ef9d3e76dd104cbbddbf004de1f1b，原生返回 5 句；末两句保持完整，最长 4.6 秒。两次均通过真实页面选择输入、调焦点、分段、预览、提交；生产样本 captionSpans 与实时预览和 /plan 返回逐项一致，应用模板仍为原 segmentation.maxCharacters=16，库前后不变。

最终导出解码/音频流通过，37 词内容、绝对时间、完整不透明度与视频 SHA-256 通过。实际查看逐词中点联系表，前述 northern / hemisphere 与孤立 day 的拆分消失，长句两行，所查字幕未见裁切或画面遮挡。未试听、不新增评分；只验证当前英文样本横屏，不把 60 字符作为中文或其他画幅的通用默认。

扩展 verify-caption-region-ui-export.mjs，额外用不提交生产模式验证：保存新范围、刷新、恢复后范围一致；生成参数恢复为模板默认 16；输入越界 61 被原生拒绝且 5 句结果保持。无 pageerror，Web 类型检查通过。对比入口 Downloads/caption-resegmented-60-ui-2026-09-28/compare.html。接下来仍需自动分段策略改善及其他样式质量验证，不能把手动可配置等同于自动质量完成。

### 分段面板正文与 Rust 实际字幕保持一致

CaptionContent 原先把转写词直接 join("")，导致英文面板呈现 oneinJuneandone，与编译字幕不同。本轮改为对当前明确 captionSpans 调用既有原生 /plan，只展示返回 captions.text；不在 Web 复制中英文拼接规则。请求包含当前模板、词、语义与字幕范围，切换时中止旧请求，并用完整请求快照防止旧正文显示在新范围下。读取失败明确提示、显示正文暂不可用，范围仍保留；切回自动分段清除过时的生成成功提示。

新增 verify-caption-panel-text.mjs，实际使用 Alex 英文与既有中文阅读输入：自定义分段后显示原生正文，第一句拆分与合并后逐句正文回到原结果，保存试映内容、刷新和恢复后正文正确。英语读取路径注入 503，验证当前拆分句数保持、旧正文没有冒充新正文；解除注入后合并，正文恢复。实际查看两份面板截图 /tmp/caption-panel-English.png、/tmp/caption-panel-Chinese.png；原生文本保留英文空格和中文连续书写。结果 /tmp/caption-panel-verification.json，无 pageerror；Web 类型检查和 diff 空白检查通过。未新建资产、重新转写或导出成片，不新增审美评分。

这修复编辑器反馈的一致性；原默认英文自动分段仍较碎，上一轮按每份声音重新生成的入口可调整，尚未把人工参数选择替代为自动策略。

### 原生自动分段修复长度限制产生的英文短尾

rhythm.rs 将自然边界判断提取为共享函数，仍按停顿、句末/分句标点、说话人和上限分段。后处理仅针对尺寸或时长上限切出的 1–2 个词 Latin 短尾，在相邻两句内寻找字符数更均衡的合法分界，两句各至少两个词，并继续遵守原字符/时长上限。不跨自然边界，不改词数据，显式 captionSpans 不走自动修复。不是语法分析器，也没有扩大 16 字符默认值；单个超长词仍使用原有警告路径。

新增回归覆盖 day 单词尾、the sun 双词尾、词范围连续覆盖、时间对齐、停顿/标点/说话人不合并，以及中文分字结果保持。Rust 全库 207 项通过、3 项原有 ignored，无失败。服务分别在队列空闲时更新。

先修单词尾的批次 production-6fee1e9f31d029827028cc963568fda9 证明 day 合入短语，但 the sun 仍只有 .5 秒，因此扩展为 1–2 词并重新回归。最终同参数（42 字符、5 秒）从真实页面提交 production-d702512729caadf1c6a2e39201518227：原 the northern…towards / the sun 改为 the northern hemisphere has / pointed more towards the sun；原末尾 day 改为 giving us the summer or longer / sunlight during the day。仍为 7 句，避免把减少句数当作唯一质量指标。

最终导出解码/音频流、37 词高亮时间/不透明度/哈希核验通过；应用模板、输入转写 revision 和焦点与旧 42 字符版本一致。实际查看逐词中点联系表，短尾已消除，所查字幕未见裁切或画面遮挡。未试听、未验完整边界帧、未新增分数。比较 Downloads/caption-balanced-phrases-ui-2026-09-28/compare.html。这改善默认算法的一个实际问题，尚不等于所有语言或句法的自动分段质量完成。

### 自动分段字符预算与实际英文空格统一

发现 rhythm.rs 贪心分段及短尾平衡仅累加词内字符，cue 检查却对完整正文计数，英文空格造成同一 maxCharacters 下计算不一致。提取 needs_word_space，正文拼接与贪心预算共用同一规则；短尾候选直接按原生 text 的 Unicode 字符数验证。没有把字符计数改为 UTF-16 长度，逐词高亮 UTF-16 范围逻辑保留。单个不可拆长词仍保留并报警。

新增 English、标点、中英混合、emoji 和不可拆长词回归，检查实际字幕字符上限和相应警告。Rust 全库 208 passed、3 ignored，服务在队列空闲后更新。真实页面以既有 Alex、42 字符/5 秒重新分段并导出 production-6b0cde595e50fea49a86871f9e157417。回读原生生成计划 7 句，包含空格的长度为 32/22/33/40/16/39/15，均未超过 42，也没有该生成计划内的 character_budget 警告。预览/生产范围一致、库未改写。

导出解码/音频流、37 词时间/不透明度/MP4 哈希通过；实际查看逐词中点联系表，所查文字无裁切或图像遮挡。证据 Downloads/caption-space-budget-ui-2026-09-28/review.html、character-budget-verification.json、highlight-verification.json。未试听、不评分。注意生成参数目前只生成范围，试映对显式范围的阅读/字数警告仍按原模板阈值，不能把这次生成计划无超限扩大为页面所有警告消除；内容级评估阈值与生成设置的关联仍待完善。

### 当前声音的分段规则贯通保存、预览和生产

新增可选 captionPolicy（SegmentationPolicy）至原生 PlanInput 与 production_author::Sample。resolved_template 只在本次执行副本覆盖 segmentation，通过现有 Rust 校验；未提供字段时不序列化该字段，旧请求行为保留。模板库定义不写回。编译、实时样本预览和生产共用该输入，声音的词时间保持不变。原生 schema 自动暴露新字段，MCP 描述补充用途。

ProductionCreate 将每份声音的 captionPolicy 随 captionSpans 传至试映、内容检查、生产和 sessionStorage 保存；恢复先经原生 plan 校验再原子替换。CaptionContent 重新分段改为独立传 captionPolicy，不再临时改 template；成功后一起保存规则和范围，手动拆合保留规则，切回自动清除覆盖，正文读取也携带同一规则。恢复或规则变化清除过时的本地表单草稿。此条取代前面“参数刷新后恢复默认、评估仍按原模板阈值”的限制。

验证：Rust 210 passed、3 ignored；Web 类型检查通过。真实页面 42 字符/5 秒设置保存、刷新恢复一致；61 字符被拒绝且原范围保留；中英文正文、拆合、保存恢复、读取失败不显示旧正文回归通过（首次并行回归超时，单独重跑通过）。MCP 10 项通过；原有工具数量写死为 65 已过时，改为关键入口存在及注册名称不重复，保留 CAS/error 行为断言。

真实隔离草稿 production-5c74ae7ba04faeaf090f36078cd4257d：页面试映与生产样本 policy 一致，生产 fixture.input 回读为 maxCharacters=42/maxPhraseSeconds=5/maxCharactersPerSecond=10/pauseBoundarySeconds=.32；模板仍16，库无变化。首次渲染 MCP timeout，确认任务 failed 后恢复同一批次，attempt2 succeeded。成片解码和音频流技术检查通过，37词高亮时间、不透明度及视频哈希通过；实际查看逐词中点联系表，所查字幕无裁切。阅读速度警告仍保留，不放宽阈值、不声称已试听或审美90分。

证据：Downloads/caption-policy-export-2026-09-28/review.html、policy-verification.json、highlight-verification.json；恢复回归目录 caption-policy-restore-2026-09-28。原始用户工程未改动。样式工作台整体质量与丰富度目标仍未完成。

### 工作台默认入口改为先选用途

独立 /templates 无 effect 参数时不再自动选中库内第一项，因此首次打开不会直接暴露某个随机样式的整套属性。右侧显示重点词、花字、动态字幕、装饰素材四个用途入口，说明分别设计什么、时间由声音决定。点击用途同步筛选列表和新建用途；手机点击后滚动到列表。明确选中样式后才展示编辑面板，effect 深链接及刷新保留直接编辑行为；嵌入整片模板的素材库选择逻辑保留。

新增返回用途选择按钮，未保存或忙碌时禁用，返回清除 effect 参数。加载期间显示正在读取样式库，避免空数组初始化造成“暂无素材”误报。样式定义和库内数据没有写入。

实际 Chrome 验证分类入口、动态字幕筛选与新建用途同步、选中进入编辑、深链接刷新、返回入口和390px无横向溢出；1280px与390px截图已查看。Web 类型检查和 diff 空白检查通过。验证脚本 /tmp/verify-style-entry.mjs，截图 /tmp/style-entry-desktop.png、/tmp/style-entry-mobile.png。此轮改善发现和进入路径，未新增样式质量评分，整体样式质量与丰富度目标仍在进行。

### 样式选择阶段增加大图图库

核查缩略图路径后确认预览并非卡死：按可见区域懒加载、两个并发队列能正常完成。实际问题是浏览阶段缩略图只有76px宽，文字结构不易比较。本轮为未选中样式的独立工作台添加 tw-style-browse 布局：用途入口在上，搜索/分类在下，样式以自适应大图卡片排列；选中后仍使用紧凑列表加编辑面板。手机采用双列卡片与页面自然滚动，保留分类点击后的列表定位。没有修改原生样式、缩略图生成或时间模型。

真实 Chrome 逐项滚动并等待当前19条目，全部 data-thumbnail-state=ready，无缩略图错误；查看完整图库截图 /tmp/style-thumbnail-loaded.png。分类筛选、新建用途同步、打开编辑、深链接刷新、返回图库和390px无横向溢出回归通过。Web类型检查通过。截图验证的是静态外观可浏览，不是运动质量或90分验收。

### 图库可直接只读预览动效

图库每张卡片新增独立“预览动效”按钮，不嵌套在选择按钮内。弹窗复用 EffectPreview 与 Rust 原生预览接口，支持播放、重播、示例文案、背景和进度；没有编辑图层或保存操作。可继续挑选、进入当前样式编辑，或跳到声音试映。关闭恢复原触发按钮焦点；进入编辑仍由原有选择流程处理。预览仅在图库未选中条目时显示，不跨越未保存修改保护。

弹窗采用既有 Dialog 的模态与键盘行为，独立限制高度、竖屏画布高度并允许滚动，避免预览把操作区域长距离推到下方。更新图库选择验证脚本，使其明确选择 tw-style-open，区分查看动效和进入编辑。

验证 scripts/templates/verify-style-quick-preview.mjs：真实原生编译与共享渲染播放时间推进、代表帧非空、打开不选择编辑对象、Escape关闭并恢复焦点、进入编辑、390px弹窗无横向溢出、继续挑选、库响应前后完全一致。手机导航既有回归也通过，包含未保存修改保护。Web类型检查和diff空白检查通过；桌面/手机截图已查看，分别 /tmp/style-quick-preview-desktop.png 和 /tmp/style-quick-preview-mobile.png。此处用示例节奏且无声音，未声称真实TTS对齐或审美评分完成。

### 双层花字 v4：短关键词主文字全程清晰

检查纸签已有记录后，没有重复修改已按输入复核的位置；转而用尚待正式评审的 style-pilot-20260923-offset v3，在三个已有公开实拍输入上生成基线 production-3bff5cff72a6fa5e38289a0630dd09c8（scale .65，center .5/.85，1280×720）。基线三片技术导出通过。查看Alex联系表、John最长词稳定帧及December连续30fps边界帧；December只有.36秒，而opacity入.19/退.10导致完全不透明仅.07秒。

refine-offset-readability.mjs 保留原v3定义收据，经revision CAS保存v4：主文字去掉opacity动画，仍保留原生缩放/旋转；两层弹入.12秒、初始缩放.88，粉色偏移层保留淡入并将退出缩至.06秒。没有改声音、关键词范围、展示时机、位置、描边或字号。同步author-style-pilot.mjs，避免重建样式时恢复旧阅读问题。

新批次 production-074adc6c5e8d0fe8b58cf0af8f300594 三片成功，解码与音频流检查通过。原生编译回读11处主文字内容/startTime/duration与基线完全一致，主文字没有opacity轨道且基础opacity=1；December不透明.36秒，运动.12秒结束。生成全部11处关键词边界联系表并校验源视频SHA；实际查看December、最长vantage point from space连续帧与Deborah整段2fps联系表，短词首尾清晰，所查长词没有裁切。未声称全程所有手势边界都已检查；英文、横屏、两个布景仍不能替代中文/竖屏/更多场景验收。未试听、不新增90分或独立审美分数。

证据 Downloads/offset-readable-2026-09-28/compare.html、timing-verification.json、motion-manifest.json、source-v3.json、saved-style.json；基线目录 offset-public-baseline-2026-09-28。旧v3保留，新库版本为4，其他样式未修改。

### 将短词淡入退场问题转为通用原生提示

新增 Rust readability 模块，在最终事件/生命周期及motionTiming解析后检查文字opacity稳定段。警告含实例ID、开始/结束、最长连续全不透明段和建议时长；建议为min(.15秒, 实例时长的一半)。仅提示不阻断、不自动改写样式，不把渐变区间或分散的闪烁片段累加成稳定阅读段。恒定透明度、无opacity、非文字和空内容排除。明确不检查遮挡、父层、滤镜及其他动画，不把无警告当成验收通过。

Web将警告转为时间范围、实际与建议时长及可操作建议，相同展示文案的重复图层提示合并。MCP计划工具说明新增诊断含义，docs/style-review-protocol.md记录字段与限制。Rust212 passed/3 ignored；类型检查通过。空闲队列下更新本地服务。

真实原生回放旧/新双层花字生产fixture：v3 December主/底两个实例返回.07秒稳定段、建议.15秒；v4相同内容时间不再触发。结果 Downloads/offset-readable-2026-09-28/opacity-warning-verification.json。浏览器以只读preview请求回放本地v3定义，原生生成真实警告，验证页面中文解释、修改建议及重复合并；没有模拟警告响应或改库。截图 /tmp/opacity-warning-ui.png 已查看。这是创作反馈闭环，不新增审美分数。

### 双层花字双语三画幅检查与实拍摆放改善

新增 verify-keyword-style-formats.mjs，固定样式ID/revision、已有中文实测音频rev4及Alex实拍rev1；不生成新词时间。初始scale .65/center .5,.85、原视频焦点.5,.4，横屏1280×720、竖屏720×1280、方屏720²共6片，批次 production-6a758d3f827a900b2d90969518888d2d。全部技术导出成功。三画幅中文5处、英文4处主文字内容/开始/时长一致；查看中文最长“真正打动你的地方”三幅稳定帧未见裁切，英文竖屏/方屏longer sunlight仍与手部相交，不将统一居中位置判为通用通过。

保持样式v4和原视频参数，对Alex试映应用改为scale .48/center .74,.8，批次 production-87b016ee3deb8a41d8d25a3b66af030d三幅各1片，全部解码/音频流检查通过。回读编译数据：前后每幅4处关键词内容与时间完全一致，主视频参数（排除template标记）一致，实测词列表不变。库样式未改写。

生成3幅共12处关键词连续30fps边界联系表并验证视频SHA。实际查看方屏全部4处、横屏与竖屏December/longer sunlight两处边界，以及竖屏/方屏最后长词原尺寸帧：所查文字未覆盖手部，边距保留；右侧版文字相对更小，未将避让单一维度当作审美90分。另两段横屏/竖屏连续边界尚未逐张查看，未试听，不声称所有场景自动避让。

证据 Downloads/offset-formats-2026-09-28/timing-verification.json、offset-formats-right-2026-09-28/comparison.json及各motion-manifest。后者compare.html汇集9片（中文原3片、英文原3片、右侧3片）和3种可继续试映链接；链接保留样式版本/位置，声音与焦点需另选。目标整体仍未完成，中文实拍与更多样式评审仍有缺口。

### 属性面板增加快捷定位

编辑属性顶部新增“图层 / 外观 / 布局 / 动效 / 应用规则”定位入口。桌面在属性面板内部滚动，预留固定导航高度并将焦点交给目标；手机按页面滚动定位。应用规则点击后展开；当前图层不存在的外观/动效入口禁用。没有隐藏字段、重建数据或复制Rust逻辑。将返回用途选择按钮从详情底部移至顶部操作栏，沿用未保存/忙碌禁用保护。

verify-inspector-navigation.mjs 实际验证五个目标位于固定导航下方、应用规则展开、字体未保存编辑跨区定位后仍保留、返回禁用、撤销、390px无横向溢出及手机动效定位。库响应前后完全一致，无pageerror；Web类型检查和diff空白检查通过。桌面和手机截图 /tmp/inspector-navigation-desktop.png、/tmp/inspector-navigation-mobile.png 已查看。这改善编辑操作的发现与定位，不改变样式审美验收状态。

### 原生可编辑增长图标与三实拍验证

新增 style-study-20260928-growth revision1「增长提示 · 三柱跃升」，720²，decoration用途。根分组加圆形衬底、底线、三根柱形共五个可见原生图层；柱形通过同缓动scale_y与y补偿保持底部对齐，依次升起。颜色、几何、动效均为可编辑字段，不使用位图；柱高仅表示定性增长，不代表真实数据。作者脚本 scripts/templates/author-growth-decoration.mjs 通过原生inspect/CAS保存，保留定义证据。

已回收前轮两个进程的终态：浏览器验证五个可见图层并采集五个时间点原生预览通过；previewOnly批次 production-ed72710d0ef87e67a8aa0451232ec206 三个实拍输入均导出成功，解码与音频流检查通过。查看预览.48/.7秒帧，底线对齐、逐柱升起。三段实拍末次事件稳定帧均未裁切；第一段叠到人物上臂，另两段位于背景空白处，不能声称通用自动避让通过。

review-keyword-motion.mjs 新增 REVIEW_ELEMENT_ID（默认headline兼容既有调用）；每fixture找不到目标图层或全局无帧时断言失败，防止非文字样式空检查仍显示成功。以bar-2生成11处事件连续30fps联系表，并检查来源MP4 SHA与生产证据一致。实际查看三输入各首个事件连续帧：柱形依次升起、稳定与退出正常。其余8处已抽帧但未逐张审阅。此批沿用已有关键词作时间压力测试，未声称增长图标与各句语义匹配；生产仍有已有字幕分段字数/阅读速度提示，未屏蔽。

证据 /Users/zhengwei/Downloads/growth-decoration-2026-09-28/：definition.json、stage-*.png、review.html、review.json、batch.json、motion-manifest.json及连续帧。未试听、未正式审美评分；图标语义选择、更多画幅和场景适配仍待完成，整体目标保持进行中。

### 小尺寸装饰试用操作补齐与按画面摆放

发现主样式试映scale滑块限制.5–2/.05，但Rust契约及叠加样式支持.1–4，因此26%图标的深链接虽可执行，滑块不能正确表现或调整该大小。effect-trial.tsx主滑块改为.1–4/.01，与原生范围及叠加编辑一致。真实Chrome验证26%链接显示、调18%原生application成功、URL和刷新恢复18%、390px无横向溢出、库定义不变。Web类型检查通过，脚本/tmp/verify-small-style-scale.mjs。

新previewOnly批次 production-9f9fb000c57f8bf42ca124329ace1d17 测试同样26%大小、中心.16/.24左上位置。观察到running后等待同批次终态succeeded，没有重建任务；三成片技术解码/音频流通过。前后11处事件开始结束及样本完全一致。review-keyword-motion.mjs增加REVIEW_FULL_FRAME=1，避免默认下半裁剪漏掉上方元素；11处全画面30fps联系表和视频SHA检查通过。

实际查看三片最后事件稳定帧和第一片首事件连续帧：第一片左上空白处避开了原先上臂遮挡，柱形升起/退场正常；另两片左上会覆盖太阳示意或接近背景标志，故建议继续采用原右下位置。没有把同一位置认作通用解。对比页保留全部六片便于继续审阅，未改库样式，未声称其他8处连续帧已人工全审或已试听。

证据 Downloads/growth-placement-2026-09-28/compare.html、placement-comparison.json、review.json、motion-manifest.json。语义选择、竖屏和更多场景仍待验证；整体质量目标未完成。

### 试映位置九宫格与独立布局默认值

主样式和叠加样式的独立布局增加共享PositionPicker：九个中文位置按钮，以.25/.5/.75设定中心，保留当前大小，现有滑块/数值仍可微调。选择状态使用aria-pressed，手动位置偏离预设后不标选，参数仍由原生application/insert执行和校验、沿用URL恢复。没有根据画面自动推断位置或在Web复制布局计算。按钮继承已有fieldset忙碌禁用。

浏览器回归发现已有叠加默认scale.65/center.5,.85对于高图标会返回layout must fit normalized canvas。将开启独立布局的默认中心改为.5,.5，主样式无初始参数时也改居中；已有链接保持原值。快捷位置留边但不保证任意大尺寸都不会越界，沿用原生拒绝与页面错误反馈，不静默缩放。

scripts/templates/verify-trial-position-picker.mjs真实Chrome验证：主样式左上和叠加右下分别调用原生接口，大小保留；主样式元素timing/motionTiming/motions与原请求完全一致；数值微调取消预设标选；主/叠加参数刷新恢复，互不覆盖；实际共享画布完成渲染且非空；390px无横向溢出；库响应前后完全一致、无pageerror。Web类型检查通过。桌面/手机截图 /tmp/trial-position-desktop.png、/tmp/trial-position-mobile.png已查看。一次开发期间热刷新打断响应读取，停下编辑后重新回归通过。这轮验证交互和示例渲染，不新增声音导出或审美验收分数。

### 语义选择的三样式组合实际导出

新增 verify-semantic-style-combination.mjs：固定逐词字幕v3、双层花字v4、增长图标v1，用原生application/insert组合到隔离previewOnly工程。图标应用副本的五层intents设为metric，最后“longer sunlight”语义段标metric，其余emphasis；只表示日照时长增加，不把三柱当作数据。字幕沿用实测Alex输入rev1、37词，使用42字符/5秒分段policy自动生成范围；原视频区域高度.8，字幕底部.9；花字scale.38 center.73,.68，图标scale.2 center.87,.4。三个库定义均未写回。

批次 production-df8e09ae7c62e7fcc7636a302ac0a6cb 已succeeded，一段成片解码/音频流检查通过。check-semantic-style-combination.mjs核对编译输出：7字幕单元，4次花字与原词范围一致；增长图标五个不同图层仅各出现一次，全部10.88–12.32秒，与“longer sunlight”实测范围一致；无其他语义段图标。37词文本/高亮时间/主文字全不透明及MP4 SHA校验通过。

实际查看最后关键词稳定帧、其完整30fps入退场联系表、全片2fps联系表及37词中点字幕联系表。所查字幕无裁切、图标和花字未互相覆盖，图标位于右侧空背景；花字仍贴近人物胸前，未当作审美完成。该语义映射由人工/Agent选择而非自动语义识别验收；通用工作台内按组合实例编辑语义筛选的便捷入口仍需核查。未试听，不新增90分声明。

证据 /Users/zhengwei/Downloads/semantic-style-combination-2026-09-28/review.html、semantic-verification.json、highlight-verification.json、motion-manifest.json、designs.json和pinned-styles.json。实际组合例证明三个独立角色能共用声音时间轴并区别触发；更多画幅/输入和审美质量目标仍在进行。

### 应用级语义筛选接入原生、AI与试映（2026-09-29）

Application和Insert新增可选intents数组：省略沿用原样式各层过滤，[]取消语义限制，指定值统一覆盖本次样式所有可见图层。Rust执行投影覆盖，插入只修改layerMap中的新图层；源样式和宿主其他图层不变。应用请求指纹包含显式筛选值；旧省略字段不序列化，保留旧请求指纹。新增原生测试覆盖沿用、数量筛选、取消、非法枚举、两条插入路径和源/宿主不变。AI工具说明及原生schema同步暴露。

试映主样式及每个叠加样式新增“出现语义”，选择沿用/所有或十种语义之一，沿用既有URL持久化、编译和组合捕获。支持读取已有多值数组并显示自定义多种语义，界面选择具体项时统一为单类；没有自动识别语义。UI提示这是本次应用的统一设置。该入口独立于位置、尺寸和TTS时间。

Rust模板测试196 passed/1 ignored，Web类型检查通过，MCP10项通过。空闲队列下构建并更新服务，当前PID5148、日志/tmp/moirai-footage-intents.log。启动就绪前首次页面回归读取失败，确认/api/footage/state=200后继续；浏览器回归先发现宿主JSON往返1e-17级浮点差异（验证比较限定12位小数）及脚本Fetch ok接口写错，修正后完整通过：主/叠加原生过滤、宿主/几何/时机和库不变、刷新、恢复原规则、所有语义、捕获返回五个metric图层、390px布局、无pageerror。捕获未保存新资产，不把只读捕获称作已写库。截图/tmp/trial-intents-mobile.png已查看。

更新组合作者脚本改为直接传原生intents，不再在脚本里遍历改图层。AUTHOR_ONLY生成定义后，用前轮实测输入调用原生plan：仍7段字幕、4次花字，增长图标五层仅10.88–12.32秒出现一次；证据Downloads/semantic-style-api-2026-09-28/plan.json和semantic-verification.json。本轮未新增视频导出或审美评分，前轮成片仍作为视觉证据；全局质量目标未完成。

### 语义筛选后的示例预览闭环（2026-09-29）

发现原生PreviewExample固定生成emphasis语义，设置metric等应用筛选后默认示例无匹配元素，页面只会显示底层错误。新增可选example.intent（缺省仍emphasis），仅影响合成示例SemanticUnit，所有实测声音样本分支保持原标注。EffectPreview的“示例文案”新增语义选择，接入原生预览、代表帧选择和解除依附的预览上下文，防止语义变化后沿用旧帧。出现语义与示例语义共用展示标签文件；样式筛选不随示例改变。

no supported elements的示例错误改为中文提示检查示例语义/重点词；实测声音提示检查内容重点、语义及样式匹配。不自动取消过滤，也不把合成示例当真实TTS结果。AI预览工具说明新增intent及默认值。

原生测试覆盖默认强调无法触发metric图标、匹配metric生成非空原生轨道、无声音轨道、synthetic_example来源与非法枚举。最初测试使用按video_start触发的通用装饰，即使选择metric仍无匹配；修正测试为本次要验证的keyword触发装饰，保持视频事件没有凭空获得口播语义。模板回归197 passed/1 ignored，Web类型检查、MCP10项通过。空闲队列下更新本地服务，PID7306，日志/tmp/moirai-footage-preview-intent.log，/api/footage/state=200。

verify-preview-intent.mjs真实页面验证：metric筛选下默认强调示例提示未触发；选择metric后原生返回合成时间且无音轨，共享画布完成渲染、可见且非空；切为question再次出现匹配提示；应用筛选仍metric、库定义完全不变、无pageerror。截图/tmp/preview-intent-metric.png已查看。未新增实测音视频导出或审美评分，整体质量目标仍未完成。

### 三样式组合花字避开人物胸前（2026-09-29）

作者脚本新增EMPHASIS_CENTER_X应用参数，保持三份库样式版本与源声音，花字中心从.73右移至.85，其余尺寸和位置不变。新previewOnly批次production-3010aed21ba0823e67b5e813f4d2c450，一段视频succeeded、解码与音频流检查通过。对比旧production-df8e09ae7c62e7fcc7636a302ac0a6cb编译数据：20个元素开始/时长一致，词和语义段一致；8个花字图层仅positionX增加153.6px，其余视觉参数和关键帧时间/值/缓动相同（忽略新编译生成的关键帧UUID，数值比较精度9位小数）。原生语义仍只在10.88–12.32秒触发图标，四次花字、7字幕段、37词高亮检查通过。

生成并实际查看四次花字完整30fps入退场联系表，包括December、June solstice、northern hemisphere、longer sunlight；另查看最后事件原尺寸帧。右移后花字位于人物右侧背景，所查没有脸/手势遮挡或画面裁切，和字幕及上方图标分离。保持字号未缩小。此结论仅限这一英文横屏片段，不代表其他人物/画幅适配，不做90分声明、未试听。

Downloads/semantic-style-layout-2026-09-29/compare.html保留前后两段视频和稳定帧；链接可以回到工作台恢复完整三样式应用（字幕v3、花字v4、图标v1及位置、大小、原视频区域、语义限制），声音与段落标注需要另选。真实浏览器读取链接的最后一次insert结果，与生产定义完整对比通过（排除trial ID/name，数值10位精度）。证据layout-verification.json、semantic-verification.json、highlight-verification.json、motion-manifest.json。图形库未改写；全局质量/丰富度目标仍待完成。

### 三角色组合补齐竖屏与方屏应用样例（2026-09-29）

组合作者脚本新增STYLE_FORMAT，分别设计layout配置，不直接把横屏右侧位置套到竖屏。竖屏720×1280：原视频高度.4、图标中心.5/.46 scale.15、花字中心.5/.57 scale.7、字幕中心.5/.78 scale.85。方屏720²：原视频高度.6、花字中心.5/.69 scale.55、图标中心.86/.7 scale.14、字幕中心.5/.87 scale.7。两者字幕宽.84，保留三个库版本和同一实测Alex输入、语义标注及policy；原视频按同一焦点.5/.4裁切填充。

previewOnly批次竖屏production-e980da8710ce8bc95b3f349108fc8760、方屏production-d2d8280a0ccd5c3b9986c5b84096bc44均succeeded，各1片实际导出/解码/音频流通过。每片仍7字幕段、4花字事件、增长五层仅10.88–12.32秒出现一次，库未变。两片共74词高亮文本/实测时间/全不透明及视频SHA检查通过；八处强调全画面30fps联系表生成并实际查看，另外查看末次事件稳定帧及两片37词中点字幕联系表。

所查范围中花字、字幕和图标互不重叠，长词和两行字幕没有裁切，文字放在画面外的独立区域，未遮脸或手势。竖屏留白较多，尚未作审美评分；这是同一英文素材的画幅适配验证，不能替代中文、多场景或不同声音内容。未试听。

证据Downloads/semantic-style-portrait-2026-09-29及semantic-style-square-2026-09-29的review/semantic-verification/highlight-verification/motion-manifest；三画幅聚合页Downloads/semantic-style-layout-2026-09-29/formats.html。该轮增加两种可复验应用布局，整体90分/丰富度目标未完成。

### 竖屏紧凑布局候选（2026-09-29）

为处理前轮竖屏留白偏多，组合脚本增加COMPACT_PORTRAIT=1候选：原视频高度.4→.55，花字中心.48/.66、图标中心.86/.66同排，字幕中心.5/.85；三者scale保持原竖屏值.7/.15/.85。库样式和声音样本不改。新previewOnly批次production-9c5047878ac98557c3d949948919f60d成功导出1片，解码/音频流检查通过；7字幕单元、4强调、图标五层仅10.88–12.32秒，37词高亮实测时间/文字/全不透明/MP4 SHA通过。

实际查看末次稳定帧、全片2fps联系表、northern hemisphere和longer sunlight两处完整30fps联系表。强调与图标未交叠、字幕两行未裁切，人物更大且留白减少。较紧源视频裁切会减少两侧背景，某些边缘手势靠近画面边缘；不能称为完全保留所有原图信息或所有手势边界通过。另两处连续帧已生成，未在本轮逐张查看，未试听、未评分。

证据Downloads/semantic-style-portrait-compact-2026-09-29/compare.html保留原版与紧凑版，semantic-verification.json/highlight-verification.json/motion-manifest.json记录技术检查。该候选改善本素材竖屏视觉密度，未强制替换所有画幅或写回库，整体目标继续。

### 全库验收清单与消散重影短词可读性修正（2026-09-29）

读取运行服务资产与评审，生成 docs/style-library-audit-2026-09-29.md：20个活动条目、18个用途已分类；两条无用途条目保留，不擅自归档。当前有效评审只有纸签85、引用79，无达到90记录。分类/技术成功均不冒充独立样式质量完成。

青色侧标r2、宋体字幕r2、消散重影r1以长中文合成示例在真实页面渲染并查看稳定帧，均无裁切；证据Downloads/style-long-text-audit-2026-09-29。此为合成预览，不是实测声音。继续用三份已有公开实拍、原词时间、同一scale .48/center .74,.8试映消散重影，旧版批次production-b27129bdefc2394e06ba4749c7542a21三片成功。编译揭示December .36秒内主文字仅.04秒完全不透明，30fps联系表确认淡入/退场占用大部分窗口。

新增refine-echo-readability.mjs，经inspect/CAS写回style-study-20260924-echo r2：只移除headline透明度动画，两个文字层motionTiming改enter .12/exit .06；保留重影自身透明度与位移动效、图层编辑结构和内容绑定。重复运行同一目标为no-op；意外新revision拒绝覆盖。新版批次production-fdb3daea3f3e74de34129b3f89e0da9b三片实际导出，解码/音频流验证通过。比较三个fixture全部非template输入相同、11个主文字事件的文案/开始/时长相同，主文字opacity=1且无透明度轨道，对应可读性警告消失；重影的透明度提示仍保留，没有屏蔽检查。

新版11处30fps联系表及视频哈希全部生成核对；实际查看December、brother's calculator、vantage point from space三处完整边界，及三片末次稳定全幅帧。December入场即清晰；长词未裁切，但单行自适应缩小后字号偏小，统一右侧应用仍有文字叠人物衣服。没有声称全场景构图通过；其他8处连续帧未逐张审阅，未试听、未评分。新版长中文真实页面预览完成且库前后不变。

证据Downloads/echo-readable-2026-09-29的before-definition/definition、readability-verification、motion-manifest、review及compare.html。对比页保留前后六片；原用户工程未修改。整体20个≥90目标继续。

### 消散重影长词两行排版与阶段性评审（2026-09-29）

继续处理r2单行长词字号过小。refine-echo-readability.mjs新增ECHO_MULTILINE=1模式，经原生inspect/CAS将headline-style与echo-style的maxLines改为2并保存r3；保持区域、字号上限、颜色、位置、输入及已有可读性修正。该模式只接受预期r2，已满足目标时no-op；不覆盖未知中间修改。

production-9016bfb4e3d3fd4f34b5f217f08a10c0以与r2完全相同的三个英文实拍和应用参数（1280×720，scale .48，center .74/.8）成功导出三片，解码和音频流检查通过。核对22个主文字/重影实例，非template实测输入、词内容、开始时长、排版范围、字号上限和位置均相同；两层maxLines由1变2，主字保持全不透明。layout-verification.json保存事件证据。

已查看三片末次长词原尺寸全幅帧及全部11处关键词完整30fps下半画面入退场联系表，核对视频SHA。长词组两行明显增大，December保持单行；所查无换行抖动、重影层间错位或裁切。统一右侧摆放仍叠人物衣服，Deborah胸前信息被压住。中文长词仅另做合成预览，不能计为真实中文样本；未试听。

verify-saved-multiline-style.mjs扩展可选STYLE_ASSET_ID并逐个检查所有文字层，保留默认青色侧标行为。真实Chrome验证消散重影两个图层面板maxLines=2、刷新保持、原生试映采用r3且两层仍为2，库未变。长中文真实预览两行完整，库未变。

按已查看证据登记阶段性评审82/100：构图18、动效22、素材17、适配16、编辑性9。阻断项为胸前信息遮挡和实际播放听感/小比例重影辨识未验收。原生核验应用与生产图一致，三个视频哈希一致；回读current与evidenceCurrent=true、meetsInternalThreshold=false。无用户审美认可或90分完成声明。

证据Downloads/echo-multiline-2026-09-29：definition、layout-verification、motion-manifest、style-review-request/receipt、gallery及compare.html（r2/r3六片与稳定帧对照）。库验收清单同步r3与82分。总体目标仍未完成。

### 消散重影画面外文字区候选（2026-09-29）

为处理r3右侧应用叠人物衣服，增加一次独立应用候选，库样式不改：videoRegion x .11/y0/width .78/height .78，文字scale仍.48、center改.5/.89。verify-paper-public-scenes.mjs支持STYLE_VIDEO_REGION原生参数并保存完整application.json；沿用Rust验证，没有在Web加入编排算法。三份源片ffprobe确认1280×720或1920×1080，均16:9。

previewOnly批次production-332330780642671f92b7acf880301b1d三片导出成功、解码/音频流验证通过。编译核对22个图层实例的实测非template输入、词内容、开始/时长、文字大小与排版范围相同；相对新位置的动画关键帧、缓动和时间相同（排除关键帧UUID，浮点9位）。源视频crop四边为0、横纵等比.78，未通过裁切牺牲人物区域。绝对positionX动画值随新摆放平移，不能直接误判为动效修改。

实际查看三片末次稳定全幅帧、三片全程2fps联系表及December完整30fps全幅边界；所查文字均位于视频下方独立黑色区，不再叠人物衣服。代价是人物画面缩小和上下左右留黑增加，不能当作所有场景更好或90分通过。全部11处全幅30fps联系表及视频SHA核验完成，其余10处连续帧本轮未逐张审阅。未试听，未新增评审；原右侧应用82分不继承。

compare.html保留前后六片和长词稳定帧，提供恢复此应用的工作台链接。真实Chrome验证链接所得原生template与生产定义一致（排除ID/name，数字10位），原视频宽高可编辑字段均为.78。trial-link-verification.json记录结果；声音需另选。证据Downloads/echo-separated-2026-09-29。未改原用户工程或库定义，整体20个高质量样式目标继续。

### 新增原生完成提示图标与工作台验证（2026-09-29）

新增author-completion-decoration.mjs与style-study-20260929-completion「完成提示 · 勾选成形」。720²装饰用途，无外部位图、无文字输入；薄荷外圈/深绿圆章/短笔/长笔以及3个圆角，共7个可编辑可见图层。通过矩形沿旋转方向scale_x和x/y补偿让笔画起点固定，短笔先出现，长笔随后成形；入场.18秒、退场.06秒，关键词提供实际时间。

首版r1只有4层，原尺寸稳定预览发现两段矩形接缝有缺口。补充起点、接缝和终点圆角为r2并经inspect/CAS保存；before-definition保留r1。圆角按笔画到达时机出现，预览.42/.50/.70秒实际检查了短笔、长笔展开及完成状态，接缝缺口消除。之前.22/.30帧为空是默认示例事件尚未开始，不是动效失败。

review-active-style-gallery.mjs增加PREVIEW_TIMES自定义采样、非空样式/时间检查，并保存原生预览事件范围以区别空白前奏；修复Playwright range填充值浮点尾数及尾零导致Malformed value（转换到规范两位步长数值字符串）。r2六个时间点真实共享画布捕获完成、库前后不变。

previewOnly批次production-5cce59bf65308eb23f1fc310241d15b9，scale .2/center .86,.24，三份已有实拍全部导出，解码/音频流通过。11处check-long全幅30fps联系表与MP4 SHA核验完成。实际查看三输入各首事件（含December .36秒短词）连续帧和各末次稳定全幅帧：圆章与勾选完整形成/退出，所查未遮挡人物或裁切。其余8处连续帧未逐张审阅，未试听。本次重复沿用关键词仅检验时长，不作为自动识别完成语义或语义匹配的证明。

真实Chrome逐一选中全部7个图层，填充色字段与保存版一致，刷新仍能选中长笔并读到颜色；390px页面无横向溢出、无pageerror、库定义不变。editor-verification.json记录面板验证。当前活动库21条，已分类19条；新增图标尚未登记审美评审，不计入≥90完成数。

证据Downloads/completion-decoration-2026-09-29：definition、before-definition、native-preview-r1、gallery-motion、application、editor-verification、motion-manifest及review.html。原用户工程未改，整体目标继续。

### 新增原生时钟图标，已分类样式达到20条（2026-09-29）

新增author-clock-decoration.mjs，原生inspect/CAS保存style-study-20260929-clock r1「时间提示 · 指针轻转」。暖白表盘、蓝灰表框/刻度、深蓝短指针与轴心、橙色转动长指针；共11个独立可编辑图层，无文字输入或外部图片。长指针入场.16秒顺时针转四分之一圈，.06秒退场；仅作时间意象，不表示真实时刻、倒计时或测量时长。矩形绕中心旋转时补偿位置保持轴端固定，圆形笔端与指针一同移动。

真实工作台采集六个时间点并查看初始、中间、稳定帧，表盘/短指针/刻度保持固定，长指针围绕轴心转动。新增verify-native-decoration-editor.mjs，逐一选中所有11个图层，填充色控件可操作且与保存定义一致；刷新、390px无横向溢出、无pageerror及库前后不变验证通过。此检查不冒称逐项修改所有属性后保存导出。

previewOnly批次production-67a07f6f70f4cb4797231d836b20449f三份已有英文实拍均成功导出、解码与音频流通过，应用scale .2/center .86,.24。11处minute实例全幅30fps联系表与视频哈希核验完成；实际查看三片末次稳定全幅帧、Deborah首事件与Alex December短事件完整连续帧。所查时钟未遮人物或越界，指针完整转动并退出。其余9处连续帧未逐张审阅，未试听、未审美评分；这些重复关键词仅用于时长压力测试，不作为语义适配证明。

额外以真实编译参数核验11个时钟事件：逐线性关键帧区间采11点，用矩形半长和rotation反算轴端/圆头中心。该1280×720、scale .2应用采样最大圆心与圆头偏差约.030832像素，小于.04；这是几何一致性证据，不是视觉质量分。pivot-verification.json记录每事件。

证据Downloads/clock-decoration-2026-09-29：definition、application、gallery、editor-verification、pivot-verification、motion-manifest及review.html。运行库当前22个活动条目，20个有用途分类，2个旧未分类条目保留。20是分类样式数量，不等于20个达90分；当前审美/语义与多场景验收仍未完成，整体目标继续。

### 样式库卡片展示应用评审，修复语义筛选试用链接（2026-09-29）

样式列表增加当前保存版应用评审摘要：待评审、读取中/失败、单应用分数与原生达标标记、多应用记录数及达标应用数。只按Rust返回的current/evidenceCurrent/meetsInternalThreshold展示，不在Web按分数重算门槛，不取历史最高分代表整个样式。历史或失效证据不冒充当前评审；列表提示选中可查看具体布局、成片与依据。卡片与详情共用一次评审读取，资产版本变化或刷新库时重新读取，选中切换不再重复拉取全部记录。

发现StyleReviews试用链接未保留Application新增的intents。补充类型、明确语义展示与URL序列化，省略保持沿用规则，显式[]保持所有语义，指定数组原样恢复。其他画幅/位置/大小参数沿用原投影；未改Rust评分业务。新增列表提示后调整桌面网格行与手机横向卡片高度，避免摘要被裁切。

Web类型检查通过。verify-library-review-summaries.mjs真实Chrome验证纸签85、消散重影82、新时钟待评审，以及选中后390px摘要可见/无页面横向溢出。只在浏览器响应中注入503、历史99分、证据失效99分、99分但原生未达标、两应用一达标等情形，逐项验证状态；未写评审或资产。带metric与[]的模拟评审链接实际进入试映，原生application输出元素intents与链接值一致。结束后资产和真实评审API响应完全不变、无pageerror。

verify-review-playback-lifecycle.mjs重新通过：静音实际播放互斥，收起成片/历史/评审或切换样式均暂停、断开并清理视频src；不因此声称已试听。证据Downloads/library-review-summaries-2026-09-29/desktop.png、mobile.png和verification.json。两张布局截图已查看；缩略图仍在异步加载，不把该截图当样式视觉验收。此次改善工作台质量状态可见性与规则恢复，没有新增90分评审，整体目标继续。

### 中文实测词时间与独立图标组合验证（2026-09-29）

新增verify-chinese-semantic-icons.mjs和check-chinese-semantic-icons.mjs；previewOnly批次production-6101296fe308a20b217da8e0c89e00b9三份已有中文TTS输入成功导出720²视频。独立复用caption r3、clock r1与completion r2；Agent显式标注时间/完成语义范围，未声称自动语义识别。全部175个原转写token内容与时间保持不变。每输入各一次时钟11层与勾选7层，共54层精确跟随标注范围；普通段落不插入图标，三个库定义不变。

实际查看全部六处图标30fps连续帧、三张逐词高亮采样联系表与三个末次稳定全幅帧：所查图标完整入退场，无字幕遮挡/越界，勾选接缝正常，指针围绕轴心旋转。长中文保持两行，但出现“最/重要”等词组被换行拆开的现象，不能作为优质中文排版已完成的证据。175个高亮编译内容/时间/全不透明及MP4哈希验证通过；联系表的采样不等于全视频逐帧审阅。三片解码和音频流检查通过，未试听。黑底音频样本不能证明实拍背景适配。

已收取先前运行的真实Chrome链接验证结果：试用链接恢复完整原生组合图（排除id/name，数字10位），包括空字幕intents与两个图标独立筛选规则。生成semantic-review.html，包含三片、六处语义时段、联系表及工作台试用入口。证据Downloads/chinese-semantic-icons-2026-09-29。无新审美评分；20个≥90目标继续，下一项明确缺口为中文词组边界换行。

### 中文标点换行缺陷修复（2026-09-29）

检查fit-region发现已使用Intl.Segmenter按词换行。“最/重要”来自分词器的合法两个词边界，因此上一项短语问题仍未解决，不能通过临时拼接一个特例宣称支持语义短语。另确认所有标点一律附着前词会让左括号/左引号留在上一行末尾，新增真实字体度量回归测试先复现失败。

修正共享Canvas文字区域适配：Unicode Ps/Pi开标点连同其后词测量，闭标点继续跟随前词；嵌套开标点、其后空白及未闭合用户输入保留。这是依赖具体字体宽度的渲染排版，保持在UI渲染层；未新增Web语义识别/调度业务。测试覆盖中文圆括号、弯引号、书名号、方括号和嵌套符号的行首行尾约束、原文完整及宽度预算。

bun test src/text：21通过、0失败、135断言，包括高亮跨行映射、附件边界与字号适配。此轮未重新导出或浏览器截图，不把Canvas单测当成浏览器/成片视觉验收。中文语义短语边界及整体20个≥90仍待完成。

### 中文标点预览与高亮回归补验（2026-09-29）

真实Chrome打开保存的逐词字幕r3，使用合成示例“今天先完成（重要任务），再确认‘最终结果’。”（实际输入使用中文双弯引号），在.7/1.2秒采集共享预览Canvas；两帧已查看，完整双行文本无越界，括号和引号完整，逐词黄色高亮正常显示。输出Downloads/chinese-punctuation-preview-2026-09-29及manifest，库前后完全不变。这个示例断行位于逗号后，不能单独证明狭窄边界处左括号移动；该边界由真实字体度量回归测试覆盖。仍无新导出或试听。

新增中文高亮回归：将“今天（重要任务）”限制到“今天（”的测量宽度，断行后首行必须为“今天”，跨行高亮拼接必须精确为“重要任务”，原始高亮范围保持。bun test src/text共22通过、139断言。修复影响字形布局，不改音频时间和语义选择。语义短语完整性与20个≥90验收仍待推进。

### 字幕语义短语边界核对与实施设计（2026-09-29）

实际读取rhythm.rs/events.rs/compiler.rs及production_author.rs，确认现有语义段、显示段、重点词和逐词时序无法独立表达排版短语。补充docs/caption-phrase-layout-design.md：可选输入layoutPhrases、Rust按真实拼接映射UTF-16、静态范围与原文绑定、跨显示段警告、过长短语回退、显式换行优先、人/AI编辑闭环及预览导出验收。明确不复用keyword、不插零宽字符、不修改TTS时间。此项仅设计，字段尚未实现；后续据此实施，不能将其计作已支持能力或90分结果。

### 排版短语原生模型与共享渲染实现（2026-09-29）

PlanInput和production Sample新增可选layoutPhrases:[{wordSpan:{startWord,endWord}}]，省略不改变旧序列化。原生拒绝空/越界/乱序/重叠范围；跨CaptionCue返回layout_phrase_crosses_caption:index:start:end并跳过该提示，不改字幕划分和时机。events对完整包含范围且内容可验证的Sentence/Keyword实例映射UTF-16 layout_ranges；compiler写入静态text.layoutPhrases原文+范围JSON，不使用动画高亮范围，不改变原词或音频时间。合成样式预览暂不接收该提示，默认空数组。

共享Canvas新增layout-phrases读取验证，手改文案导致原文不符或范围损坏/切开代理对时忽略；fit-region按字体宽度将提示范围内的分词拼组，过宽回退普通换行，显式换行优先并保留原UTF-16偏移。没有加入中文词义推断或字典特例。提示只作用于已有区域适配文本，不将双语专用排版冒称已支持。

原生测试证明词、CaptionCue、实例开始结束不变，含emoji的UTF-16映射正确、非法范围拒绝、跨显示段提示并跳过。cargo test -p moirai-footage --lib templates:: --no-default-features：199通过、1忽略。Web文本测试25通过，随后新增静态短语在高亮逐字切换时布局不变测试，短语专项4通过。Web tsc通过。真实字体测量下“今天最/重要”变“今天/最重要”，字号不变；长范围回退、显式CRLF与内容失效覆盖。

尚未更新运行Rust服务，尚无新浏览器应用/实际导出证据；内容选择、保存与取消的UI及AI契约说明仍需补齐。docs/caption-phrase-layout-design.md状态同步为核心已实现、编辑与导出待完成。此轮不新增审美分数，整体目标继续。

### 短语排版工作台入口与运行服务更新（2026-09-29）

新增LayoutPhraseContent，内容审核区可按实测起止词设置“尽量同排”、查看与取消。提交原生plan校验；非法/重叠请求保留原设置，跨字幕段展示原生警告。production-create在即时sample-preview、内容预检、production样例、sessionStorage保存/恢复中传递同一layoutPhrases；恢复先校验transcriptRevision，校正转写后清空旧提示并在面板说明需重选。业务合法性仍由Rust负责，前端只收集并按词序排列选择。

Web tsc通过。构建moirai-footage二进制，确认state无活动job且PID7306身份匹配后更新服务，新PID30381，日志/tmp/moirai-footage-layout-phrases.log；state返回200，未改配置/凭据。真实Chrome verify-layout-phrase-ui.mjs通过：中文输入选13..15“最重要”，sample-preview包含静态范围，保存/刷新/恢复原范围，重叠提示被原生拒绝且原项仍在，取消后预览收到空数组；390px无横向溢出、无pageerror、库前后不变。手机全页截图已查看，选项/按钮可见；未将截图里的其他时刻字幕当作短语换行视觉证据。证据Downloads/layout-phrase-ui-2026-09-29。

docs/template-production.md补AI输入及回退/失效约定。成片属性面板直接编辑范围、双语专用排版仍未接入。verify-layout-phrase-exports.mjs在前次三份中文组合样例上仅追加短语提示，保持样式、音频、词时间与分段；previewOnly批次production-8a73e9951a8f7f93ef02b0d77b9e872f已提交，证据Downloads/layout-phrase-exports-2026-09-29。需继续读取同一批次并验证实际导出，不应重复提交新批次或提前宣布通过。

### 同排短语三片导出完成与前后画面对照（2026-09-29）

上述production-8a73e9951a8f7f93ef02b0d77b9e872f已succeeded，三项preview解码/音频流校验通过并复制MP4。check-layout-phrase-exports.mjs逐项对照前批次原始input（仅排除新增layoutPhrases后完全相同），所有图层ID/内容/start/duration相同，每输入仅一个字幕实例带静态提示，映射短语分别精确为“最重要”“完成时间。”“完成时间”。

实际抽取前后三对全幅帧并查看：第一例“先选出今天最/重要的一件事，”变为“先选出今天最重要/的一件事，”，短语保持完整、字号观感未明显缩小，高亮仍对“重要”；另外两例原本同排，检查时刻的换行/时钟均未变。第一例上下行长度更不均衡，提示生效不等于更优整体排版或90分。未逐帧检查全部视频、未试听，不能据此宣称终验收。

review.html已加入三组前后图、三片播放器及边界说明；format全程2fps联系表已生成但此轮未逐张审阅。证据Downloads/layout-phrase-exports-2026-09-29，包括range-verification.json。当前无待运行导出。后续仍需改进平衡换行选择、成片属性编辑，并完成整体样式质量验收。

### 居中字幕的测量断点优化（2026-09-29）

此前同排提示生效后，贪心缩窄宽度只能得到“先选出今天最重要/的一件事，”。新增中文回归先复现失败，新增balance-lines.ts：在最终字体、固定行数和词/短语分组上寻找测量宽度偏差平方和更小的断点。保留标点附着、显式段落、内容和宽高预算；只对居中多行采用，超过128段或8行回退既有算法，避免无界搜索。字形测量仍属于共享渲染层，不在Web增加语义推断。

回归得到“先选出今天/最重要的一件事，”，字号不变。Web文字测试27通过，随后补多段英文内容顺序、显式段落边界、行数/宽高约束测试，区域专项8通过；tsc通过。此前新增测试误把显式段落当作段内禁止换行，已修正为验证段落边界保留，未修改实现来满足错误预期。

导出脚本支持PILOT_OUTPUT与RENDER_VARIANT，便于同一参数针对渲染器变化生成独立幂等批次。previewOnly批次production-6ff70819543dec6d68a5c2b83d366ba9已提交，root Downloads/layout-phrase-balanced-2026-09-29；编译对照仍确认三份输入除短语提示外完全不变，全部图层内容与开始/时长不变。需继续读取同一运行批次，实际画面尚待验证。

上述平衡版批次已succeeded，三片复制并通过解码/音频流检查。查看全部三组前后目标全幅帧：第一例变“先选出今天/最重要的一件事，”，第二例从“写下负责人和/完成时间。”变“写下负责人/和完成时间。”，第三例保持原换行；所查短语、高亮与图标完整，无越界。review.html追加三组对照。全程2fps联系表已生成但尚未逐张审阅，未试听、未评分。目标仍需完成成片属性编辑及更广范围样式验收，不能用这三帧宣布整体达90分。

### 成片属性面板的同排短语编辑与持久化（2026-09-29）

新增TextLayoutPhraseEditor并接文本属性页。读取原生静态text.layoutPhrases，显示原文短语；可选择当前文字添加、移除单项、全部清除。readLayoutPhrases拒绝重叠/切开UTF-16代理对等选区，文字修改后旧元数据失效并提示；新建范围替换失效内容。通过现有useElementPreview提交，可撤销与自动保存，不操作word/highlight动画。内容关键帧和双语专用排版禁用新增并说明原因；没有最大宽度/多行预算时提示先配置区域。

Web tsc通过。verify-layout-phrase-inspector.mjs从平衡版样例建立独立测试工程，原样例文件逐字节保持不变；浏览器验证读取已有“最重要”、逐项移除、undo、清空、文本选区5..8添加、等待落盘、reload、改文案后失效、undo恢复，以及start/duration/animations原样不变。成功工程tpl-preview-phrase-inspector-3ebac9d1-b166-4525-84a7-2fc8962f5f4e，报告与已查看截图在Downloads/layout-phrase-inspector-2026-09-29。

测试脚本早期遇到离页对话框与选区操作问题；最后使用DOM文本选区并触发键盘selection事件，先断言实际selectionStart/End，再点击真实按钮。该证据覆盖属性操作与保存，不宣称已验证纯方向键选区体验；先前关于“全局快捷键接管”的推断未被源码证实，isTypableDOMElement实际包含readonly textarea，原因仍未定位。早期失败测试工程保留，不计作成功。无原参考工程写入，无新增审美评审。

### 只读选字框的键盘选区补齐（2026-09-29）

继续排查前项纯键盘选区失败：带onboarding抑制的真实编辑器中，焦点始终在textarea，Ctrl/Meta+A选全后ArrowLeft/Right与Shift扩选仍保持0..13。另建空白Chrome页，仅放一个原生readonly textarea和一个普通textarea，运行同一按键序列；只读框仍0..13，普通框为预期5..8，证实该运行环境的原生只读控件行为，不能归咎全局编辑快捷键。

新增共享TextSelectionArea，关键词范围与同排短语编辑均使用它。保持readOnly、鼠标选择与原生全选；为无Alt/Ctrl/Meta的左右键和Shift扩选提供明确光标/锚点行为，以Intl.Segmenter grapheme边界移动，避免切开代理对或ZWJ组合字符。该操作仅为UI文字选择，不做语义推断或内容写入。

verify-layout-phrase-inspector.mjs改为真实键盘全选→收起→右移→Shift扩选，并断言原生selectionStart/End=5..8，再点击添加；此前的DOM直接设置选区方式不再是本轮通过依据。完整读取、移除、撤销、添加、保存、刷新与文字失效流程再次通过。在两个面板分别以“看👨‍👩‍👧‍👦重点”验证正向扩选及反向扩选得到完整1..12家庭emoji；测试后撤销恢复原文。Web tsc通过，无pageerror，原生产样例文件不变。

最新成功独立测试工程tpl-preview-phrase-inspector-889424cb-0a48-4546-ad00-943cc53e3d1a；报告更新在Downloads/layout-phrase-inspector-2026-09-29/verification.json。样式审美评分与20个≥90的总体目标仍未完成。

### 20个样式统一事件取帧与设计差异筛查（2026-09-29）

修复review-active-style-gallery.mjs的背景响应body在导航后失效导致未捕获拒绝；显式等待最终示例响应仍严格失败，不将失败替换为旧预览。一次完整运行正常退出，20项全部采样、原生事件/版本写入manifest，库前后严格一致。统一句子“把复杂的事情讲清楚”、重点词“讲清楚”，按首个有效叠加事件中点取帧。没有修改生产样式或原用户工程。

新增build-style-gallery-crops.py，审查页同时提供明确标注的局部放大与可展开完整画幅。实际查看20项局部atlas及前11项全幅atlas；没有把未逐张审阅的其余完整画幅当成已验收。证据Downloads/style-quality-gallery-events-2026-09-29。细化结论见docs/style-gallery-findings-2026-09-29.md。

主要设计问题是闪亮跟随、自适应底色和色块侧签的荧光黄矩形外观相近，下一步优先拉开形态、功能与动效差异；图标家族不能等同多个整片模板。局部预览解决可辨识性，不改变实际应用尺寸。此轮未新增正式分数、未试听、未新导出；20个≥90仍未完成。

### 色块侧签改为独立珊瑚侧标（2026-09-29）

依据统一图库发现的相似性，修改style-pilot-20260923-marker：原r2荧光矩形底板改为暖白文字、珊瑚色侧角标，100ms横向入场、70ms退场，最多两行。两块几何装饰独立可编辑，按text_box依附且followMotion，声音关键词锚点不变；保留旧版JSON。r3短/中/长合成词均实际取帧，发现长词角标短横伸入文字，r4将短横宽度降为.03、offsetX降为.018，右边缘留在文字边界外。r4长词图已实际查看，未见碰撞；“最/重要”断行仍需独立内容layoutPhrases提示，不能声称样式自动识别语义。

当前保存版r4、名称“重点批注 · 珊瑚侧标”。证据Downloads/marker-refine-2026-09-29，含original-v2、saved-v3/v4、短中长预览。原r3批次production-c1c412d9050d95776d99716010e3a1a4已succeeded，不作为最终版本验收。

r4下方应用（scale .72，center .5/.82）批次production-6a92e7ffff1e89a9ad07bd31a695418c三片导出成功，解码/音频流检查通过。已查看全部14个关键词中点全幅帧和每片首事件20帧连续局部图：没有发现角标碰字，但英语访谈中压在衣服和手势上，不接受为优良构图。三输入中两段为同一访谈场景，一段为中文纯音频；这不等于三种独立画面场景。未试听、不新增评分。证据Downloads/marker-refine-r4-2026-09-29。

保持r4定义和词时序，仅改变应用center至.22/.4，提交左侧留白对照production-518cddabbd7d344b6a9ab8058be3cd58。新批次是明确布局变更，不是超时重启；需读取同一批次结果继续验证。库清单更新为r4，整体20个≥90仍未完成。

左侧对照production-518cddabbd7d344b6a9ab8058be3cd58已succeeded，三片复制并通过原生解码/音频流验证。已查看14个关键词中点全幅帧以及三份首事件连续帧：访谈画面中的侧标移动到左侧墙面留白，所查帧未遮挡人物或手势，角标与文字没有碰撞；中文纯音频保持黑底，仅用于文字适配，不能作为场景多样性证据。严格对照时最初直接比较input失败，查明input含刻意改变的template；排除template后，三份源输入完全相同，所有叠加层内容/start/duration完全相同。验证保存placement-verification.json，未把初次失败当成通过。

当前无待运行批次。审查页Downloads/marker-refine-r4-left-2026-09-29/review.html包含三视频和所有检查帧；未试听、没有完整逐帧审阅每段视频，未新增正式评分。剩余工作包括另外两款荧光底色样式差异化、更多人物构图/画幅与声音验收及20个≥90总体目标。

### 星光样式与纯底色强调分离（2026-09-29）

读取保存版sparkle-follow r3后，更新为r4“灵动强调 · 星光弹字”：移除荧光底板，淡紫文字配深紫描边/轻阴影，短促回弹；原Lucide金色星光图片保留独立资源槽和编辑图层，新增text_box右侧依附，随文字动效并带短旋转/缩放。声音锚点不变，允许最多两行。原版留存在Downloads/sparkle-refine-2026-09-29/original-v3.json。

短词“讲清楚”和长词“先完成最重要的一件事”均在浏览器按真实预览事件中点取帧，库前后不变，已实际查看局部对照：没有看到文字与星光碰撞；长词按当前分词断在“最/重要”，仍需独立内容排版提示。视觉外形已区别于纯荧光底色和珊瑚侧标，不据此给90分。

使用既有NIOSH Deborah、NASA Alex、NASA John三份实测声音样例，不改已确认的词范围/转写revision；提交r4右上应用scale .65、center .77/.22的独立previewOnly批次production-5b1bdd30909914d7dfb89106422fbc51。三个不同人物构图，应用位置是明确人工选择，不是自动避让。证据目录Downloads/sparkle-refine-real-2026-09-29。当前仍需观察同一批次并检查成片。

上述右上批次已succeeded，三片解码/音频流验证通过。实际查看全部11个关键词中点全幅帧：星光和文字没有碰撞，NASA两片位置可见，但NIOSH Deborah的右上花字压到额头。此应用构图不合格，不以三个导出成功推断适配通过。右上首事件连续图已生成，未在此处冒称已经全部审阅。

保持r4定义不变，新建左上应用center .22/.18，批次production-4ed8d30ecc57ed55d72024e6c9dcdfb0，目录Downloads/sparkle-refine-left-2026-09-29。仅布局变更，仍为独立previewOnly工程，需继续读取同一批次。全关键词连续帧脚本新增显式像素裁切参数REVIEW_CROP，并把裁切范围写入证据，避免左上样式被旧的默认下半画面裁切漏掉。

左上批次production-4ed8d30ecc57ed55d72024e6c9dcdfb0已succeeded，三片解码/音频流校验通过。已查看全部11个关键词中点全幅帧及全部11段从前两帧到后两帧的30fps连续左上裁切联系表：未见文字/星光碰撞、依附脱离、换行跳动，所查全幅帧没有遮脸或手势；NASA Alex文字覆盖部分太阳背景，存在背景竞争。两应用逐项比较，排除刻意改变的template后源input相同，全部元素内容/start/duration相同。证据placement-verification.json。

将上述保存r4的确切左上应用登记阶段性87分（构图22、动效22、素材17、适配17、编辑9），回读current/evidenceCurrent均true、meetsInternalThreshold=false。扣分依据包括浅墙金色星光偏弱、太阳背景竞争、中文原声/竖屏及实时听感未验证。全部11段动作帧已实际查看，但没有试听或整片实时播放，不把它写成终验收。审查页补充全部连续帧和87分边界。当前无待运行批次；下一步应优先改善星光对比并补实际适配，整体20个≥90仍未完成。

### 星光双色描边与中文/竖屏补验（2026-09-29）

读取sparkle-follow r4，针对浅墙金色线条偏弱，使用本地已安装Lucide Sparkles源形状生成双色描边衍生SVG/透明PNG：深紫3.6外线、浅金1.9内线；保留完整LICENSE和SVG，不宣称AI生成。已查看PNG。新资源visual-d24210fcda49681914045292924d43ea9d93a702b488d7654d9e450105be9ad3入库，保存样式r5只更换资源绑定及来源说明，文字/依附/动效参数不变。原r4 JSON保留，旧87分不继承；库清单更新r5待评审。证据Downloads/sparkle-contrast-2026-09-29。

横屏批次production-6688c0ac0e94690fe614b49462bf2fd7、竖屏批次production-a86f442b37097f5872b26aed4dadf3ba均succeeded，各4片，全部解码/音频流校验通过。三个既有不同人物实拍样例+一份中文实测纯音频，保留原转写revision/语义选词。横屏1280×720、scale .65、center .22/.18；竖屏720×1280、scale .75、center .5/.87。竖屏显式人工焦点Deborah .64/.4，其他 .51/.4，不冒称自动检测。

已查看8片全部32个关键词中点全幅帧，以及浅墙同帧r4/r5局部对照：r5星光边界更清楚，未见裁字/碰字/遮脸；竖屏下方仍与服装及部分手势竞争，不宣布构图终验收。横屏5段中文关键词全部30fps连续帧已查看；竖屏实际查看around the house、December、vantage point from space和“真正打动你的地方”4段连续帧。其余连续帧已生成但本轮未逐张查看，不将r4的全动作审阅代替r5。所有连续帧从事件前两帧到后两帧，记录明确裁切范围及视频哈希。

两画幅逐项核对排除template/focalPoint后input完全相同，全部叠加元素内容/start/duration一致，报告在竖屏目录format-verification.json。原生导出与比较均不代表试听；未做新的正式评分。汇总页面Downloads/sparkle-v5-review-2026-09-29/review.html提供8片播放器和浅墙前后图。当前无待运行批次，20个≥90目标仍未完成。

### 竖屏分区应用与工作台主线澄清（2026-09-29）

补记上一轮已完成的分区应用：production-5d66e84bcca219b31b1b9f97bdb22cd8，Downloads/sparkle-v5-portrait-band-2026-09-29。星光r5保持不变，仅将原视频区域高度设为.78；四片已导出，上一轮查看全部16个关键词中点全幅帧及4段连续帧（brother’s calculator、December、vantage point from space、真正打动你的地方），其余12段已生成但未全部审阅。所查画面避免花字压在人物/手势上，代价为人物区域缩小与明显黑色留白。此为应用布局选项，非普适审美结论。

重新读取band-verification.json，四组源输入、编译叠加层语义和音频解码帧哈希均相同。对照脚本统一映射生成的图层/元素ID及引用，忽略生成关键帧ID和请求哈希，保留内容、几何、时间、动效及依附关系。最初未归一化的比较失败，不能当成真实语义差异，也未把失败记录为通过。上一轮verify-sparkle-band-ui.mjs通过区域编辑、刷新保留、越界拒绝、恢复与窄屏检查。以上不等于试听。

当前轮将页面标题由“效果模板工作台”改为“样式素材工作台”，将“整片模板工作台”改为“模板组合工作台”，双向入口相应统一；样式页补一句外观/动效、组合用法及声音生成时间轴的职责说明。原有四类筛选和新建能力复用，没有在UI加入业务编排逻辑。

新增build-sparkle-band-comparison.mjs生成comparison.html：四组前后视频、明确布局取舍、数据报告及带完整videoRegion参数的试用链接。浏览器实测四类中的重点词筛选与“新建重点词”入口、两个工作台双向导航、390px无溢出、8个播放器存在，以及试用请求原生返回720×1280和videoRegion.height=.78。窄屏截图实际查看。初次分类检查在库加载前点击未生效；等待样式卡片加载后通过，不将初次失败记录为通过。Web tsc --noEmit --incremental false通过，无pageerror。播放器数量检查不等于逐片播放，未试听、未新增正式评分，20个≥90目标仍未完成。

### 样式加入模板组合的状态闭环（2026-09-29）

检查发现组合工作台嵌入DynamicAssetLibrary时未接onPendingChange：样式未保存或操作中可切换父级视图、重新载入或复制模板，存在丢失样式草稿/插入响应覆盖的风险。现将stylePending纳入父级离开保护；切换面板和重新载入给出保存/还原提示，保存模板、改模板名、复制/新建/导入及应用入口在相关待处理状态禁用。继续由样式面板保存或撤销，不将保存模板误当作保存独立样式。

“添加素材”优先进入“样式素材”，不再把该入口称为笼统的“动态素材”。原生插入完成后直接进入“元素与样式”视图并选中新增图层；模板保持未保存草稿，用户可以进一步编辑再保存。业务插入仍使用Rust接口。

新增verify-style-composition.mjs，真实浏览器验证未保存样式阻止面板切换/页内链接并禁用模板保存，撤销恢复后调用真实原生insert，自动切换到设计面板且元素名称匹配返回layerMap中的首元素，模板保存按钮可用。比较整个模板库与样式库前后完全相同，未写回保存、未操作参考工程。初次末尾按钮精确文本匹配超时，改为匹配空白无关的“保存*”后完整通过，无pageerror。这次验证为草稿插入与保护，不是保存后重新加载验收或新成片评审。

### 组合保存重开与声音驱动验证（2026-09-29）

verify-style-composition-persistence.mjs通过真实浏览器复制collection-reading-margin为独立验收模板template-46691197-20b5-4e16-a062-5d66a5055ed3，插入星光r5后保存v1，刷新、重新选中插入的文字图层，修改描述并保存v2。完整模板比较除revision与明确修改的description外全部相同；既有每个模板和独立样式库前后保持不变。证据Downloads/style-composition-persistence-2026-09-29/verification.json。此新增模板是测试副本，不算新增达标样式。

verify-composition-speech-plan.mjs把同一保存v2组合应用到三份英文实测声音和一份中文实测纯音频输入，调用原生plan。全部词时间原样保留，四份实际花字事件各不相同，证明时间不是模板固定秒数。初次与独立应用比较时发现两类差异：浮点末位差异，以及December从0.36秒延长到0.65秒。后者来自组合已有visualRhythm.minDisplaySeconds=.65，而独立样式应用默认.1，符合events.rs的最短展示规则，并非丢失声音对齐。对照独立应用使用相同visualRhythm后，四组插入花字的内容、开始/结束、动效一致（数值仅允许4倍机器精度）；没有覆盖该差异或修改模板迁就测试。报告记录比较条件，原生plan不写工程、不代表成片视觉验收。

嵌入样式库增加当前模板最短显示秒数及“高级设置 → 断句与编排”的提示，让用户知道短关键词可能延长停留。本轮没有新导出、试听或审美评分，20个≥90仍未完成。

### 当前逐词字幕版本重新取证（2026-09-29，进行中）

查看caption-public-scenes-2026-09-28的三张长句全幅帧及Alex的逐词联系表：静态稳定字幕可读，部分句首出现低透明度。核对当前保存样式是caption r3，已移除整句opacity淡入；旧目录证据不能用于声明当前版仍有此问题。重新提交r3横屏应用（scale .65，center .5/.9，captionWidth .84），使用既有三份不同人物实测声音和一份中文纯音频，批次production-703356033fb379aab88bf2c0018f2eff。previewOnly独立工程，未修改保存样式或原参考工程。

新增export-current-caption.mjs；逐词验收脚本增加可选REVIEW_VIDEO_PREFIX以读取标准preview-N.mp4，原有命名仍默认兼容。输出Downloads/caption-current-mixed-2026-09-29。提交成功后从原生服务确认renderJob running；需继续读取同一批次，未宣称导出或审美通过。

上述同一批次production-703356033fb379aab88bf2c0018f2eff已succeeded，四片复制并确认decodeVerified/audioQuality.validated。当前135个词的高亮范围与输入词窗口逐个一致（误差小于1/120000秒），全部字幕元素params.opacity=1且无opacity动画；视频SHA256与原生证据一致。四张全部逐词中点联系表已实际查看：原旧版句首淡入变暗在r3取帧中不再出现，中英文短词、高亮与长句换行在这些帧没有裁字或跳行。实拍画面字幕仍覆盖衣服及部分手势；中文为纯音频，不能代表中文人物构图。

review.html补充四组已查看联系表及检查边界。中点取帧不是完整30fps连续运动检查，本轮未逐张查看生成的所有全幅中点帧，也未试听、未新增正式评分。该证据确认当前字幕版的可读性修正有效，不宣称20个≥90目标完成。当前批次无待运行作业。

### 自适应底色改为阅读底签（2026-09-29）

读取adaptive r3并保留原JSON后，保存r4“阅读强调 · 奶油底签”。文字角色改为emphasis；奶油底色与深墨字，font76/weight600，两行预算和20×10内边距。去掉缩放弹跳与opacity淡入淡出，改为90ms、8px横向归位，保持短词全程可读。仍使用共享原生文字背景与声音关键词绑定，无专用渲染器。此区别包括运动和适配，不仅换色。库清单更新r4待评审。

短词“重点”和长词“先完成最重要的一件事”合成预览实际查看：底板尺寸随文字变化，两行无裁切；长句仍在“最/重要”处断行，需独立layoutPhrases内容提示，不宣称语义排版通过。证据Downloads/adaptive-reading-2026-09-29，原r3与保存r4均保留。

提交独立previewOnly批次production-7820b33ece3c8d69561929b66bc041e3，横屏1280×720，scale .65，center .22/.18，使用三份不同人物英文原声及中文实测纯音频。四片均succeeded，decodeVerified/audioQuality.validated通过。Downloads/adaptive-reading-real-2026-09-29保存成片、计划、全关键词中点和全部30fps连续裁切联系表；生成不等于已查看。

本轮实际查看四张代表性全幅帧（brother’s calculator、December、vantage point from space、真正打动你的地方），以及December和真正打动你的地方两段完整事件前后30fps左上裁切。所查帧文字完整、没有遮脸，底板和文字稳定，无弹跳或换行抖动；左上覆盖太阳背景，长英文底板面积较大，不能宣布所有构图适用。其他中点/连续帧尚未全部检查，未试听、未新增分数。20个≥90仍未完成，当前无待运行批次。

### 样式预览接通内容同排提示（2026-09-29）

发现动态素材PreviewExample缺少layoutPhrases，尽管真实成片内容和编辑器已支持，作者在样式示例无法检验短语断行。新增可选layoutPhrases（默认空），由Rust现有PlanInput验证并编译；不把合成词时间保存为测量结果，不把内容短语写入样式。预览与detach-preview使用相同example字段。

EffectPreview示例面板增加原生返回词列表的起止选择、添加同排与清除，明确“仅此示例”。文字修改重置短语范围；示例缓存/定位/拆分上下文包含短语。保持业务范围校验在Rust，UI不另写分词或排版算法。现有整片sample路径保持使用真实内容输入。

Rust动态素材48项测试通过，新增测试覆盖同排静态元数据、词时间与片段时间不变、越界拒绝。Web tsc通过。构建成功后读取素材服务state确认无running/queued/pending作业，更新本地4318服务；首次nohup未保持进程，随后用持续exec session64250启动并确认服务可用，没有改配置或凭据。

真实浏览器verify-preview-layout-phrases.mjs验证adaptive r4长句的3..6词范围、合成词时间和片段内容/start/duration不变、重叠拒绝、清除恢复、样式库前后相同，无pageerror。初次响应监听误取缩略图请求，后按示例文案/关键词/短语数量精确匹配；另一轮alert匹配到Next路由播报节点后改为错误文本定位，最终完整通过。Downloads/preview-layout-phrases-2026-09-29含前后图及verification.json。两图实际查看：最/重要拆字消除，显示“先完成最重要/的一件事”；这证明可控短语约束，不代表语义断句自动最优。无新增成片、试听或正式评分，整体20个≥90目标仍未完成。

### 同排预览错误恢复与窄屏补验（2026-09-29）

将原生短语范围错误翻译为中文，说明范围方向、原文顺序和重叠要求；各组显示1-based词范围并可单独移除，不必清空全部合法组。校验仍在Rust，UI没有另写范围判定逻辑。

扩展verify-preview-layout-phrases.mjs，真实浏览器先添加合法组再重复添加制造重叠，观察原生拒绝和中文提示；仅移除第二组恢复预览，第一组保留。390×844时scrollWidth=390，实际查看mobile.png，无横向溢出。清空后重新添加非空短语，再将句子/关键词改为“重点”，请求layoutPhrases为空，确认文案改变不会携带旧范围。完整流程通过且样式库前后相同，Web tsc通过。证据更新Downloads/preview-layout-phrases-2026-09-29/verification.json；无新的审美评分、导出或试听，20个≥90仍未完成。

### 奶油底签当前应用评审登记（2026-09-29）

当前保存adaptive r4重新回读确认。补看全部16个关键词中点全幅联系表，以及此前未看的14段事件前后30fps左上裁切；加此前已看的December和真正打动你的地方，共16段全部查看。没有发现文字/底板不同步、裁字或换行跳动；长词底板偏大，左上覆盖太阳背景/展板信息，直接进退场生硬。声音仍未试听，不将静态连续图等同实时节奏验收。

submit-adaptive-v4-review.mjs校验四份视频SHA256后登记确切横屏应用84分：构图21、动效21、素材17、适配16、编辑9。原生回读current/evidenceCurrent=true，meetsInternalThreshold=false，阻断项保留，未跨版本或布局继承分数。浏览器实际确认当前样式库卡片显示84分。review.html补评分依据、回执及全部连续图，库审计更新。证据Downloads/adaptive-reading-real-2026-09-29/style-review-request.json及style-review-receipt.json。

这是一份有检查范围与扣分依据的内部阶段性视觉评审，不是自动审美结论、用户认可或90分达标；当前整体20个≥90目标仍未完成。后续应针对背景竞争、底板面积及进退场改善，不为凑数量复制配色。

### 奶油底签收紧排版与轻柔进退场（2026-09-29）

针对r4的84分扣分项，保存adaptive r5：字号76→68，背景padding20/10→14/8；移除8px横移，使用40ms进入与40ms退出透明度阶段。原r4保存于Downloads/adaptive-compact-2026-09-29/original-v4.json，库审计改为r5待评审，不继承84分。

相同四份声音输入、相同横屏应用位置，previewOnly批次production-325257168427574ad8b2ddd3eaa6b8d5已succeeded，四片解码与音频流检查通过。check-adaptive-compact.mjs确认排除template后源输入完全相同，16个事件内容/start/duration相同；全部opacity进入退出各40ms，最短December .36秒中全不透明.28秒。该数据不代替听感。

已查看四组前后代表帧（brother’s calculator、December、vantage point from space、真正打动你的地方）：底板更紧凑，中文长词由两行变一行，所查帧无裁字/遮脸；太阳背景仍被覆盖，未解决所有布局问题。已查看December和中文最长词两段完整30fps前后连续左上裁切，边缘少数帧渐变，中间清晰稳定。其余14段连续图已生成未在本轮全部查看，不继承r4全动作审阅。Downloads/adaptive-compact-real-2026-09-29/review.html补左旧右新对照和边界说明，未试听、无新评分，20个≥90仍未完成。当前无待运行批次。

### 扩大到宋体字幕与青色花字的实测（2026-09-29）

上一目标回合仅澄清产品分层，未提供新的执行证据；本轮继续已有两个生产批次，没有重复提交。serif r2批次production-e737a597f539cca7a6fd8548e2323783与cyan r1批次production-c519c419a92de838a4cd32602207177d均succeeded，各四片通过解码和音频流检查。输出分别为Downloads/serif-validation-2026-09-29与cyan-validation-2026-09-29。

实际查看宋体三张全幅代表帧（英文长句两张、中文最长关键词一句）和首事件20帧联系表，发现句首淡入低对比。保存serif r3，去掉整句opacity动画，保留宋体/金色关键词/5px归位，不修改声音内容。原r2与保存r3保留在Downloads/serif-readable-2026-09-29。check-serif-readable.mjs确认四份输入除模板外完全相同，16个字幕实例内容/start/duration不变，全部opacity=1且无opacity动画。新独立previewOnly批次production-7a1f594bd3628ccfb854e9da8e519851；编译检查不等于导出画面检查。

青色花字实际查看四张代表性中点全幅及December和中文最长词两段完整事件前后30fps裁切。所查文字完整，稳定段没有跳行；当前横屏应用视觉偏窄、力度不足，太阳背景竞争仍在。其余14段连续图已生成未全部查看。没有修改cyan定义，没有新增审美评分或试听；20个≥90目标仍未完成。原参考工程未修改。

宋体r3上述同一批次已succeeded，四片decodeVerified/audioQuality.validated通过。实际查看首句20帧联系表、英文最长句和中文最长关键词句全幅：首句不再有旧版逐渐显现的暗字，字体/重点色和换行保留。证据Downloads/serif-readable-real-2026-09-29/review.html与readability-verification.json。仅此检查范围，不是全片连续观片或试听；没有新评分。当前本轮三个批次均已终态。

### 青色花字恢复正常字形比例（2026-09-29）

上一回合有保存版修正与重新导出证据，属于progress。本轮回读cyan r1并检查Rust adapt_projection：画幅适配等比；偏窄来自样式scale_x稳定.90、scale_y稳定1.12。保存r2，将其改为共享scale等比弹入（.86→1.06→1），90ms入场、40ms退场，首帧全不透明；文字区域从.76×.17扩大到.88×.20，保持中心，角色改为emphasis。未增加专用渲染器。原r1及r2保存在Downloads/cyan-natural-2026-09-29。

相同横屏位置/scale及四份声音输入，previewOnly生产批次production-d46fc0518c17a581607f35a7e849cc47已succeeded，四片decodeVerified/audioQuality.validated通过。check-cyan-natural.mjs确认四份非模板输入完全一致，16处关键词内容/start/duration相同，且全部对应原始测得词范围。导出SHA256经review-keyword-motion.mjs核验。原参考工程未修改。

实际查看四张全幅代表帧（brother’s calculator、June solstice、vantage point from space、真正打动你的地方）和四段完整30fps事件裁切（brother’s calculator、December、vantage point from space、真正打动你的地方）。字形恢复自然比例、面积更大；短词首帧不再先暗后亮，所查稳定段无裁切或跳行。June solstice从一行变两行，字更大但占用更多高度；太阳背景竞争仍在，不能宣布所有构图适用。其余12段连续图生成未在本轮查看。无试听、无新评分，20个≥90目标仍未完成。

Downloads/cyan-natural-real-2026-09-29/comparison.html提供四组左右前后视频、明确版本/调整说明、r2试用入口和timing-verification.json。它是本轮对照产物，尚未额外完成浏览器交互验收。本轮无待运行批次。

### 样式选择带入模板组合（2026-09-29）

上一回合cyan r2保存与实测属于progress。本轮检查主线发现样式页只有泛化组合导航，当前样式不会带入，用户需再次检索。独立样式详情增加“选择模板组合”入口，带insertStyle查询参数；组合页初始化直接进入添加素材/样式素材，嵌入库首次加载定位该样式，刷新保留用户后来选择，不反复覆盖。页面显示明确的目标模板名及先选择、再插入、后保存提示。没有自动插入、自动保存或生成固定时间轴。业务插入仍走Rust原子接口。

指定样式不存在时显示错误并保持无选择，不默默拿另一款代替；未保存样式时入口aria-disabled且退出焦点顺序，已有离开保护继续生效。Web tsc --noEmit --incremental false通过。

verify-style-composition-handoff.mjs真实浏览器通过：保存版cyan r2带入正确、未保存入口禁用、撤销恢复、桌面切换目标模板保留样式、原生insert返回目标ID/样式ID正确、进入可编辑新图层和未保存状态。390×844同样通过目标切换且无横向溢出；不存在样式不显示插入按钮。两份完整库快照前后相同，无pageerror。初次测试等待仅窄屏可见的切换按钮超时，调整为桌面使用已展开模板库后通过；最终完整重跑包含预览canvas代次就绪等待。证据Downloads/style-composition-handoff-2026-09-29/verification.json、destination.png、mobile-selected.png与missing-mobile.png，截图实际查看。此为工作流验证，不是新增样式评分或20个≥90完成证明。

### 纸签短词可读性与三层同步优化（2026-09-29）

上一回合补齐样式到组合入口并实测，属于progress。本轮回读note r4和85分历史评审，实际查看旧版love连续帧，确认整组淡入占用短词阅读时间。保存note r5：文字/偏移底层首帧opacity=1、胶带=.9；入场70ms保留原-8→-3度旋转与16px归位，退出30ms；两层文字背景padding28/20→20/14，字号上限84不变。原r4和r5保存在Downloads/note-readable-2026-09-29。胶带仍用原生text_box依附，未新增专用逻辑或修改参考工程。

为公平比较，两版均用当前三人物英文与中文纯音频、1280×720、scale .5、center .22/.18独立previewOnly导出。旧版批次production-c29de40e63e59e55cca62e269568e3d0，新版production-682a2779023b329ff262ac7326d307d9，均succeeded，共8片decodeVerified/audioQuality.validated通过。check-note-readable.mjs确认四份非模板输入相同，48个三层实例内容/start/duration完全一致；新版各层除最后30ms外保持稳定透明度。December仍.36秒，主文字全不透明窗口从.20增至.33秒。

实际查看新旧四组全幅中点（brother’s calculator、December、vantage point from space、真正打动你的地方），并查看新版这四段完整事件前后30fps左上裁切。文字、底层、胶带同步，所查无裁字或跳行。减少padding释放适配空间，部分长词实际字号更大，因此底纸不一定更小；不能把参数减小等同整体面积缩小。左上仍占用太阳/展板背景，未解决任意构图避让。其余12段连续图生成未查看，不继承旧版完整观片范围。

Downloads/note-readable-real-2026-09-29/comparison.html提供四组新旧视频和readability-verification.json，明确字号适配取舍。新版视频SHA256已核验。未试听、未新增评分，旧85分变为历史，20个≥90目标仍未完成。本轮无待运行批次。

### 属性面板按编辑任务集中显示（2026-09-29）

上一回合纸签r5保存、八片导出和对照检查属于progress。本轮处理工作台上手体验：原“属性快捷定位”只滚到长页面不同位置，外观/布局/动效仍同时铺开。现保留五个显式入口，每次只显示当前分类；默认外观。图层结构与素材添加放在图层，用途/事件时机/来源放在应用规则；常驻“当前图层”选择器可跨分类切换图层。选中无样式或无动效的容器时转到布局，不留空白面板。隐藏而非卸载表单，保持未保存参数；原生操作契约未变。修正checkbox排版，使开关与文字同排。

Web目录tsc --noEmit --incremental false通过。首次误在仓库根目录运行同命令，根配置产生跨包别名/测试类型错误，不作为Web检查结果；随后使用apps/web正确配置通过，未据此修改跨包代码。

更新verify-inspector-navigation.mjs，真实浏览器验证五类入口的可见性和互斥显示、标题在可视区域、规则展开、未保存字体跨分类保留及离开保护、容器切换自动转布局并禁用不可用入口、390px无横向溢出。增加等待当前预览canvas代次就绪后截图；desktop/mobile截图实际查看并保存在Downloads/style-inspector-focused-2026-09-29。verify-style-composition-handoff.mjs完整复验桌面/窄屏目标切换及原生草稿插入通过。两轮均无pageerror、样式库未变，组合测试模板库也未变。没有新增审美分数或导出，20个≥90目标继续保持未完成。

### 分类属性编辑的真实保存重开（2026-09-29）

上一回合分类面板改造及浏览器验证属于progress。本轮新增verify-inspector-persistence.mjs，通过真实UI从cyan r2另存独立验收副本dynamic-0c07f0c4-5175-4400-bb0d-db6c6ec91548，在外观修改strokeWidth=7.5、布局region.x=.08、动效enterSeconds=.11；切换容器再回文字后参数保留，保存r2、刷新后逐分类检查控件。原生完整definition与只包含名称/版本/三个指定字段变化的期望对象严格相同，未用仅三个字段匹配掩盖其他数据丢失。当前代次预览canvas已渲染，截图reopened.png实际查看。

验收副本经UI归档，既有每个样式及库条目逐个比较不变，无pageerror。证据Downloads/style-inspector-persistence-2026-09-29的copy.json、saved.json、verification.json。该副本不计入生产样式/达标数量。

更新verify-native-decoration-editor.mjs使用常驻图层选择器与明确外观分类，实测growth r1的backing/baseline/bar-0/bar-1/bar-2五层颜色控件均可用且与各自原生样式匹配，刷新和390px无溢出通过，定义未变。证据Downloads/growth-inspector-validation-2026-09-29/editor-verification.json。本轮是编辑保存闭环与图形控件回归验证，没有新成片、试听或审美评分，20个≥90仍未完成。

### 居家学习的独立样式组合实测（2026-09-29）

上一目标回合仅解释分层，没有新增状态或验证证据，分类为no progress。本轮恢复执行：新增produce-reading-style-composition.mjs，把serif r3、learning r1、clock r1、note r5组合为720×960独立预览。插画、标题和原生矩形底色以video_start关联实际声音全长；时钟仅metric时间词，纸签仅call_to_action/conclusion重点。语义由Agent标注，不冒称自动识别。四款原样式定义前后严格一致，未修改参考工程。首次提交因背景literal空字符串被原生拒绝，修正为非空后提交成功。

previewOnly批次production-fb34e4484742d04d13995f46c99512a9已succeeded，一个10.475283秒中文声音样例完成导出，decodeVerified/audioQuality.validated通过。check-reading-style-composition.mjs核对：五个字幕内容及实测起止时间逐项相同；插画/标题/背景各一次贯穿声音；11个时钟图层均只在十分钟3.42–4.08秒出现；纸签三层各两次，7.04–8.18与8.86–10.28秒，保留测得词区间。

实际查看全片2fps联系表、时钟完整事件前后24帧与第一纸签完整事件前后42帧裁切。所查无插画重复入场、元素互遮、时钟部件散开或纸签文字/胶带错位；区域裁切未包含完整字幕，字幕完整性依据全幅联系表。结尾纸签未完成30fps逐帧检查；未试听、无正式评分，仅一个输入设计试验，不能证明多输入适配或20款≥90完成。素材为IRA Design MIT插画，非AI生成。证据Downloads/reading-style-composition-2026-09-29，含manifest、源输入、原样式快照、导出、时序核验与review.html。本轮批次已终态。

### 三文案复用与长标题/短语排版优化（2026-09-29）

上一回合完成单输入独立组合生产与实测，属于progress。本轮新增verify-reading-composition-reuse.mjs，原样复用相同模板，分别应用阅读10.475283秒、日程13.054785秒、长协作25.99873秒。previewOnly批次production-1ab4601c40e3fc49843bc24fcc11d6db已succeeded，三片decodeVerified/audioQuality.validated通过。check-reading-composition-reuse.mjs确认完整输入词对象未变、各片插画一次贯穿声音，时钟各一次、纸签各两次严格对应指定关键词实测区间，5/5/11个字幕完整覆盖原文。语义仍为Agent选择；metric在本试验用作时间提示路由，不是新增的自动时间意图识别。

实际查看日程及长协作全片2fps联系表，发现“最重要”被字幕拆行、长标题受单行限制缩小。REFINE_LAYOUT模式统一调整标题region为x.08/y.055/w.84/h.15、maxLines=2；日程内容层补layoutPhrases词13..15，独立样式不变。修订previewOnly批次production-835487b0af0777494d54c85f99b0f2f6已succeeded，三片导出技术检查通过。所有实例内容/start/duration与原版严格相同；复用核验通过，原生短语元数据对应“最重要”。实际查看新版两张全幅：最重要同排，长标题两行且清晰，无新增所查遮挡。

原版六个纸签完整连续图已生成并核验视频SHA256，实际查看长协作结尾一段30fps完整事件，未见文字/胶带分离、跳行；其余五段未在本轮查看。新版没有继承原版完整动效观片结论，未试听、未正式评分，组合尚为候选预览，20款≥90仍未完成。证据Downloads/reading-composition-{reuse,refined}-2026-09-29，优化版comparison.html含三视频和两组全幅对照。中途在render仍running时过早调用本地检查导致缺文件，随后读取权威编译输出并等待同批次成功，未重提或重启任务。两批次均终态，原参考工程未修改。

### 已验证组合进入工作台与角色修正（2026-09-29）

上一回合完成三文案复用与排版修正，属于progress。本轮新增save-study-guidance-composition.mjs，校验优化批次三份视频SHA256和技术导出标记后，将组合另存为composition-study-guidance-20260929，名称“居家学习 · 字幕与重点提示”，标签候选待审，说明明确语义由内容侧标注、未试听/未正式评分。保留全部资源/动效/关系，标题与字幕使用易区分的元素描述。不会把previewOnly成片或历史分数自动绑定到新保存版本。

首次保存后的严格回读比较发现两个height的JSON浮点末位差异（.11249999999999999与.1125），保存已成功，无重复创建；比较器改为递归核对全部键、数组类型、文字和值，数值仅容许4倍机器精度误差，随后复用已有记录验证通过。浏览器截图发现标题继承subtitle、背景继承supporting_visual，修正为title/background保存r2，独立样式未改。其他模板逐条比对未变。

verify-study-guidance-workbench.mjs真实Chrome验证18个元素均可选中，描述/内容绑定/语义角色/可见入场锚点均匹配保存定义，刷新保留，390px无横向溢出，无pageerror，测试前后模板库一致。初次测试隐式select标签精确定位超时，改为“出现时机”details内select并显式打开后通过。桌面与手机截图实际查看；手机需滚到列表下方才能编辑属性，仍有进一步精简空间。证据Downloads/study-guidance-workbench-2026-09-29含saved.json、verification.json、ui-verification.json和截图。r2尚未新做导出或审美评审，20款≥90仍未完成；此前三份导出为组合修正前述角色前的明确试验版本。

### 模板组合属性面板直接切换元素（2026-09-29）

上一回合保存候选r2并完成18元素UI核验，属于progress。本轮针对手机需滚过长列表的问题，在模板组合编辑页增加“编辑所选元素”按钮，滚动到属性标题并转移键盘焦点；属性面板增加“当前模板元素”选择器，按语义角色与元素描述展示，直接复用现有selected状态。元素工具栏允许换行，避免窄屏新按钮挤出。改动只涉及Web交互，没有新增/复制业务规则。

Web tsc --noEmit --incremental false通过。verify-template-element-picker.mjs真实Chrome验证390px跳转后选择器位于视口、焦点落到属性标题，18元素切换对应正确描述/绑定，修改字幕描述后切到标题再回来草稿保留且未保存状态正确；桌面入口可用，手机无横向溢出，模板库前后严格相同，无pageerror。首次测试用getByRole读取折叠的非文字高级绑定超时，改用getByLabel读取已挂载表单值后完整通过，不将隐藏控件声称为可见；实际选择器与跳转另有可见性断言。桌面/手机截图实际查看，证据Downloads/template-element-picker-2026-09-29。无新增成片、试听或评分，20款≥90仍未完成。

### 当前保存版关联可播放成片（2026-09-29）

上一回合完成元素快速切换交互与验证，属于progress。本轮检查SavedTemplatePreview与Rust previews发现previewOnly产物不会关联保存版成片页，候选r2缺少直接可播放样例。新增publish-study-guidance-preview.mjs，以当前库r2完整定义、baseRevision2和原三份声音/语义/同排短语提交本地正常发布；没有改参考工程。manifest落盘后重跑复用幂等内容，不跟随库新版本重复提交。

批次production-1f562f214c83e4c4e0c62b40e0ef6dc4已succeeded，三片解码/音频流检查通过并关联composition-study-guidance-20260929 v3。verify-study-guidance-preview.mjs确认v3与提交r2除revision外完整相同、其他模板未变、三个成片SHA256正确、旧新全部实例内容/start/duration和词对象相同；预览目录指向确切当前版本/批次，qualityReview=null、aestheticQualityVerified=false。三份完整解码rawvideo SHA256与前一优化试验逐一相等，证明本次角色/说明修正未改变视频像素；此为整片像素一致性证据，不等同额外完整观片。

真实Chrome桌面/390px确认成片效果页视频源正确，显示“已保存版本v3 · 样例素材 · 待质量审片”，静音播放currentTime推进后暂停，无横向溢出/pageerror，UI验证前后库不变。截图实际查看，浏览器原生控制条在暂停时覆盖底部部分字幕，播放控件覆盖不写入导出画面。未试听、无评分，没有把技术发布算作≥90。证据Downloads/study-guidance-published-2026-09-29含三视频、review.html、publication-verification.json、decoded-video-comparison.json和桌面/手机截图。当前批次终态，20款≥90仍未完成。

### 当前居家学习组合登记83分评审（2026-09-29）

上一回合当前保存版发布与UI播放验证属于progress。本轮实际查看v3三份全片2fps全幅联系表，以及全部六次纸签、三次时钟的事件前后30fps连续裁切（540×330 at 90,550，九图均查看，视频SHA256核验）。未发现所查提示层错位/胶带脱离/时钟部件散开/稳定段跳行。裁切在部分长句左右截断字幕，不拿裁切充当完整字幕边界证据；全幅联系表承担构图检查。

发现的审美问题：纸签与金色字幕重复强调同一内容，形成两个阅读中心；较长协作旁白仍用同一单人居家插画，主题匹配泛且视觉变化不足；部分无提示段留白偏大。新增submit-study-guidance-review.mjs向原生reviews登记当前v3确切批次83分（构图21/25、动效21/25、素材16/20、适配16/20、编辑9/10），三个阻断项保留，meetsInternalThreshold=false。此为基于已查看范围的主观内部阶段性评分，未试听/未整片实时观片，不将技术导出换算为审美达标。下一步应调整信息主次、为长片选择适合主题的分段素材并扩大适配验证；不能仅更换颜色凑20款。

证据Downloads/study-guidance-published-2026-09-29包含quality-review-request/receipt、review-note/review-clock连续图与manifest；review.html补全依据和图集。无新导出或版本变更，整体20款≥90仍未完成。

verify-study-guidance-review.mjs真实浏览器确认当前v3显示83分/需返修，展开质量报告可见五项依据、三个阻断项和未试听标记，quality-report.png实际查看，quality-ui-verification.json保留。没有新录入达标项。

### 降低重复强调并按输入选择主题插画（2026-09-29）

上一回合实际观片并登记v3的83分属于progress。本轮实际查看已有MIT IRA办公桌与双人桌面场景，新增refine-study-guidance-hierarchy.mjs：从库中v3派生独立候选，普通字幕fontSize53.2→42、weight800→600、fill改#E1E4EC、去描边，移除作用于字幕的text_highlight应用。语义关键词范围仍保留，关闭的是表现处理；独立样式库未改。日程输入使用办公桌插画，协作使用双人场景，通过sample.resourceBindings覆盖同一个study--artwork槽，不复制模板或写固定时间线。

previewOnly批次production-1a3541574ecd8f5a2d9841bb09dbb07e已succeeded，三份导出解码/音频流检查通过。check-study-guidance-hierarchy.mjs确认三份完整词对象、全部元素content/start/duration一致，21个字幕无高亮启用/颜色，原生换算后的字号按42/53.2变化，图像实例mediaId匹配每份输入。首次检查错误地把原生归一化字号当px、把语义highlightRange当高亮开关，修正检查契约后通过，没有为测试删除语义元数据。提交前后两份库严格不变。

实际查看三张新版全幅重点帧：普通字幕视觉退后，纸签主次更明显，日程句变为一行；主题素材与内容联系较原版更强。但新图可见面积较大，下缘与胶带贴近，后续需收紧图像区域/增加间距；长协作仍缺分段变化。未做新版全部连续动效检查或试听，未登记新分数、未覆盖当前保存版v3/83分。Downloads/study-guidance-hierarchy-2026-09-29/comparison.html提供三组旧新视频及代表帧、核验结果。当前批次终态，20款≥90仍未完成。

### 插画与纸签稳定帧间距修正（2026-09-29）

上一回合层级/素材候选产出与代表帧检查属于progress。本轮新增refine-study-guidance-spacing.mjs，复用其全部三份输入与资源覆盖，只将study--decoration区域宽高统一缩小10%，中心y从.43移到.40。独立previewOnly批次production-75e22dd06edcdbda0a3e72f84cef3965已succeeded，三份导出解码/音频流检查通过，未覆盖库中v3及83分。

新增check-study-guidance-spacing.py，确认全部元素内容/起止时间与输入词对象不变，并对六个纸签实例的中点全幅帧做已知纯色背景的可见行测量（x80..639/y200..769，至少8像素与#202333任意通道差>50判为可见行）。原间隙31/8/0/3/0/0px，新间隙77/55/26/52/38/42px；原版可见区域相连时记0，并非负间距测量。该阈值分析仅用于本组素材和代表帧，不能证明一般自动避让、每帧无碰撞或感知质量。

实际查看阅读第二纸签、日程第一纸签、协作第一纸签三张全幅，图像与胶带分离、纸签/字幕主次保留。其他三处仅计算测量未独立查看；本轮没有新版完整连续动效/试听/评分，长片分段变化尚未解决。Downloads/study-guidance-spacing-2026-09-29含comparison.html三视频旧新对照、六组测量帧与spacing-verification.json。本批次终态，20款≥90目标仍未完成。

### 语义段场景调度与边界检查（2026-09-29）

上一条纯概念答复没有改变权威状态，分类为no progress；本轮恢复未完候选验证。refine-study-guidance-sections.mjs从间距候选派生previewOnly模板，主场景与planning场景通过semantic事件/endAtNextEvent调度，时间提示metric段使用办公桌插画，其余语义使用输入主题资源槽。取消插画反复入场，保持固定位置，采用直接切换；metric仍为Agent内容标注约定，不能声称自动时间意图识别。

批次production-b33644587d912ce96bb4af76abdb4ba4三份导出完成，本轮重新读取服务批次并核对三份文件SHA256、decodeVerified/audioQuality.validated。重跑check-study-guidance-sections.mjs通过：完整词对象及非插画内容/start/duration不变，插画从实测语义首词到下一段首词或声音末尾连续覆盖，资源绑定正确。阅读5段/2次实际换图，日程5段/0次换图，协作4段/2次换图；同图重实例化不计换景。

前序已查看四处实际换图边界，本轮实际查看剩余七处同图边界，每处边界附近五帧，未见所查空图/残影/重复入场；另生成并查看三片开头0.1秒及末尾前0.15秒全幅联系表。仍可见无提示段中部较空，场景语义只有主题/时间提示两路，尚不能证明完整内容理解或高质量素材自动选择。没有试听或正式新评分，没有将该候选写入主库，保存版v3及83分仍为旧版结果。证据Downloads/study-guidance-sections-2026-09-29/comparison.html含三组视频对照、11处边界及开尾图。20款独立设计≥90仍未完成。

### 样式应用规则聚焦当前图层（2026-09-29）

上一轮完成场景边界检查及对照页，属于progress。本轮检查样式主线，发现应用规则同时展示全部图层时间参数及所有容器坐标，且容器坐标与布局面板重复。dynamic-assets.tsx移除应用规则内重复容器坐标表，只展示当前选中元素的时间参数，容器选中时提示通过布局调整位置并选择子图层设置时机；出现时机增加可访问名称，偏移明确为相对触发时刻。沿用既有草稿、Rust保存及编译协议，无业务逻辑迁入Web。

Web tsc --noEmit --incremental false通过。verify-focused-style-rules.mjs真实Chrome验证：只出现一个当前图层时间表单、切到另一个图层再回来保留修改、容器无时间表单且布局坐标仍可访问、撤销还原、390px无横向溢出、无pageerror、样式库前后完全不变。桌面与手机截图实际查看（/tmp/focused-rules-{desktop,mobile}.png）；截图时预览处于更新中，本轮不将截图作为动效渲染验证。此次为交互简化，无新增模板/成片/评分，20款≥90仍未完成。

### 青色弹字双语三画幅实际导出筛查（2026-09-29）

上一回合聚焦图层规则并完成UI验证，属于progress。本轮使用现有verify-keyword-style-formats.mjs读取青色弹字保存r2，以scale .95 / center .5,.72应用到1280×720、720×1280、720×720；输入为现有中文声音与英文原声采访，来源转写revision检查通过。previewOnly批次production-4398b7d537d2b2918483f83b93c6f9fd六份导出全部成功，等待同批次完成，未重复提交。没有改用户参考工程或样式库。

新增check-cyan-format-review.py，读取三项编译输出、核对六份导出SHA256和技术标记、27个关键词事件的start/duration与实测词区间一致；每片取最长关键词中点全幅生成并实际查看六格图。中文“真正打动你的地方”分两行，英文“northern hemisphere”分两行，所查代表帧没有截断或遮脸。但横屏相对字号明显小于竖屏/方屏，需要校准不同画幅的应用大小，不能把同一个scale视作跨画幅视觉适配通过。中文为声音黑底样例，不当作完整成片构图。

证据Downloads/cyan-formats-20260929含manifest、三项编译、六视频、逐项核验、最长词代表帧及review.html。无全事件动效检查、无试听、无正式评分；每种应用只有两个输入，不满足三样例正式评审条件。20款≥90仍未完成，下一步优先修正横屏应用尺度并检查短词/完整入退场。

### 青色弹字横屏应用尺度修正与长短词动效检查（2026-09-29）

上一轮六片三画幅导出及代表帧发现横屏偏小，属于progress。本轮新增refine-cyan-landscape.mjs，通过原生application保留保存样式r2，横屏scale .95→1.45、centerY .72→.76，原两份输入外加入导师影响采访input-cde88118397f50e922df4e606786d79f rev1。保存application/样式快照并检查库不变。previewOnly批次production-cb32b62ab0271fb855430402aa313199三片终态succeeded，文件哈希、解码、音频流检查通过；15次关键词时间匹配实测词。原两份输入的完整词对象和所有叠加内容/start/duration逐项一致。

实际查看三份最长词全幅，文字较旧横屏清楚，所查未遮脸；长中文两行、长英文两行。生成全部15事件30fps前后连续裁切（900×260 at 190,410），实际查看六段：十分钟、真正打动你的地方、December、northern hemisphere、done well、huge impact on my life，未见所查文字跳行/残影，短词仍有稳定显示段。其余九段仅生成未逐一查看；裁切不作为整片人物避让证据。手势/花纹衣服仍与文字重叠，不能声称通用安全摆放或已达到90。

证据Downloads/cyan-landscape-refined-20260929含三视频、manifest、application、核验、全幅代表图、motion-manifest及comparison.html新旧对照。未试听、未正式评分，此为应用候选没有覆盖独立样式默认参数。20款≥90仍未完成。

### 青色弹字横屏方案登记84分并验证工作台复用（2026-09-29）

上一轮修正横屏尺度、导出三输入并查看六段动效，属于progress。本轮实际查看剩余九段30fps事件裁切，至此全部15段检查完成；生成并查看三份全片2fps全幅联系表。未见所查稳定阶段跳行或退场残留，人物手势与花字重叠持续存在，导师采访的衣服花纹增加干扰。短词December/done well窗口仍短，未试听，不将时序正确等同阅读节奏达标。

submit-cyan-landscape-review.mjs匹配保存r2、确切Application、三份当前视频SHA256后，登记84分（构图20/25、动效22/25、素材17/20、适配16/20、编辑9/10）。记录style-review-737eeab8d45933e6403f6d0d5e83279b0eaab25ecf2f3409c9a158b5abb374cc回读current/evidenceCurrent均true，meetsInternalThreshold=false，两项阻断保留。只针对1280×720、scale1.45、center(.5,.76)，不扩展至竖屏/方屏或其他应用。

verify-cyan-landscape-review.mjs真实Chrome刷新前后确认84分/需完善、未试听、大小145%/中心50%76%、阻断及分项依据正确，三成片播放器可加载；“用这个布局试自己的声音”发出的原生Application与记录完全一致，刷新仍一致且没有偷偷选中来源素材。无pageerror。评审截图实际查看。comparison.html更新查看范围、84分和全幅图；没有新增成片或改变样式，20款≥90仍未完成。

### 青色弹字左侧应用候选，保持视频全幅（2026-09-29）

上一轮登记84分并完成工作台复用验证属于progress。本轮读取布局机制发现保护区域用于跳过冲突元素，不能宣称自动搜索安全位置。新增refine-cyan-side-placement.mjs复用保存r2及原三份输入，通过独立Application改为scale1.15/center(.2,.4)，保留原视频全幅，没有以视频裁切或新样式规避原始叠加目标。

previewOnly批次production-3459a5893b6ce00f9f90a82777f998d1三片成功，15词事件实测起止、视频SHA256、解码及音频流验证通过。完整词对象、叠加content/start/duration及source引用与上一版完全一致。实际查看三张最长词全幅和两段完整30fps全幅事件：Alex longer sunlight、导师go forward，所查片段避开脸部和手势，文字稳定。Alex左侧太阳图仍增加背景干扰，中文纯声音黑底左置并非推荐构图；这不是自动人物识别或通用安全位置。

全部15事件全幅联系表已生成，仅两段本轮实际查看，其余13待查；无试听/新评分，不继承中央应用84分。Downloads/cyan-landscape-side-20260929/comparison.html提供三组视频和全幅对照；未覆盖保存样式或原评审。20款≥90仍未完成。

### 青色花字实测底板试验与透明度建模缺口（2026-09-29）

上一轮侧边摆放产出三片并验证代表手势段属于progress。本轮检查Style发现background限定六位色值、backgroundPadding支持实测边界，但没有独立backgroundOpacity字段；没有把全图层透明度冒充底板透明度。新增refine-cyan-backing.mjs，从左侧应用派生previewOnly模板，文字background #17232E、padding14/8、strokeWidth2，保留声音驱动时序和位置。不覆盖独立样式r2或其84分应用记录。

批次production-5ab51ca780623734a28a45dddf7626e4三片succeeded，哈希/解码/音频流检查通过，15词事件时间及原完整词对象、事件content/start/duration与侧边版一致。实际查看三张最长词全幅，以及十分钟/northern hemisphere/huge impact on my life三段30fps完整事件裁切（640×360 at0,100）：底板随文字缩放并同步退场，所查未见分离或跳行，背景干扰减少。但实底矩形视觉偏重，更接近信息标签，不推广为默认花字，也不因为技术通过另算一个独立合格样式。

全部15段裁切已生成，其他12段未查看；无试听/评分。证据Downloads/cyan-backing-trial-20260929/comparison.html。下一步可补模板底板独立透明度及对应UI/编译，验证更轻的底板；这是本轮发现的能力缺口，尚未实现。20款≥90仍未完成。

### 底板独立不透明度贯通模型、编译和编辑预览（2026-09-29）

上一轮实底试验及能力缺口确认属于progress。本轮在Rust模板Style新增可选backgroundOpacity，省略默认1，限制0..1且拒绝NaN/无穷；编译为原生background.opacity，保持文字/图层opacity不变。Application缩放保留该无量纲值。Web样式外观增加底板不透明度滑块，原生成片属性注册同名参数；Canvas仅在绘制背景save/restore范围内乘alpha，文字随后使用原alpha；编辑中文字覆盖层和模板示意背景同步透明度。

Rust content_background两项测试通过：旧padding保持，新增opacity默认/0/.45/1、跨画布缩放及非法值拒绝，编译文字opacity仍为1。Canvas像素测试通过16断言，验证白底混合像素和后续绘制alpha恢复；Web tsc通过。首次测试文件写入误用相对路径未创建文件，改正确工作目录后运行通过，不将第一次命令作为成功记录。

确认183个生产批次无running/queued后构建并重启本地素材服务（PID89240），沿用默认机器配置；/api/footage/state返回200。verify-background-opacity.mjs真实Chrome桌面/390px验证新控件、40%请求经Rust预览输出background.opacity=.4而opacity=1、切换属性保留草稿、撤销还原、库前后严格不变、无pageerror/横向溢出。截图实际查看，底色已变淡而文字仍清楚。新参数未在本轮做保存重载或新MP4导出测试，不能声称半透明候选成片已验收；下一步需完成该闭环并复查复杂背景。20款≥90仍未完成。

### 底板透明度保存重载与三片导出闭环（2026-09-29）

上一轮backgroundOpacity模型/编译/编辑预览及测试属于progress。本轮新增verify-opacity-save-export.mjs，复制青色r2为独立候选style-cyan-translucent-candidate-20260929；真实Chrome在外观中将底板不透明度1改为.65并保存，刷新控件仍.65，Rust回读一致，候选保存r2。原青色r2逐字段未变。候选明确标注待审，不以底板变化另计一个独立达标设计。

通过保存候选的原生Application提交previewOnly批次production-96169141d777326797bb0576a842cb09，三份实测样例导出succeeded。核验三视频SHA256/解码/音频流、15关键词原词与content/start/duration不变；全部编译实例background.opacity=.65而opacity=1。实际查看三张最长词全幅，背景透过底板，文字保持清楚。保存后截图实际查看，截图时预览更新中，所以不作为渲染完成证据，导出帧提供实际效果证据。

Downloads/cyan-translucent-20260929含保存style/application、提交、三片视频、代表帧、opacity-export-verification.json与review.html。新候选尚未完整连续动效检查、试听或评分，不继承中央84分。保存到实际MP4的技术链路已验证；20款≥90审美目标仍未完成。

### 模板组合补齐文字底板编辑入口（2026-09-29）

上一轮独立样式透明度保存/刷新/导出闭环属于progress。本轮检查发现模板组合元素属性仍没有文字底板入口。workbench.tsx为文字元素增加底板启用、颜色、不透明度、横纵留白，types.ts补backgroundPadding类型；复用既有editStyle草稿及Rust保存通道，无新增Web业务规则。成片属性registry已有background.opacity注册，本轮未改其模型。

Web tsc通过；现有成片属性registry与底板Canvas混合测试共5项通过。verify-composition-background-panel.mjs真实Chrome在居家学习模板未保存草稿中设置35%与18/9留白，切换元素再回来数值保持，底板关闭/重新启用保留不透明度，390px无横向溢出、无pageerror，库前后完全不变。桌面/手机截图实际查看。本轮没有把未保存草稿当成库改动，没有生产新视频；原生成片编辑器仅检查既有registry测试，未声称实际项目属性交互已全测。20款≥90仍未完成。

### 成片编辑器底板不透明度实际修改与持久化（2026-09-29）

上一轮模板组合面板补齐属于progress。本轮将原生成片background.opacity控件显示单位设为百分比（displayMultiplier100），保持存储0..1。verify-editor-background-opacity.mjs从半透明试验产物派生仅含文字的独立验证工程，移除测试副本中的音视频依赖，未改生产工程或用户参考工程。

真实Chrome通过公开Agent bridge揭示选区，使用实际属性滑杆从65%改35%，等待原生project.json自动保存后刷新、重新选中，仍显示35%。文字opacity、startTime/duration和animations与副本初始值相同，生产源文件字节不变，无pageerror。首次脚本误把Agent摘要字段当原生startTime导致断言失败，已改读保存工程数据并重新完整验证通过；第一次独立副本也保留，没有重跑生产。Web tsc通过。Downloads/editor-background-opacity-20260929/verification.json记录成功副本路径，inspector.png实际查看。

现在底板独立透明度的样式页、模板组合页、原生成片属性、保存重载与导出均已有各自范围内的证据；不等于候选审美达标。该编辑器修改副本未重新导出，先前65%导出证据保持独立。无新增评分，20款≥90仍未完成。

补充：首次成功截图中背景折叠区已收起，因此不能把其截图当作控件可见证据。脚本补充刷新后显式展开背景并断言滑杆visible，再完整运行通过；第二次截图仍显示背景区收起，暴露isVisible不足以检查折叠容器裁切；继续修正显式展开步骤，不将该截图作为可见性通过。预览播放头位于入场前，黑画面不作为文字效果证明。

最终面板可见性补查完成：用role=button/name=背景精确展开（避免同名字段label歧义），等待展开后截图，实际查看35%滑杆及数值均在可见背景区。完整脚本最终通过，verification.json指向最后成功的独立副本；前述中间截图结论已明确纠正。

### 半透明重点词候选补齐全部事件视觉检查（2026-09-29）

上一轮概念说明未改变实现或证据，属于no progress；本轮回到已导出候选的实际检查。重新读取状态记录及产物，逐一查看半透明候选全部15段30fps连续裁切（640×360 at0,100），核对三个MP4的SHA256与motion-manifest逐项一致。所查稳定阶段未见跳行、底板分离或退场残留，长中文及英文两行保持稳定。

仍存在明确设计问题：矩形底板偏信息标签，长短词字号差异明显，太阳图背景仍有干扰。不能因此把半透明候选视为90分花字；下一步需要改进长短文案排版适配和装饰设计，而非继续仅调整透明度。裁切检查不证明全片人物避让；未试听、未实时播放评价、未新评分。未覆盖样式或参考项目，未新建生产批次。

Downloads/cyan-translucent-20260929/visual-inspection.json记录全部15个已查看事件及源视频哈希，review.html同步更新范围并提供逐词展开证据。20款独立样式≥90的完整目标仍未完成。

### 重点词长短排版候选，三输入实际导出对比（2026-09-29）

上一轮补齐15段视觉证据属于progress。本轮检查编译和fitTextRegion发现原应用字号86.25、区域高165.6px，两行内容会受高度限制缩小。新增refine-cyan-type-balance.mjs，从半透明应用派生previewOnly模板，字号64、行高1.12、区域高.27，保留中心/宽度及全部时序动效。没有修改全局适配算法，也没有覆盖库中保存样式。

批次production-dfd89c93adf10fe61f878a0df5d2f322三片成功；检查哈希、解码/音频流及15词实测时间。review-cyan-type-balance.py核验原完整words、文字/start/duration及动画值/时间/控制柄一致；首次直接比较关键帧UUID失败，确认独立工程分配不同UUID后仅排除key.id，完整比较通过。

实际查看全部15组中点新旧裁切和三张最长词全幅。短词偏大得到改善，长词保持清楚，两行高度余量较足；底板仍有明显矩形标签感，未因此认定审美达标。中文黑底仅为样式验证输入；未做本版连续帧检查、试听或评分。证据Downloads/cyan-type-balance-20260929含三片、核验、逐词对照及review.html。下一步应设计更有辨识度的装饰表达，并将通过检查的设计更新到独立样式；20款≥90仍未完成。

### 青色花字去底板与文字依附双笔触试验（2026-09-29）

上一轮长短词字号候选导出对比属于progress。本轮新增refine-cyan-accent-marks.mjs，沿用64px字号候选，移除矩形底板，描边4px/硬阴影2,3px，两笔浅色原生rectangle作为独立图层，通过text_box above关系随实际文字边界和父动效。没有生成或下载图片，也未覆盖保存样式。首次脚本假定composition存在而在提交前失败，补可选容器初始化后成功提交。

previewOnly批次production-aa062a8af31cd09cb503df7e1faa795c三片成功，哈希、解码/音频流、15关键词实测时间通过；文字内容、原words、关键帧时间/值/控制柄与上一候选相同（仅独立UUID排除）。30个装饰实例各自与15个对应文字起止一致。实际查看三张最长词全幅及长中文/December/最长英文三段30fps裁切：矩形标签感减轻，所查装饰保持文字上方，未见退场残留；浅色墙面装饰对比度偏弱。未以三段检查代替全片验收。

全部15段动效联系表已生成，剩余12段未看；无试听/评分、未保存为独立样式。Downloads/cyan-accent-marks-20260929含视频、逐词对照、motion-manifest、decoration-verification及review.html。review-cyan-type-balance.py增加环境变量指定比较双方及标题，默认原行为不变，Python语法检查通过。20款独立≥90目标仍未完成。

### 双笔触深色衬层保存到工作台及三片验证（2026-09-29）

上一轮双笔触候选导出属于progress。本轮检查compiler发现非outline实心图形的strokeWidth会编译为0，因此先前笔触style中的strokeWidth1不构成实际描边。未贸然改变全部旧图形行为；为两笔分别新增深色原生rectangle衬层，比白笔触宽高各6px，调整above间距使中心重合，保留相同旋转与文字依附。该设计使用独立形状，不是新增填充+描边通用契约。

save-cyan-accent.mjs创建独立style-cyan-accent-candidate-20260929 v1（根容器+五个元素），保持原半透明候选字节等价。用保存版本原生Application生成批次production-fb538ef80426e2fad20807c2de40ff6a，三片succeeded；哈希、解码/音频流、15关键词实测时间通过，与前版words及文字/动画参数一致。实际查看三张最长词全幅，深色衬层在浅色墙面更清楚。本版连续动效尚未检查，无试听或评分。

verify-cyan-accent.mjs真实Chrome逐一选择五个元素；字号64→65草稿跨图层保持，刷新回保存64，390px无横向溢出、无pageerror，样式API前后完全相同。第一次截图仍在更新预览，不作为渲染证据；补等待更新状态消失后重新完整验证，最终截图实际查看，原生样式预览可见。证据Downloads/cyan-accent-saved-20260929，review.html含样片/对照与工作台链接。新增候选不算独立达标设计，20款≥90仍未完成。

### 双笔触保存v1完成逐事件视觉检查并登记86分（2026-09-29）

上一轮保存与工作台/导出闭环属于progress。本轮读取真实批次并核验视频哈希后生成、实际查看全部15个关键词30fps连续裁切（640×420 at0,60），另生成并查看三份全片2fps全幅联系表。所查未见笔触/衬层脱离、文字跳行或退场残留；两份采访的所查画面避开脸与主要手势。太阳图背景仍争夺注意力，双笔触造型偏简单。中文黑底仅为排版验证，不是完整成片构图；未试听或实时播放评审。

submit-cyan-accent-review.mjs核对保存v1与精确Application/三个视频哈希后登记86分：构图22、动效22、素材16、适配17、编辑9。评审style-review-5b0e4730c816a95669972fb9f925bcbb3e845938f15cf05b6b8bfccc77439c37回读current/evidenceCurrent均true，meetsInternalThreshold=false，保留设计与试听两项阻断。不继承到其他布局、版本或画幅。

verify-cyan-accent-review.mjs真实Chrome刷新前后均显示86/需完善、未试听、分项依据和阻断，三个评审视频可加载；用评审布局试声音所发Application与登记完全相同，刷新保持且不偷偷选择来源素材，无pageerror。评审面板截图实际查看。review.html和visual-inspection.json同步范围与逐词证据。未新建生产批次、未修改样式；20款独立≥90目标仍未完成。

### 动态字幕三输入核验与复杂背景可读性候选（2026-09-29）

上一轮概念解释属于no progress，本轮继续实际成片验证。读取caption-three-inputs-20260929已完成批次production-9f96f79e70ce6aefbdcd0aed7ac507eb，重新核验三视频SHA。实际查看三张全片2fps概览及女性采访双行全幅：字幕避开脸，但压在花纹衣服和手势上，粗描边较拥挤。原保存style-pilot-20260923-caption r3保持不变；原批次129词高亮核验证据在highlight-verification.json，本轮补visual-inspection.json。

新增refine-caption-readability.mjs，派生previewOnly候选：描边3.5→1.4，#101923底板opacity .62，留白14/7px及轻阴影，不改原词、时间、布局和动画。批次production-50cf443e36ebb5be74c5d80dfb50ce2a三片succeeded。15句的content/start/duration、wordTimings、高亮、字号和全部动画值/时间/控制柄与原版一致（仅排除独立关键帧UUID）；129词逐一对应输入转写且视频SHA核验通过。首轮padding直接与像素相等的断言失败，查compiler确认原生参数按字号相对单位存储，按既有换算验证通过，无修改编译器。

实际查看候选四张代表全幅（中文、采访一双行、采访二长单行及双行）和采访二首20帧裁切。文字与花纹背景分离改善，长英文底板过宽、遮挡仍明显；未将其认定为审美达标。Downloads/caption-readability-20260929包含三片、timing-comparison.json、highlight-verification.json、visual-inspection.json及左右视频comparison.html。尚未全事件连续帧审查、试听或保存候选到样式库，无新评分，不新增独立达标设计计数。用户参考工程未修改；20款独立≥90整体目标仍未完成。

### 紧凑逐词字幕排版、全事件检查与工作台候选（2026-09-29）

上一轮三输入可读性候选属于progress。本轮新增refine-caption-layout.mjs，从宽底板候选保留全部样式、中心、文案/事件/动效，仅将文字区域宽84%→68%、高15.4%→18%，解决长英文单行底板过宽并提供双行高度。previewOnly批次production-645d8e1d1aacd587747549342e9b2732三片succeeded。15句文案、起止、词级高亮时间、字号及全部动画参数逐项与前版相同（仅排除key UUID）；129词与实际输入转写一一对应，视频SHA核验通过。首次高亮脚本在渲染尚运行时提前调用失败，等待同一批次成功再执行通过，未重建批次。

实际查看全部15段字幕30fps连续裁切（1280×240 at0,480，含事件前后两帧）及两张英文代表全幅。长英文稳定换成两行，底板横向占用减少，所查未见高亮导致重排、底板尺寸抖动或退场残留；仍覆盖部分手势，矩形底板设计普通，中文黑底不证明成片构图。没有试听或实时全片播放，没有给90分或新增达标计数。

save-caption-layout.mjs将候选保存为style-caption-compact-candidate-20260929 v1，保留原caption r3；回读保存版本后按全幅Application投影，elements/styles/treatments与预览候选完全一致。没有另行导出保存版本，也没有将预览批次冒充保存版本正式评审。verify-caption-layout.mjs真实Chrome验证headline可选、字号44.8→45.8草稿跨容器切换保留、刷新还原44.8、390px无横向溢出/API前后完全相同/无pageerror。初次脚本从容器返回后未切回外观页导致找不到字号，修正导航后完整通过；workbench.png实际查看，预览渲染完成。

Downloads/caption-layout-20260929含三片、连续帧、visual-inspection/timing-comparison/highlight-verification/ui-verification、保存定义及Application，comparison.html含前后视频及工作台入口。脚本语法检查通过。20款独立≥90目标仍未完成；本版后续需保存版本成片评审及更多画幅/真实内容适配。

### 工作台增加长短文案快捷试样（2026-09-29）

上一轮紧凑字幕保存与连续帧/工作台验证属于progress。本轮检查EffectPreview发现自定义示例文案入口默认折叠，短默认文案不易暴露换行问题。在预览区增加可直接点击的短句、长中文、长英文按钮及当前选中状态；只修改预览文案/重点词并重置该示例的词出现次数与同排范围，保留用户语义选择、预览时长和未保存样式。静态示例属于UI展示，分词、调度、排版仍复用Rust预览与现有渲染器，未添加Web业务算法。真实声音预览不显示这些示例按钮。

Web tsc通过。verify-preview-examples.mjs真实Chrome逐个切换，检查实际预览API响应、字号45.8草稿保留、全部例子完成渲染；先添加同排范围，再换文案确认已清除，防止旧词索引混用。刷新恢复保存字号44.8，库API前后完全一致，390px无横向溢出，无pageerror及非空alert。初次脚本把全页空alert元素计数当错误，改检查非空消息并重新完整通过，没有忽略实际错误文案。长中文/长英文桌面截图及手机截图实际查看，按钮与两行文字可见；手机截图显示按钮区，未把它当成完整手机画布检查。

证据Downloads/style-preview-examples-20260929含verification.json与截图。未更改保存样式、未生产新批次、未新增质量评分；这项改动改善创作验证流程，不代表20款独立≥90目标完成。

### 新建样式用途跟随直接打开的单用途样式（2026-09-29）

上一轮快捷试文案属于progress。本轮依据实际工作台截图，检查到分类筛选本来已联动createPurpose，但直接打开/选择动态字幕时新建入口仍默认花字。dynamic-assets.tsx新增仅在选择ID变化时的UI同步：单一且已知用途使用该用途作为新建默认；多用途保持现有选择，不推断主用途。普通草稿编辑、同ID撤销/保存不重置用户显式选择。未改Rust模型或复制业务逻辑。

Web tsc通过。verify-style-create-context.mjs真实Chrome验证深链字幕→新建动态字幕、用户手选重点词在字号草稿修改/撤销后保持、选择装饰→新建装饰素材、筛选字幕→新建字幕、全部筛选保留已有选择、刷新按当前单用途样式初始化。390px无横向溢出、无pageerror，完整样式库API前后完全相同；未实际创建测试垃圾样式。桌面及手机截图实际查看，新建装饰入口与所选装饰一致。证据Downloads/style-create-context-20260929。

本轮改进工作台创作入口一致性，无新增设计、导出或评分，20款独立≥90的目标仍未完成。

### 精细刻度时钟装饰候选与时间语义成片（2026-09-29）

上一轮新建用途联动属于progress。本轮回到装饰质感：从style-study-20260929-clock r1保留独立指针及圆端动效，细化表框/四个主刻度，新增8个圆刻度、深色背衬和黄铜轴心，改暖纸色/深青色/黄铜配色，转针入场.16→.28秒。保存独立style-clock-detail-candidate-20260929 v1，共根容器+21元素；原clock r1未变。refine-clock-detail.mjs可复用完全相同的保存候选，浮点比较仅容忍JSON往返至1e-12精度。

初次生产只提交局部语义段被Rust拒绝（必须完整覆盖原词），随后保留全部语义段，时间相关词设emphasis，其余neutral且无keyword，Application intents仅emphasis。第一次拒绝没有提交生产批次；复用已经保存的同一候选，没有重复入库。第一次完全相等回读检查遇浮点末位差异，确认唯一差异后加数值归一化，未忽略结构差异。

批次production-17264350732ad99e120a1fa7e84cac82两份输入导出成功。三个事件分别十分钟3.42–4.08、December1.36–1.72、June solstice2.32–3.7，逐一与实测转写词时间核对；每事件21部件起止一致，其余语义段未触发时钟。连续帧脚本核验视频SHA，实际查看全部三段30fps右上裁切及三张全幅中点，指针未见脱离、无退场残留，采访所查画面避开脸。小刻度可见但弱，最短.36秒事件停留偏短、突然出现仍需改进；21部件编辑复杂度较高。中文黑底不代表成片构图；未试听，无评分、未计入20款≥90。

真实Chrome选择表盘/主刻度/圆刻度/长针/轴心/背衬成功，无pageerror，工作台截图实际查看。脚本verify-clock-detail.mjs保留，review-marker-refinement.mjs新增可选REVIEW_ELEMENT_ID用于非文字装饰，默认headline不变；本次rim路径实际运行通过、语法检查通过。Downloads/clock-detail-20260929含保存定义、Application、manifest、视频、时序及连续帧证据、review.html。用户参考工程未修改。

### 时钟短事件停留策略与组合面板闭环（2026-09-29）

上一轮精细时钟保存/成片属于progress。本轮发现minSeconds并不是强制延长时长的参数：Rust events调度将其用于时长检查，关键词默认停留由visualRhythm.minDisplaySeconds控制。没有给元素面板添加含义错误的“保证停留”控件，也没有改Rust既有规则。refine-clock-hold.mjs从已导出时钟应用派生组合候选，仅将visualRhythm.minDisplaySeconds设为.75；样式v1、声音数据、词触发点、外观和动效未改。

批次production-5fd545fbf7cd17e95cf88e44537886ea两片成功；check-clock-hold.py验证十分钟显示3.42–4.17（原词结束4.08）、December1.36–2.11（原词结束1.72）、June solstice2.32–3.7（保持原结束）。21部件起止一致、三个实例不重叠。首轮核验误从输入响应顶层读durationSeconds失败，改读input.durationSeconds后完整通过。连续帧工具核验视频SHA，实际查看全部三段30fps右上裁切，短词转针后已有稳定停留，所查无部件脱离/退场残留；突然出现和设计辨识度仍未解决，未试听或评分，未复查本版全幅构图。

将精确组合保存为composition-clock-hold-candidate v1（预览后保存，保存版本未另行导出/评审）。ontology.tsx视觉节奏面板补说明：最短展示不改变触发点，作用于当前组合，受字幕下一段、图层上限与片尾限制。Web tsc通过。verify-clock-hold-panel.mjs真实Chrome在高级设置→断句与编排回读.75，改.9草稿跨视图保持，刷新回.75；说明可见，无pageerror、库API前后不变，面板截图实际查看。Downloads/clock-hold-20260929保留视频、时序/连续帧/UI验证与review.html。该候选是原时钟编排改进，不计独立达标设计；20款≥90仍未完成。


### 当前评审审计与组合列表试听状态闭环（2026-09-29）

上一轮仅解释样式、组合和实例的边界，属于no progress。本轮重新读取当前实现，确认/templates首页是独立样式工作台，按重点词、花字、动态字幕和装饰选择用途；组合独立位于/templates/compositions。样式编辑包含外观、布局、动效与相对事件应用规则，示例节奏与正式声音时间有说明。这是现有结构核验，不冒充本轮新实现，也不表示所有创作流程已经验收。

audit-current-style-delivery.mjs现同时审计整片模板与独立样式应用评审：匹配保存版本、当前证据状态，并重新计算磁盘视频SHA。此次重新执行成功，20个旧整片模板当前内部评分90–92，60份视频哈希匹配；26个使用中样式条目、47个归档条目。独立样式4份当前应用评审79–86，12份视频哈希匹配，22个条目没有当前应用评审。变体不能作为不同风格计数，旧组合分数不能继承到样式。历史日志中把目标扩写为“20款独立样式≥90”的表述不作为新增验收要求；用户原要求是20个模板≥90，后续另要求提高可复用样式的质感和工作台易用性。

组合列表新增的试听状态直接读取Rust质量摘要的listened字段，true显示已试听、false显示未试听、缺失显示试听状态未记录。verify-template-listening-status.mjs第三次运行成功：真实Chrome逐一核对20张达评分线卡片的分数与试听状态，刷新后复核，库API未改变、无pageerror。前两次因初始加载前选择筛选条件被初始化覆盖而失败，改为等待质量卡片出现后选择；没有更改评分或忽略实际异常。本轮读取同一会话的完成结果，并实际查看desktop.png；截图证明卡片状态，右侧仍在加载，不能视为成片播放验证。此前Web tsc已通过，本轮没有进一步修改Web源代码。

证据：Downloads/style-delivery-audit-20260929-current.json、Downloads/template-listening-status-20260929/verification.json及desktop.png。所有被审计记录仍未试听；本轮未重新视觉打分、未试听、未生成新样式。将本页旧“当前事实”标题改为历史快照，避免与顶部最新数值混淆。整体样式质感、真实内容适配与易用性优化仍继续，未宣称全部目标通过。

### 声音试映入口前移并验证真实输入（2026-09-29）

上一轮当前审计与试听状态闭环属于progress。本轮检查effect-trial.tsx发现声音选择位于原视频区域、叠加样式和组合保存之后，用户进入“用声音试效果”却先面对组合配置。将原有DraftPreview（含素材选择、内容标注、生成预览）整体移到实时预览/主样式布局之后、原视频区域和叠加之前，错误与准备状态也前移；补充选声音→看效果→调整搭配的说明。没有新增Web编排逻辑、改变Rust接口或保存样式内容。

Web tsc通过。一次性真实Chrome检查选择NASA Alex实际视频输入，sample-preview成功且共享画布完成渲染；效果区域改成下半画面后再次sample-preview成功，sample请求数据完全一致、复选框仍选中。DOM顺序在桌面与390px都确认声音选择位于裁切/叠加之前，手机无横向溢出，完整样式库前后相同，无pageerror。桌面和手机素材区截图均实际查看。初次脚本使用check()要求异步素材加载完成前立即选中，失败；诊断确认为异步受控复选框，改为click后等待加载结果再完整验证通过，未修改生产逻辑来迁就测试。

证据Downloads/style-trial-mainline-20260929/verification.json、desktop.png、mobile.png；一次性脚本/tmp/verify-style-trial-mainline.mjs。本轮为真实输入预览和页面流程验证，未导出新片、未试听、未进行审美评分。整体目标保持进行中。


### 清晰逐词字幕保存版三片验证与84分应用评审（2026-09-29）

上一轮声音选择前移属于progress。本轮按模板生产技能读取当前schema和保存样式，用produce-caption-saved.mjs将style-caption-compact-candidate-20260929 v1的原生全幅Application直接提交previewOnly批次production-14e99ddcc7cde42a892032f9e0a5674a，只改生产模板ID，未改变视觉或编排参数；三份输入转写版本逐一核对。沿同一批次观察至succeeded，三片published，未因running重建批次。保存定义保持不变。

review-marker-refinement.mjs修复应用没有transform时的取帧中心计算：沿用显式transform，否则从生产模板目标元素区域中心取值，缺失拒绝；本批次实际走无transform路径通过。两脚本语法检查通过。三视频SHA核验、技术解码/音轨检查和129词高亮范围/实测时间核验通过。实际查看三份2fps全幅、三份全部词中点裁切、两张英文双行全幅，以及7段30fps连续字幕裁切（0-0、0-4、1-0、1-1、1-3、2-0、2-5）；其他8段仅生成未查看。所查换行/高亮稳定、无退出残留；底板仍覆盖部分手势、造型基础且切入切出偏硬。中文黑底不证明实拍适配，没有试听或实时全片播放。

submit-caption-saved-review.mjs登记本Application84分（构图21、动效22、素材16、适配16、编辑9），明确上述阻断与检查范围。评审style-review-8496cc028b81658df890a515e3188c2ac9c07f278c4c7fb3634c08f11208d58a回读current/evidenceCurrent为true，未达到内部阈值。真实Chrome验证刷新前后84/需完善/未试听、分项依据、三个成片播放器及首片元数据可读；复用布局链接和刷新发送精确评审Application，不自动选素材、无pageerror。截图实际查看。一次性脚本复用旧验证后console中残留86常量，但UI断言为84且已通过；改用receipt.total，并在ui-review-verification.json记录此报告修正，未修改评分数据。

证据Downloads/caption-saved-20260929包含保存定义、Application、生产manifest、三片、联系表、检查记录、评审回执及review.html。再运行审计确认旧20组合/60片不变；当前独立样式有效评审增为5份、15份对应视频哈希匹配，21个使用中条目尚无当前应用评审。此为补齐保存版的可追溯验证，不是新增独立风格或90分设计；整体目标继续。


### 字幕轻移入退场对照，未采纳（2026-09-29）

上一轮保存版三片评审属于progress。本轮读取保存v1发现已有5.6px/140ms入场位移、退场无位移，不能把“偏硬”误报为完全没有动效。refine-caption-motion.mjs派生previewOnly候选：入场10px/180ms，停留0，退场5px/100ms，文字全程不透明；其他样式、语义、词时间及排版均保留。批次production-2ed0b112d8e4436c67cb687c3a9158f2三片成功，沿同一批次观察，没有超时重建。

check-caption-motion.mjs对15句的起止、全部非垂直位移参数与其他动画逐一比对（排除批次身份字段和动画UUID），完全一致；180ms入场和100ms退场的实际关键帧时间、位移、全不透明通过。连续帧提取重新核验三片SHA。两边并排对照视频只保留候选一路音轨，避免双声叠加；未试听。

实际查看三份首字幕入场前6帧及退出前后6帧的左右对照。较大上浮和下沉可见，但文字/底板仍整体突然出现消失，手势遮挡没有改善；不足以证明有实质审美提升，因此不采纳、不保存新样式、不升级原版、不新增评分。全部15段连续联系表已生成，除上述边界对照外未逐一查看，也未实时播放完整对照。API回读保存v1与原定义完全相同。

证据Downloads/caption-motion-20260929包括三片候选、三片左右对照、comparison.html、边界联系表、timing-comparison.json和visual-inspection.json。此次实验排除了“单纯增加位移即可解决质感”的假设；下一步应处理底板与文字的视觉关系或按画面调整字幕占位，不能再重复增加位移作为完成度提升。整体目标继续。

### 独立底板透明度动效：Rust、工作台、渲染与编辑器闭环（2026-09-29）

上一轮轻移对照未采纳属于progress：它排除了单纯增加位移的方案。本轮检查发现文字底板已有静态opacity，却无独立动效通道，且渲染器未按时间采样这个参数。新增MotionProperty.background_opacity：元素轨道为0–1绝对底板alpha，motion treatment为乘法叠加；只允许带底板文字或共享文字组，拒绝无底板、图形、布局及隔离复合组，数值越界拒绝。Rust模型、校验、编译和AI能力schema同步；没有把业务规则迁移到Web。

Web新增同名工作台轨道，仅文字可选，说明需先启用底板；成片参数background.opacity开放关键帧，加入动画路径与时间轴中文标签。measureTextElement逐帧采样底板alpha，复用既有绘制时alpha钳位与恢复；字色、逐词高亮、整体透明度和布局不受影响。docs/template-production.md补充绝对值/乘法契约。

Rust模板回归203通过、1忽略；含新增编译独立性、与既有动画/静态alpha相乘、非法数值/目标拒绝测试。最初测试用JSON整数1对浮点1.0直接比较失败，改按数值读取比较后通过。Web透明度与反向seek测试2通过/25断言，tsc通过，相关tracked文件diff --check通过。补齐AnimationPropertyPath后重新通过类型检查；一次编辑命令工作目录错误未写入文件，纠正后执行。构建后先确认没有运行/排队生产任务，再替换原4318服务；当前PID18981，日志/tmp/moirai-background-motion-service.log，state200且schema返回新契约，NAS服务未变。

verify-background-motion.mjs真实Chrome在保存v1草稿里添加四个底板关键帧，验证入/停留/退场像素的底板亮度变化而不透明文字像素持续存在，撤销/刷新后保存定义不变，390px无溢出。第一版range填0.001不符合步长失败；第二版将合成预览总长首尾误作实际字幕边界，且对已铺黑底canvas测总alpha而失败。按原生preview实例起止、0.01步长采样，并测蓝黑底板像素亮度与不透明字像素后完整通过。entry/hold/exit/workbench截图实际查看，非隐藏失败或放宽到无渲染检查。

refine-caption-backing-motion.mjs仅增加底板0→.62→.62→0轨道，沿用保存v1原140ms/100ms阶段及原位移动效。previewOnly批次production-0a13d546d505a526c71b44e71f92d292三片成功。check-caption-backing-motion.mjs逐一确认15句全部非底板参数、起止和其他动画保持原样；129词高亮范围/实测时间、视频SHA、技术解码/音轨检查通过。三份首字幕进出场左右边界联系表实际查看，底板不再整体硬切，文字不随之变透明；复杂衣服背景在入退场短暂缺少底板支撑，稳定段手势遮挡仍未解决。没有实时整片播放/试听、未保存样式新版或新增评分。

verify-editor-background-motion.mjs从新批次第一片复制独立文字测试工程，真实编辑器显示四个底板关键帧，跳到第二帧将62%改为50%，自动保存并刷新；逐词高亮、时长、字透明度不变，原生产工程文件逐字节不变。初次未展开“背景”折叠区，点击被其他面板拦截；显式展开后完整通过，无强制点击。编辑器截图实际查看；该50%测试副本未再导出，不冒充候选批次。用户参考工程未修改。

证据Downloads/background-motion-20260929（工作台/编辑器像素与交互结果、截图）和Downloads/caption-backing-motion-20260929（三片、左右对照、字段/高亮核验、visual-inspection.json、comparison.html）。本轮交付可组合的底板动效能力，不等于已解决全部审美或整体目标通过。

### 字幕分段优先级说明与三声音原生策略比较（2026-09-29）

上一轮只有产品边界解释，属于no progress。本轮重新核对当前源码、服务与保存样例，确认captionSpans非空时优先采用指定范围；captionPolicy仍用于规则校验，但不会覆盖手动拆合。保存版英文长句不是自动分段上限失效。CaptionContent补充自动/指定范围提示、声音时间来源，以及减少字数与切换频率的取舍；明确重新分段只改当前声音配置、不改库内样式，字数上限不拆已对齐词，也不保证单行。复查截图后把“已保存”改为“指定”，避免将尚未保存的草稿范围误称为持久化结果。

对三个保存样例分别调用真实Rust /plan，对比保存范围、指定范围配32字符规则、自动16字符、自动32字符。全部词按顺序覆盖且字幕起止严格来自首尾词实测时间；指定范围在更改规则后正文/起止不变。中文均5句；NASA保存4句最长57字符，自动16为15句/6句短于0.6秒，自动32为8句/无不足0.6秒；采访保存6句最长54字符，自动16为21句/12句过短，自动32为13句/2句过短。因此未盲目将所有样例改为16字符，也未把32字符当成普遍最佳规则。

Web tsc通过。真实Chrome在独立声音试映中选择NASA输入，验证自动提示、切换自定义、将字数设32、调用Rust重新分段与成功提示；样式库前后完全一致，390px无横向溢出、无pageerror。首次截图正文仍在加载，随后加强等待正文回读并重新验证。证据Downloads/caption-segmentation-20260929含comparison.json、check.py、ui-verification.json与panel.png。本轮未新导出、未试听、未评分；数据说明下一步应比较32字符分段的实际遮挡和剩余短句，而不能宣称画面问题已解决。参考工程未改，整体目标继续。

### 32字符声音分段三片实测：占位减少，节奏仍需改进（2026-09-29）

上一轮分段提示与原生策略比较属于progress。本轮refine-caption-segmentation.mjs从保存v1派生同样式previewOnly批次production-2d4a44d12de038264b507fad958ae7de；仅将各sample.captionSpans清空并设置captionPolicy.maxCharacters=32，其余样式、语义、原声音/构图保留。沿同一running批次观察至成功，三片实际导出；两次review脚本正确报告running退出，未因未完成重建。一次在item.json尚未生成时提前读取失败，之后以服务/已完成结果验证。

check-caption-segmentation.py确认定义除生产ID/名称外完全一致，样例除分段字段外一致，编译后原视频/音频播放参数相同。初次直接比较整条轨道因不同批次UUID/名称/应用元数据失败；明确排除这些身份/计数字段后逐字段比较，未排除播放、构图、声音或时间参数。三片SHA、技术解码/音轨验证和129词逐词高亮/实测时间验证通过。

生成三片左右对照，声音仅候选一路。实际查看全部26字幕中点左右对照、采访前12句放大图与2.05–3.25秒30fps连续裁切。英文长双行变单行，底板垂直占位下降，部分手势露出更多；现位置仍遮挡手部，并非完全解决。采访“ You need to be / teaching assistant.”被拆成0.46秒/0.54秒，连续图可见再次入场；NASA“because of the / tilt of the earth”也表明机械字符预算不能保证语言自然。因此保留候选对照，不将32设为通用默认、不保存样式新版本、不新增评分。中文五句不变且黑底不提供人物构图证据。没有实时完整播放或试听。

证据Downloads/caption-segmentation-20260929：三片、compare-0..2.mp4、comparison.html、全部中点对照、短句连续图、isolation-verification.json、highlight-verification.json、visual-inspection.json。下一步应在当前声音层面平衡短句/语义完整性与占位，不把内容断句混入视觉样式；整体目标继续。

### 自然词组样例与分段面板风险提示（2026-09-29）

上一轮32字符成片对照属于progress。本轮检查Rust断句实现与36/40/42字符真实/plan输出，确认单纯调整上限仍可能在词组内部切断。沿用现有captionSpans能力，由Agent按实测词索引指定显示段，不增加视觉样式与语言规则的耦合。refine-caption-phrases.mjs保留原样式、语义标注和媒体，仅更改样例分段及校验预算。第一次规划把“Here are the things”独立出来只有0.5秒，提交前断言阻止；第二次添加详细错误后确认该句，将整句保留，才提交唯一批次production-7cd7077c028b68a6a49af47ff47c987f。5/7/8句均至少0.6秒，英文预算60是允许保留完整快句，并非通用自动默认。

同批次观察至三片published，未因running新建。check-caption-segmentation.py新增PILOT_OUTPUT参数，验证仅身份字段外的样式不变、语义和声音输入不变，源视频/音频播放与构图参数相同。三片SHA、解码/音轨检查、129词高亮原始时间完整通过。实际查看全部7句NASA及8句采访同帧对照；teaching assistant整句1.0秒、because of the tilt of the earth整体显示。采访三句恢复双行，占位较32字符候选增加；手势仍受遮挡，最后“huge / impact”仍拆开修饰词和名词，需要合并后再考虑采纳。中文五句未重做视觉复查，未试听、未实时完整播放、不评分或更新保存样式。

CaptionContent现在展示每句持续秒数及对应Rust cue warnings，经现有formatPlanWarnings翻译为中文；前端不计算风险阈值。类型检查通过，真实Chrome验证自动/指定范围、32字符重新分段、读取正文、显示时长及阅读速度提示，390px无横向溢出、无pageerror、库定义前后完全一致，panel.png实际查看。该UI验证仍使用自动32字符，不能冒充自然分段manifest的UI回填验证。

证据Downloads/caption-phrases-20260929含designs/plans、三片、左右对照、全部中点图、isolation-verification.json、highlight-verification.json、ui-verification.json和visual-inspection.json。此轮既完善用户可见诊断，也验证Agent指定显示段的真实生产链；整体质感目标仍未通过。

### AI与人工试映内容文件交接闭环（2026-09-29）

上一轮自然词组样例和风险提示属于progress。本轮针对Agent调好内容只能留在manifest、工作台主要靠标签页暂存的缺口，在ProductionCreate现有保存/恢复旁新增折叠区“与 AI 交换试映内容”。导出使用与会话保存相同的version1 envelope（entries/liveInputId）；导入复用原恢复流程，逐份读取声音及固定转写版本，调用Rust /plan验证内容，全部成功才替换页面状态。样式不包含在文件中，媒体仅引用当前库。文件限制5MB，重复输入和无效条目拒绝；导入不会自动覆盖session保存，成功文案明确仍须保存。未引入浏览器断句/语义业务算法，完整生产仍由Rust验证。

真实Chrome verify-trial-content-exchange.mjs两次完整通过。使用上一轮真实生产manifest的三份内容构造agent-content.json，经文件选择导入，导出逐字段完全相同； malformed JSON、第二份过期revision、第二份错误captionSpan、重复ID分别被拒绝，随后导出证明三份当前内容全部保留。增强版再通过UI把中文第一句拆为0–3/3–10，导出确认改变且语义标注不变，然后重新导入原始文件；真实/sample-preview成功请求包含指定NASA词组范围，画布完成渲染。保存后刷新、恢复、再次导出与原payload完全一致，库定义前后完全相同，无pageerror。390px无横向溢出，首轮desktop/mobile截图实际查看；增强版截图同路径重生成，未另作视觉复审。

Web tsc通过，验证脚本语法检查通过。docs/template-production.md补文件契约、字段、版本/素材依赖和导入语义。证据Downloads/trial-content-exchange-20260929包含agent-content、精确往返/错误保留/人工修改/恢复JSON、verification.json及截图。本轮没有新导出视频或视觉评分，不改变上一轮候选未通过的结论；这是样式独立、内容可交接编辑的产品闭环，整体目标继续。

### 声音样例导入与AI调用共用Rust校验（2026-09-29）

上一轮文件交接闭环属于progress。本轮复查发现旧恢复逻辑单独调用/plan，未覆盖Sample的焦点和按设计绑定字段。production_author新增SampleValidation与只读validate_samples，提取validate_design_samples供正式生产与校验入口共享；检查数量/重复ID/焦点/设计引用，再逐输入读取固定转写、核对source hash并生成原生plan。新增POST /templates/samples/validate和schema.sampleValidationInput。返回全部计划或整体失败，不写库、创建工程或排队任务；不承担素材解码或视觉认证。

Web导入改为一次发送全部样例至原生接口，captionSpans:null映射自动[]；保留重新读取转写版本的检查，全部完成才替换UI状态。文件运输层拒绝不支持字段，避免生产Sample中可用但当前UI不保存的字段被静默丢失。MCP新增readOnly validate_template_samples，描述明确schema和执行边界；无新增Web语义/分段算法。

Rust templates回归204通过、1忽略，新增测试覆盖有效计划、重复ID、旧revision、越界焦点、坏字幕范围、未知设计，且无job写入、转写不变。构建成功，确认197批次无running/queued/pending后重启原4318服务；PID28128，日志/tmp/moirai-sample-validation-service.log，state200与新schema回读成功，NAS服务未变。一次在仓库根目录误启动tsc，未得到有效结果后中止；正确apps/web类型检查通过。随后小改运输字段白名单的检查会话句柄丢失，重新执行确认，不把丢失句柄当成功。

增强verify-trial-content-exchange.mjs真实Chrome通过：三样例精确往返、格式错误/过期转写/坏范围/重复ID/越界焦点/不支持设计绑定字段分别拒绝且保留全部内容，人工拆句、重新导入、实际声音预览、保存刷新恢复、390px布局、无pageerror、库定义前后一致。MCP现有工作台测试10通过；另实际注册handler对真实服务调用，三样例成功、越界焦点返回isError，readOnlyHint为true，native-tool-verification.json留证。本轮未生成视频、未试听或提高评分。docs/template-production.md同步新契约及MCP调用；整体目标继续。

### 下移字幕应用与最后词组修正，交接回工作台（2026-09-29）

上一轮统一Rust校验属于progress。本轮refine-caption-lower-application.mjs通过原生dynamic-assets/application读取保存v1并指定transform{scale:1,centerX:.5,centerY:.9}，保留样式定义；相较前版中心.86，下移28.8设计像素。采访最后45–50/50–54合为45–54，huge impact不再跨显示单元，完整句2.68秒。其他语义、词时间与声音保留，经新samples/validate验证才提交批次production-4b5c633e4e2a727e3e1d93d6985daadb。三片published；running期间继续观察同批次，未重建。

逐字段比较确认元素除region.y外相同，x/宽高不变，编译源画面和声音播放参数相同（排除身份与计数元数据）。三片SHA、技术解码/音轨、129词实测高亮校验通过。实际查看全部7句NASA和7句采访中点左右对照，以及采访最后一句入场18帧连续裁切。下移在部分帧释放更多手势，但仍有手部遮挡；双行未在所查帧裁断，底部留白更紧。没有完整实时播放/试听；中文五句没有重做视觉复查。保留可编辑应用候选，不把下移视作通用默认，不改样式版本或新增评分。

一次性verify-lower-caption-trial.mjs通过真实Chrome：用精确transform链接打开原样式，文件选择导入该批次agent-content.json，成功sample-preview请求的全部template.elements与生产完全一致，NASA字幕范围一致；保存后刷新恢复，垂直中心仍.9，库定义前后相同，无pageerror。这次确实核验了对应候选内容的工作台回填，而非借用上一轮自动32字符的UI验证。comparison.html附精确布局链接与内容文件下载，用户可继续编辑。

证据Downloads/caption-lower-20260929含保存定义/精确Application、三片、左右对照、agent-content、原生validation、placement-verification、highlight-verification、trial-verification、visual-inspection与comparison.html。剩余问题是遮挡/留白取舍与审美质感，并非分段模型缺字段；整体目标继续。

### 试映页收敛为声音与内容主线（2026-09-29）

上一轮下移应用与真实工作台回填属于progress。本轮重新读取ProductionCreate发现单样式试映仍在声音选择前展示任务名称、固定且禁用的模板选择框与保存/AI交换区。仅在draft试映模式去掉固定模板选择框，声音区采用单列；任务名称移入底部“成片导出设置”，继续使用已有默认名称。声音选择置于保存/恢复与AI交换之前，内容标注仍紧随其后。批量生产模式保留模板选择、批次名和原两列布局，未改Rust编排、保存数据或API。

Web正确apps/web工作目录tsc通过。初次在仓库根误发tsc后中止并纠正；后续尝试增加加载提示的编辑命令因解释器编码错误未写入，源码确认无该变化，不将其计为交付。verify-trial-content-exchange.mjs完整回归通过（原生导入校验、错误不覆盖、人工拆句、真实预览、刷新恢复、库不变）。verify-trial-focus.mjs实际Chrome确认声音列表DOM顺序在保存/交换之前、固定模板选择不出现、任务名默认收起且修改后折叠保留；进入批量生产页确认批次名/模板搜索仍可见，390px无溢出、无pageerror。

首次截图在数据加载前，不能作为已加载界面证据；加强等待NASA素材和预览渲染完成后再跑通过，desktop/mobile重新截图均实际查看。证据Downloads/trial-focus-20260929的verification.json和两图，文件交接回归仍位于Downloads/trial-content-exchange-20260929。本轮完成交互层主线整理，未导出新片、未试听、未评分；整体目标继续。

### 素材读取状态与失败重试（2026-09-29）

上一轮试映主线整理属于progress。本轮处理真实截图中初始读取期间空白列表的问题：ProductionCreate增加独立catalogLoading/catalogError，刷新时禁用重复刷新并显示“正在读取素材列表”；成功且无输入才提示生成配音；失败明确展示错误和重试方式，不清空已加载输入或已选样例。读取错误与内容编辑/生产错误分离。空库引导仅指向当前页真实可用的生成配音，未将其他素材库误当成模板声音输入入口。

Web tsc与diff检查通过。一次性verify-trial-loading.mjs用受控网络响应验证等待、空库、503三种状态互不混淆，再解除响应替换访问真实服务，成功加载NASA素材并选择；再次模拟刷新失败后复选框仍选中，恢复真实响应刷新后错误消失且选择保留，无pageerror。实际查看failed-refresh-preserves-selection.png。证据Downloads/trial-loading-20260929/verification.json与截图。受控失败验证不表示真实服务发生过503，本轮没有新视频或视觉评分；整体目标继续。

### 试映页直接导入自己的音频或视频（2026-09-29）

上一轮素材加载状态属于progress。本轮在选声音处新增“导入音频或视频”，复用Rust /inputs二进制上传与转写接口，并复用ProductionSpeech原有pending receipt/轮询/重试状态机。ProductionCreate传输支持Blob原始字节，JSON调用保持原方式。上传后先读取输入：已有有效转写则复用，不自动重转；缺少转写且无活动任务才提交转写；读取/转写失败保留已导入ID，可继续检查或重试。完成后自动加入当前试映并切换实时预览。提示和重试按钮由“配音”改为“声音”，同时涵盖导入和TTS。空库提示同步指向两种入口。

Web tsc和diff检查通过。verify-style-media-import.mjs真实本地既有WAV导入（923998字节，文件SHA与原输入记录一致），确认无转写POST、原转写全部字段不变、自动选中和实时预览成功；受控上传失败保留当前选择，另模拟缺少转写时只提交一次转写任务。后者不证明新素材ASR实跑，也不冒充视频导入实测。首次测试进程退出137，无结果；原测试尝试直接对比大体积Playwright二进制请求缓冲，改为文件SHA/原生复用证据并在独立运行后完整通过，退出原因未确证。imported.png实际查看。

更新verify-style-speech.mjs对应按钮文案并完整跑过原真实TTS回归：生成、读取失败刷新续接、原生去重保留重点、实测词时间预览、受控终态失败重试和稍后处理均通过。没有监听音频或新增审美评分。证据Downloads/trial-media-import-20260929包含既有源文件副本、verification.json和截图；TTS回执仍在/tmp/style-speech-verification.json。当前页已可从自己的声音进入样式试映，无需先绕到组合编辑页导入；整体目标继续。

### 真实视频导入路径补验（2026-09-29）

上一轮直接音频导入与TTS回归属于progress。本轮将verify-style-media-import.mjs扩展为可指定PILOT_INPUT_ID/PILOT_OUTPUT，按真实mediaKind选择文件扩展名和上传MIME，并对视频额外核对原生sample-preview的sourceMedia、主视频轨、原声音轨与逐词高亮元素。使用素材库既有NASA Alex原视频（5521627字节）通过新文件入口实际上传，SHA与源记录一致；没有重新转写，转写记录全部字段保持原样，自动选中并完成实时预览。

完整检查通过，还包括受控错误上传后保留选择，以及模拟无转写时提交一次任务。实际查看actual-video-preview.png，原画面人物、背景与字幕均可见；原声音轨存在经数据核验，但未试听、不声称听感通过。该路径复用已有输入，不能替代从未知新视频首次ASR的端到端验证。没有改变样式库或用户参考工程，未导出新成片、未提高评分。证据Downloads/trial-video-import-20260929/verification.json、原文件副本与两张截图；整体目标继续。

### 新视频首次本地转写到试映验证（2026-09-29）

上一轮视频复用导入验证属于progress。本轮从既有NASA原视频2.14秒起截取6.2秒，生成独立测试文件；预检库中不存在其SHA。使用工作台新入口上传，原生生成input-00e3a493f85178476ce5382618b0f200。首轮测试在Playwright读取上传响应体时遇到inspector cache eviction，测试关闭浏览器；随即读取原生状态确认文件已入库但job/transcript均null，没有把观察错误当ASR失败或重启任何任务。

verify-first-video-import.mjs改为从原生目录按SHA回读上传身份；仅在显式RESUME_IMPORTED_INPUT匹配且无任务/无转写时允许续验。这次重选同文件复用同一个输入，首次创建真实template_transcribe任务b7a67659-b832-4f36-b0f2-0409351b4c8b，attempt1 succeeded，使用本地faster-whisper引擎。没有新增第二个输入或伪造词时间，整个续验只发一次transcribe。回执明确resumedExistingUntranscribedInput=true，不将它冒称为无中断的全新文件首次上传。

实际识别20词，正文为“For the June solstice, because of the tilt of the earth, the northern hemisphere has pointed more towards the sun.”，与原片对应内容一致；revision1/sourceSha256及所有词时间范围有效。实际sample-preview逐一核验20词正文UTF16范围和绝对高亮时间与新ASR一致，视频主轨和原声音轨对应新输入；自动预览、保存刷新恢复均通过，不再次转写，样式库前后一致，无pageerror。first-import-preview.png实际查看。未试听、未新导出整片、未评分。

证据Downloads/trial-first-import-20260929包含派生测试视频、上传身份、故障后原生快照、最终detail.json/verification.json及画布截图。完整证明新视频首次本地ASR到样式试映和内容恢复路径，保留测试中断与续验边界；整体目标继续。

### 重点词试映默认回归直接选词（2026-09-29）

上一目标回合仅解释模板/时间边界，没有改动或新验证，属于no progress；本轮重新读取当前源码与已导入视频的原生转写，继续实际验证。SampleContent原本已有直接点词和双端范围选择，未将已有能力称为新增。发现起止词下拉、拆分、合并与点词同时展开，改为每段“精确范围与段落调整”折叠区，默认突出词句、试听及清除。这里只改变UI显隐；语义编辑、编译与时间计算仍由既有Rust负责。

新增verify-keyword-video-trial.mjs使用新视频input-00e3a493f85178476ce5382618b0f200、青色弹字v1真实浏览器试映。正向June→solstice及反向hemisphere→northern范围、清除、保存刷新恢复通过；原生输出的词内容和开始/持续时间与ASR对齐。该花字规则清理末尾标点，校验按去空白与标点后比较，同时严格核对时间。精确控件默认隐藏、展开可更改终词、收起后词按钮高亮同步；390px无横向溢出，样式库前后未改变，无pageerror。早期验证脚本因fixture漏resourceBindings、错误假定保留英文逗号，以及截图选择器命中三个details而失败，分别修正测试后全程通过，不把这些中断当作产品通过。

既有verify-keyword-word-picker.mjs完整回归通过，覆盖手机点击、反向范围、键盘Enter/Escape、清除、下拉与点击锚点一致、Rust拆段及实际预览时间。更新其他涉及精确控件的验证脚本，使其先展开再操作；未声称这些导出脚本本轮也全部重跑。Web tsc通过。实际查看新视频selection.png与mobile.png。证据Downloads/keyword-click-20260929/verification.json及截图；脚本仅在独立浏览器标签保存试映内容，不改参考工程。没有新导出/试听/审美评分；20个组合既有交付与独立样式候选质量门槛仍按前述记录区分，整体目标继续。

### 动效配置明确相对进度与声音时间边界（2026-09-29）

上一轮直接点词与折叠精确控件属于progress。本轮重读独立样式工作台、图层外观、动效与Rust入口；确认已有外观/布局/动效/规则分区，原生入场预设只替换其拥有的通道并保留独立动作，没有把既有能力重复开发。先运行verify-inspector-navigation.mjs完整通过：分区可达、切换保留未保存内容、容器禁用不适用项、返回保护、手机布局与库不变；实际查看手机截图。

ElementMotion补充当前动画轨道摘要，让高级关键帧折叠时也能读到已有动作；关键帧的可见“时间 %”改为“动作进度 %”，说明进度不等于成片绝对秒数。两种模式分别解释等比伸缩和固定入退场/动态停留，包含短内容压缩的边界。未改字段、原生计算、预设或保存定义；现有辅助名称保留兼容。

一次性/tmp/verify-motion-guidance.mjs真实Chrome验证固定/相对模式说明、轨道摘要、高级展开、模式修改撤销与390px无溢出，库前后相同，无pageerror。首次脚本误以为主字带透明度轨道，原生回读确认主字仅scale/rotation、偏移层另有opacity，修正测试预期后通过。证据Downloads/motion-guidance-20260929含verification.json及桌面/手机截图，mobile.png实际查看。Web tsc及diff检查通过。本轮属于编辑体验与概念边界完善，无新增成片、试听或视觉评分；整体视觉质量目标仍继续。

### 真人字幕无底板候选与逐句对照（2026-09-29）

上一轮动效时间说明与验证属于progress。本轮回到视觉质量，实际查看此前下移字幕的NASA和采访对照，确认矩形底板仍遮挡手势。refine-caption-open-style.mjs从下移批次派生previewOnly草稿，仅改background=null、strokeWidth=2、shadow={black,.7,blur4,x0,y2}；保留字号、区域、动效、5/7/7个手工字幕范围、语义、实测词时间和原画面。调用Rust样例校验成功后提交production-575a9aa85cf2b23f450bd05d8d955f3b；只轮询同一running任务，attempt1成功，三片导出。

技术证据：三片解码/音轨检查通过，导出文件SHA与回执对应；129个词正文UTF16范围和绝对高亮时间全部对齐原转写。独立比较确认输入sample完全一致，模板除身份与指定三个样式字段外相同，编译原视频轨和声音播放参数一致（排除身份/应用hash等元数据）。保存版style-caption-compact-candidate-20260929 v1回读未变。application.json仅保留基准投影信息用于取样；candidate.json明确本候选不是该保存版应用，不借用其评分。

实际查看全部5个中文、7个NASA、7个采访中点左右对照及NASA/采访首句各20帧连续图。无底板版减少了手势上的矩形遮挡；NASA黑外套上字仍可辨；采访花纹衣服会与双行白字竞争，不能据此判90分。字体/区域字段未变，但实际最后一句由双行变单行，这是样式调整后的渲染差异，不能声称所有换行不变。中文仅黑底可读性，不代替中文真人画面适配；没有完整实时审片或试听。

证据Downloads/caption-open-20260929含manifest、校验、三片、19句对照、连续帧、highlight/isolation/visual-inspection回执与comparison.html，已请求在应用内打开对照页（工具返回queued）。本轮保留可编辑生产草稿与对照，不更新已保存样式、不新增评分。仍需处理复杂背景可读性与视觉验收，整体目标继续。

### 描边可读性对照、批次续跑与字幕候选v2回写（2026-09-29）

上一轮无底板三样例与逐句对照属于progress。本轮refine-caption-outline.mjs只将该草稿strokeWidth从2分别改为3、4，其他样式/位置/字体/动效/声音分段相同；Rust样例验证后提交同一两设计批次production-0b9b6b99581f17a4b1aa7cbfe155b4ac。首次渲染明确failed：3段已完成，其余open_editor报editor_not_ready（50秒内未加载代理）。读取终态及日志后对原批次POST /execute续跑，未重建batch/工程；已有导出复用，attempt2 succeeded，最终六片完成。

独立比较确认两设计仅描边宽度不同，样例完全相同；六片解码和音轨检查通过，两档各129词UTF16文字与绝对高亮时间、输出SHA核验通过。实际查看全部19句的2/3/4px局部对照和3px采访4.44秒全画幅：3px比2px在花纹衣服上分离更清楚；4px更重并将最后长句重新挤成双行；选择3px继续作为候选。未做整段实时播放和试听，无正式评分。

将既有style-caption-compact-candidate-20260929从v1保存为v2：无底板、描边3、阴影black/.7/blur4/x0/y2。保存前核对当前定义完全等于旧快照，使用baseRevision1和幂等键。默认区域未改，本次应用仍显式centerY=.9。保存版应用原生投影与选中导出设计的elements/styles/layouts/composition/segmentation/resource字段严格deepEqual；JSON字符串比较styles仅顺序不同，结构相等。此前v1的84分不继承给v2。

/tmp/verify-outline-caption-trial.mjs真实Chrome检查工作台v2底色关闭、描边3、阴影.7；精确应用链接导入三样例内容，实时sample-preview的元素和样式与导出候选一致，字幕分段与位置保存刷新恢复通过，无pageerror，检查期间库不再变化。证据Downloads/caption-outline-20260929含保存定义/投影/投影校验、六视频、对照、两份highlight回执、trial-verification、visual-inspection和comparison.html；页面附v2试映链接和对应内容下载。新增脚本语法检查及diff检查通过。候选已回到可编辑复用主线，视觉/听感整体验收仍继续。

### 批量导出的编辑器加载续等（2026-09-29）

上一轮六片对照、原批次恢复及候选v2保存属于progress。本轮针对该次真实editor_not_ready故障重新读取MCP open_editor契约和生产适配器：open_editor明确复用同工程标签，50秒超时可能表示仍在加载；此前适配器收到该返回后直接记录失败并关闭标签。新增template-renderer-tool.mjs保留结构化错误码，只对open_editor的editor_not_ready最多连续调用3次同一projectId，中途输出waiting_for_editor日志。没有对start_export、wait_for_sync、其他错误或传输超时做盲重放。Rust仍持有编排、任务与发布状态，改动仅为浏览器平台适配。

4项定向测试通过：前两次未就绪第三次成功后只调用一次导出、三次耗尽不启动导出、其他编辑器错误/导出错误/同步错误均不重试、传输超时和坏JSON不重试。另13项authoring/workbench回归通过，语法及diff检查通过。上述续等故障测试为受控工具返回，不冒充实际慢页面实跑；上轮attempt2恢复是真实服务证据，但发生在此改动之前。此轮没有新增渲染或视觉评分；下次原生渲染worker会加载新模块，无需重启Rust或现有编辑器。整体质量验收继续。

### 最新验收复核与三段实拍v2（2026-09-29）

上一轮渲染适配器加载续等修复属于progress。本轮复查既有交付、独立样式协议和实时库，重新执行audit-current-style-delivery：旧20款内部90–92及60份视频哈希仍匹配；独立样式26在用/47归档，9历史评审中4份当前有效、12视频哈希通过、22条目无当前评审、0当前应用达90。字幕v2不能继承v1的84，已修正本页顶部快照，避免继续显示旧5份当前评审。

补适配覆盖：validate-caption-v2-scenes.mjs使用保存v2的原生Application精确投影（中心.9），加入既有浅色制服NIOSH Deborah7秒原片，替换黑底中文样例，另外两段仍为NASA深衣及花纹衣服采访。新增输入26词按三段完整语义子句手工标注，不改原转写/词时间。批次production-6e4028cbb002f3c8992f80abac945f47由更新后的适配器运行，attempt1 succeeded，三片完整导出；本次没有触发editor_not_ready，所以不声称已真实制造慢页面续等。

三片SHA、解码/音轨检查和117个词高亮校验通过。实际查看当前新导出全部17个字幕中点，以及浅色衣服首句20帧连续图；浅色背景字形可辨，长第二句为双行；深衣字幕清楚，花纹背景仍有竞争。所有片段英语、横屏、短口播；没有中文干净实拍、竖屏或完整实时/听感验证。原生仍有reading_speed_exceeds_limit；新增样例沿用模板16字符预算还返回aligned_word_exceeds_character_budget，显式长分段没有因此被自动拆开。保留警告，不为提高分数静默调大阈值。

证据Downloads/caption-v2-three-scenes-20260929含保存版、Application、manifest、原生校验、三片、实际抽帧、highlight-verification、visual-inspection和review.html。当前已有三种衣服/画面纹理的真实应用证据，不能说涵盖三种不同拍摄场景或全场景适配。整体目标继续；下一重点是语言/内容节奏的实际适配与完整动态验收，非再加一轮纯界面文案。

### 原生区分整句预算与单词预算，补三样例内容导入验证（2026-09-29）

上一轮实拍v2与当前交付复核属于progress。本轮从新增英文长句警告追到rhythm::cue，确认此前按整段文本长度/时长判断，却统一返回aligned_word_exceeds_*，使手工多词范围被描述为单个词问题。改为多词句总量超限返回caption_exceeds_character_budget/phrase_duration；仅当某个词自身超限时保留aligned_word_exceeds_*，两者可同时产生。Web只翻译新代码，阈值、手工范围、词时间及编译不变。

节奏20项测试通过，新增覆盖手工多词超限而单词均合法、间隔导致长句、真正超长/超时单词、多词范围含不可拆长词；既有per-sound测试改为正确整句代码。模板全回归205通过、1原有忽略；Web tsc、Rust构建和diff检查通过。确认201生产批次无queued/running、素材服务近期作业无活动后替换本地服务，PID46957，日志/tmp/moirai-caption-diagnostics-service.log，使用原本机配置，未改NAS或凭据。

重新对上一批三实拍样例调用真实/samples/validate，与导出前validation去除warnings后逐字段完全相等；浅色衣服的3句现在正确返回整句预算，不再返回单词预算。保留阅读速度告警。旧生产回执不改写，以保留证据，当前validation-current.json另存。

实际准备工作台验证时发现上一轮生成agent-content.json的两条既有样例缺resourceBindings，当前导入契约要求数组。修正生成脚本及已交付JSON，缺省填空数组；生产manifest本身未改。真实Chrome导入三样例、查看本段字幕警告、保存刷新恢复通过，无pageerror且样式库前后不变，diagnostics-ui.png实际查看。证据caption-v2-three-scenes-20260929/diagnostics-verification.json、validation-current.json、diagnostics-ui-verification.json。此次修正的是诊断准确性和交接可用性，不是提高阈值消除警告，也没有新增视觉评分；整体目标继续。


### 字幕v2完整句边界抽帧评审（2026-09-29）

上一目标回合概念说明未产生新验证，属于no progress；本轮接续既有导出证据。补看花纹衣服最后三句合并边界图，结合前序已查看的14图，完成17句全部入退场边界检查（每边界12帧，30fps，下方1280×240裁切）。boundary-manifest记录实际覆盖；这是局部连续抽帧，不代表完整实时审片或试听。已看帧无高亮导致跳行、明显裁切或退出残留，仍有文字覆盖手势、花纹背景竞争、直接换句较基础的问题。

submit-caption-v2-review.mjs核对实时保存v2定义和三片磁盘SHA，以该保存版精确Application提交原生评审。分项22/22/17/16/9，合计86，保留两项阻断和listened=false；原生回读current/evidenceCurrent均true，未继承v1评分。评审ID style-review-6eba7eea7fa1360946cfcef209bbced48aee9e4f678fb806a6a5b0bf16ac8161。作用域只覆盖1280×720、centerY=.9的三段英语实拍，未扩大到中文、竖屏或任意组合。重新审计旧20款60视频及当前5应用15视频哈希通过。仍无独立样式应用达到90；整体目标继续。

真实Chrome复核当前v2显示86、历史v1折叠后显示84、三份评审视频入口与试用链接的revision2/centerY=.9均正确，无pageerror；review-ui.png实际查看。首次检查脚本误用不存在的详情路由导致等待超时，改为既有/templates?effect=入口后通过，未改产品路由。证据caption-v2-three-scenes-20260929下style-review-request/receipt、boundary-manifest及review-ui-verification。没有新增渲染或试听。

### 内容来源归入应用规则（2026-09-29）

上一轮字幕v2正式应用评审属于progress。本轮检查样式编辑主线，发现“文字内容来源”仍混在视觉外观内。将固定文字/字幕句子/重点词选择移到当前图层应用规则，与相对事件时机放在同一区域；外观保留内容来源摘要、直达规则按钮及高亮方式/颜色。没有变更Rust定义或时间计算。

实际浏览器校验发现既有Rust TextPresentation切换binding时会重设默认anchor，非literal还把maxSeconds重置为600。补充可见提示说明这项既有行为，不声称切换内容来源保持时机不变。验证脚本初版错误假设anchor不变，读取Rust后修正预期；option禁用断言改为读取原生disabled属性。verify-content-rule-navigation最终通过：外观/规则显隐与直达、逐词高亮下关键词来源禁用、关闭高亮后原生切换为关键词及keyword_start默认、用户改为semantic_start后跨区保留、撤销恢复、390px无横向溢出、无pageerror、保存库不变。手机截图实际查看。

verify-inspector-navigation既有导航回归通过，Web tsc与diff检查通过。同步更新另外两份涉及内容来源的旧验收脚本，让其先切换到正确分区；本轮未声称重跑这两份创建/高亮完整流程。新证据/tmp/content-rule-navigation-verification.json及mobile.png。此轮完善工作台概念边界与操作，不新增视觉评分或成片；86分字幕应用及整体质量缺口继续保留。

### 原生解除内容切换对时间规则的覆盖（2026-09-29）

上一轮内容来源分区和浏览器验证属于progress。本轮进一步解决上轮实际暴露的隐式耦合：Rust TextPresentation改变binding时不再重设anchor或maxSeconds；新建用途的默认时机与600秒上限移入create初始化。时间、偏移、最短/最长持续时间和动效均独立保留。UI提示同步改为保留现有时间规则，需要改触发点时显式调整；原生schema对AI也说明此契约。上轮“切换会重设”是当时行为记录，已被本次修复替代，不代表最新行为。

新增原生回归跨4种anchor、3次binding切换，完整比较timing/motions/motionTiming；既有新建用途测试仍验证默认值与预览可执行性。原有两项预览测试依赖内容编辑隐式初始化，改用对应用途的创建入口，其中固定包络测试首轮失败后修正fixture；保留原动态断言。模板回归最终206通过、1原有忽略，Web tsc、Rust构建、diff检查通过。旧高亮浏览器脚本同步显式配置cue_start/keyword_start及600秒上限，本轮未重跑该整套流程。

确认201批次及当前素材作业无queued/running后，使用原本机配置更新服务，PID53472，日志/tmp/moirai-content-timing-service.log，/state恢复正常。实时API验证三种新建用途默认值、12次内容切换保留自定义时间与动效、schema契约可见及保存库完全不变。verify-content-rule-navigation真实浏览器通过外观/规则导航、原生切换保持cue_start、手动semantic_start保留、撤销与手机布局。证据/tmp/content-timing-tests.log、content-timing-api-verification.json、content-rule-navigation-verification.json。无已有样式迁移，无参考工程改动，无新增成片或评分；视觉质量与更多输入适配仍待继续。


### 保存刷新、动态高亮与实测声音时间回归（2026-09-29）

上一轮内容/时间原生解耦属于progress。本轮重跑verify-timed-text-effects完整浏览器流程，改用明确样式链接并按新分区操作，显式设置cue_start及600秒上限。首次失败是时长输入的可访问名称包含单位，补独立aria-label后复用本次创建的v1样例dynamic-11e6efbc-81e4-40f0-8112-8f76d9e1d8be继续，未重复创建。新增刷新后的内容来源、时机和上限回读断言。脚本支持仅恢复v1验收样例，成功归档本次ID，保留失败现场。

最终通过保存v2与刷新恢复、逐字高亮移动、改变预览时长、自定义示例不改保存定义、重点词只显示所选词、撤销、手机无溢出及原有资产不变。两张高亮截图实际查看；这是无声合成示例画面，不能当作真人适配或试听。测试样例成功归档，保存定义仍可追溯。

进一步把此保存v2通过原生Application用于已有三段实拍转写，samples/validate得到17句、117词。逐一比较元素与字幕句子的start/end、每词高亮范围时间与输入转写，全部相等；库前后不变。证据/tmp/saved-text-measured-verification.json记录完整计划；这是实测输入的计划验证，无新增导出或完整视频审片。Web tsc和diff检查通过。最新v4审计仍20款旧模板/60视频及5份当前应用/15视频证据有效，26在用、48归档；独立样式仍未有90分应用，整体目标继续。


### 字幕占位的六片实拍对照（2026-09-29）

上一轮保存刷新与实测时间回归属于progress。本轮针对双行字幕压到手势继续优化视觉。refine-caption-footprint从v2三实拍批次派生两种previewOnly设计：40px字号、84%行宽、14%区域高度，中心分别90%与93%；保持原分段、117词时间、3px描边、阴影、逐词高亮、动效和原视频构图。独立结构比较确认只改字号/区域/身份。production-b70adbff2d8cde19ecd77784f4f7ba63同一任务attempt1成功，六片导出，未重建任务。

六片SHA、原生解码与音轨验证通过，两设计各117词UTF16与绝对高亮时间核对通过。实际查看全部17句三列中点对照及候选A花纹采访长句全幅：A把三句采访双行变单行，垂直占位减少；B下移到93%使浅色制服长双行句贴近底边，暂不采用。A仍在部分手势上叠字，并非完成主体避让。没有连续边界复查、整段实时播放或试听，不作新评分。

证据Downloads/caption-footprint-20260929含manifest、验证、六视频、全部逐句对照、comparison-evidence、两份highlight回执及comparison.html，已请求在应用内打开对照页（工具返回queued）。保存v2回读完全未变；候选保留为可编辑生产草稿，未借用v2的86分。下一步对倾向A补动态边界及可复用写回验证，中文实拍/其他画幅与听感仍缺，整体目标继续。


### 紧凑宽行字幕v3写回与试映（2026-09-29）

上一轮六片占位对照属于progress。本轮补查候选A全部17句入退场合并图（34条边界、各12帧、30fps、下方1280×240裁切）。实际逐一查看3/7/7句，无新裁切、高亮跳行或退出残留；直接换句及手势遮挡仍存在，EOF联系表填充格不当作输出黑帧。boundary-manifest记录覆盖与未实时播放/试听限制。

save-caption-footprint核对保存v2与前次快照完全相等后，以baseRevision2保存v3。字号40、行宽.84、高度.14、默认中心.90，其他时间/动效/高亮不变；provenance更新为实际无底板和检查范围。第一次保存后校验因为描述文字预期不同中止；没有再次保存或覆盖，用已保存v3回读恢复检查。逐字段比较原生投影与候选A，仅排除身份、名称与已明确更改的来源说明，数值允许4倍机器精度；所有视觉、资源、编排和时间字段通过。v2分数转历史，v3没有正式评审。

真实Chrome检查工作台字号40、描边3、阴影.7和无底板；精确v3/.90试映链接导入三段样例，实际sample-preview模板元素、样式和字幕分段与原生保存投影一致，位置与内容保存刷新恢复通过，无pageerror且检查期间库未变。首次脚本沿用旧样例liveInput索引1导致找不到请求，按导入文件liveInputId修正为索引0后通过。trial-preview.png实际查看，证明试映有原视频与字幕，不声称已实时播放。

证据Downloads/caption-footprint-20260929新增saved-style/application/projection/projection-verification、有效agent-content、trial-verification和截图；comparison.html已附保存v3精确试映入口与内容下载。当前v5审计旧20款60视频及4份当前样式12视频哈希仍有效；26在用、48归档、22条目无当前评审。此次是视觉候选可编辑复用闭环，无新增正式分数或试听，整体目标继续。

试映截图初次拍到刷新后的“正在更新效果”状态，未把它当画面通过。补充刷新恢复后等待aria-busy=false及canvas出现，再完整运行通过并实际查看新截图：7秒浅色制服原片与单行逐词字幕可见。上述截图结论对应补查后的文件。

### 字幕v3跨画幅试文案与竖屏应用方案（2026-09-29）

上一轮v3保存与试映闭环属于progress。本轮真实Chrome捕获横屏、方屏、竖屏各短句/长中文/长英文共9个无声示例，实际查看三画幅的6个长文案画面。等比应用在横/方屏能显示完整双行，但竖屏文字明显偏小；没有将“未溢出”当作竖屏可读性合格。首个采集脚本监听了错误endpoint而超时，改为现有application-preview并从不同于默认的长中文开始后完成。

进一步使用既有独立大小、独立字幕行宽进行6个竖屏对照（1.6/2倍，各3种文本），全部实际查看。160% + 90%行宽 + 垂直中心88%比默认更可读，200%长句左右留白较少；倾向160%作为待实拍应用方案。未改变保存样式、默认算法或自动分段。此为黑底合成示例，不包含真实竖屏人物构图、完整连续动效或试听，不能更新正式评分。

证据Downloads/caption-v3-formats-20260929/inspection.json及9截图、caption-v3-portrait-20260929/inspection.json及6截图、visual-inspection、application.json和comparison.html。应用参数保留保存版本3、720×1280/30fps、scale1.6、center(.5,.88)、captionWidth.9，用户可打开试映链接、AI可读取同一参数。已请求打开对照页（queued）；不创建另一个样式变体。整体质量目标继续。

补查精确试映链接：实际浏览器发送的原生Application逐字段等于交付application.json，竖屏/90%行宽/88%中心控件恢复正确，无pageerror，保存样式前后不变；application-verification.json通过。


### 竖屏实拍素材可用性复核（2026-09-29）

上一轮跨画幅试文案与应用参数验证属于progress。本轮读当前25个输入，检查竖屏候选和转写。用户桌面lQbPJxxvcYaRvuMAALCYyhqserGknAp5bBXir10A.mp4的SHA与input-78c44ead8594fa3c15d54b6c539702f4原片完全一致，不是另一个干净版本。实际查看其前12秒库内片段input-be1b550eb021331f43df1128ff89110d的6帧联系表，画面已有标题及大段烧录花字；部分后半段原片本身有缩画框。此源不用于证明干净竖屏字幕适配，也未裁切、擦除或改写参考工程。

片段ASR开头“权欲”与烧录“全域”不一致，保留原始转写，未未经复核更改输入。参考03的既有转写校正也明确使用烧录字幕。不是对所有竖屏输入完成视觉审查的声明。已异步询问用户是否有无字幕竖屏原片及本地路径；这只是素材缺口，未把整个目标设为blocked。证据Downloads/portrait-source-audit-20260929/audit.json和实际查看的reference-contact.jpg。无新渲染、评分或试听；后续仍可独立优化重点词、花字和组合体验。

### 试映方案链接复用入口（2026-09-29）

上一轮竖屏原片审计属于progress，干净竖屏素材问题仍待用户回复，未重复询问。本轮继续独立完善复用主线：试映已有URL参数持久化和原生组合能力，但缺少明确复制入口。EffectTrial新增“复制试映方案链接”，复制当前URL并明确钉住revision；不创建样式副本，不改声音或内容。文案区分方案链接与单独导入的声音/内容标注。参数变化后隐藏旧成功状态；剪贴板失败显示可聚焦全选的只读链接，不冒称已复制，不阻断原有试映。

verify-trial-link-reuse真实Chrome使用字幕v3+青色弹字的组合、竖屏160%/.9行宽/.88位置及显式空intents数组。实际剪贴板读写通过，重新打开复制链接后的原生组合template完整deepEqual；样式版本、附加实例和语义保留。改画幅后成功提示消失；注入NotAllowedError验证手动复制回退，全选、390px无横向溢出、无pageerror，库前后不变。mobile-fallback截图实际查看，证据Downloads/trial-link-reuse-20260929/verification.json。Web项目目录tsc与diff检查通过；首次误在仓库根目录运行tsc得到跨项目配置/路径错误，未作为Web检查结果，随后用apps/web配置验证通过。

这项改动属于浏览器交互，原生业务建模、应用/组合编译和保存均保持既有Rust入口。无新增视觉评分、导出或试听，整体目标继续。


### AI试映内容可选素材绑定兼容性（2026-09-29）

上一条仅解释产品边界的回复属于no progress；本轮回到实际工作树并轮询既有浏览器session14156及Web类型检查session90456，两者均正常结束且exit0，没有重建任务。修复工作台SavedSample把resourceBindings错误当必填的问题：缺省绑定由Rust samples/validate验证后在UI恢复为空映射；非法绑定仍由原生拒绝，所有内容在完整校验后才统一替换。semanticUnits仍是当前UI必填，本轮不声称所有原生可选字段都已兼容。

verify-trial-content-exchange使用当前保存样式版本，新增三条输入都省略resourceBindings的导入/导出等价检查，以及不存在槽位/资产绑定的失败保护。真实Chrome验证三样例往返、上述两项、错误JSON/旧转写版本/错误字幕范围/重复输入/非法焦点/不支持字段的原内容保留、导入后人工拆句、原生试映请求、保存刷新恢复、390px无横向溢出与库前后完全不变；无pageerror。实际查看desktop.png及mobile.png，导入导出控件和内容分区可见，无文字横向裁切。

证据/Users/zhengwei/Downloads/trial-content-optional-bindings-20260929/verification.json及各失败后导出快照。Web tsc和git diff --check通过。此次闭环只涉及AI内容交换，不增加成片、正式视觉分数或试听证据；独立样式视觉质量、干净竖屏实拍适配等仍未验收，整体目标保持进行中。


### 内容来源与高亮组合的操作引导（2026-09-29）

上一轮可选素材绑定兼容及真实浏览器证据属于progress。本轮检查工作台发现：逐字高亮开启时内容来源的重点词/固定文字选项禁用，但没有就地解释与返回调整入口。新增对应约束说明及“调整高亮方式”按钮，返回外观分区；关闭高亮后提示消失。外观区对固定文字/重点词说明逐字高亮需要字幕句子，使用既有“更改内容与出现规则”入口。此为UI指引，未修改Rust能力约束、保存资产、时序或自动转换用户选择。

扩展verify-content-rule-navigation，真实Chrome通过逐字限制说明、反向导航到高亮、关闭后提示消失、原生切换重点词、外观对应说明、cue_start保持、手动semantic_start跨分区保持、撤销和390px无溢出。库前后完整相等，无pageerror；Web tsc、diff检查通过。实际查看/tmp/content-rule-navigation-mobile.png，规则说明与按钮可见，证据/tmp/content-rule-navigation-verification.json。此次未新增审美评分/导出/试听，整体目标继续。


### 字幕与重点词组合的三实拍对照（2026-09-29）

上一轮内容/高亮操作引导属于progress。本轮转向实际视觉组合：保存字幕v3在.90中心，叠加青色弹字v2，scale.6，比较.70/.76中心，原视频构图、字幕范围与测得词时间保留。第一样例原本无重点词，按已有转写选择house/calculator/never got upset，仅改变本次样例标注，不修改库内转写；其余两例沿用已有标注。两个设计各三份独立预览，生产前样式库回读完全不变。

批次production-5225929ac39a125ee520e0a0136dae57，attempt1最终succeeded、两项各3个published预览，6份SHA/解码/音轨技术检查通过。一次审片脚本在running时主动退出，继续读原批次到succeeded后才运行抽帧，未重新提交。过程中曾过早口头称六片导出，随即已纠正，最终完成依据为batch.json。

实际查看5张双列联系图，共13事件/26中点帧：两位置在所查帧未盖脸，但仍压胸牌/领带/花纹衣服；多词花字常变两行、字比基础字幕小，层级弱。代码/投影复核显示544×960源样式在1280×720以.6缩放，45px字号的区域宽仅.1683；现有captionWidth只作用sentence，重点词无法独立加宽。仅移动高度不能解决此问题，两候选均不验收。下一步应补齐应用阶段重点词独立行宽并用同输入对照，不改声音时间或强制放大所有样式。

证据Downloads/caption-keyword-composition-20260929包含保存版本应用与插入请求、验证、批次和两生产项、26帧、5联系图、6本地视频、inspection.json和comparison.html。新增compare-caption-keyword-composition.mjs及review-caption-keyword-composition.py可复现本次准备与技术/抽帧检查。未做边界连续帧、实时完整播放或试听，无正式分数；整体目标继续。


### 通用文字图层行宽与真实组合验证（2026-09-29）

上一轮两高度实拍对照属于progress。本轮据其窄框问题新增通用textWidths（源文字图层ID→输出画布宽度比例），用于Application及Insert；不新增仅限关键词的专用排版器。Rust在缩放/摆放及captionWidth之后应用覆盖，保留中心、字号、动效和时间；所有文字绑定可用，拒绝未知/非文字图层、无效宽度和越界。Insert用未加实例前缀的源ID且要求placement。空映射不改变既有应用标识。MCP两工具说明和原生schema同步。

Web主样式/叠加样式都有逐图层行宽控件，链接及评审复用链接保留覆盖；关闭移除覆盖。实际Chrome通过两类入口、仅选中region变化、完整投影刷新相等、错误宽度阻止后修正恢复、关闭精确还原、库完全未变及390px布局。首张手机图显示复选框被继承样式居中，补局部flex样式后重跑通过并实际查看最终截图。证据Downloads/trial-text-widths-20260929。

原生模板208测试通过、1既有忽略；新增覆盖混合sentence/keyword/literal/shape隔离、优先级、空字段兼容、越界与插入作用域。Web tsc、MCP传输测试（含新字段）、Rust build、diff检查通过。确认203生产批次及footage作业无活动任务后更新服务，PID71365，日志/tmp/moirai-text-width-service.log；实时schema含textWidths。

保持上轮高度70%、scale.6，关键词区域仅由.1683加宽到.5；结构比较确认除了该层region.x/width及模板身份完全不变，三输入与标注完全相同。批次production-53bb0cbac865d0f8d703818217219650 attempt1成功，3视频SHA/解码/音轨技术检查通过。全部编译叠加元素内容、startTime、duration与原批次完全相等。实际查看13事件的5张双列联系图：原8组双行重点词均变单行，短词保持；花字不再因窄框显著缩小。但胸牌/领带/花纹衣服及部分手势仍被遮挡，不授予正式评分。

证据Downloads/caption-keyword-width-20260929含原生请求、批次、生产项、13帧、5对照图、3视频、结构/编译时间校验、inspection、comparison.html、带textWidths的试映链接及可导入内容。未改已保存样式或参考工程；未完整连续审片/试听，中文竖屏实拍和最终组合质量仍未验收，整体目标继续。


### 加宽花字的动态边界与交付链接回归（2026-09-29）

上一轮通用行宽实现与三实拍对照属于progress。本轮对同一批次production-53bb0cbac865d0f8d703818217219650的13关键词逐一抽取/实际查看入场和退场，26条各9帧、30fps、下半画面1280×360裁切。退场窗口调整到包含退出后约0.1秒，避免只看到结束瞬间；仅重抽帧，没有重新生产。13张合并图全部查看，无新跳行、字形裁切或退出残留。NASA的northern hemisphere/longer sunlight仍压手势，其他衣物遮挡不消失。短词house .34秒、December .36秒仅检查帧，不声称实时阅读或试听合格；采访末尾整体变暗，未在此轮判断来源。

实际Chrome打开交付trial-link.txt，原生组合投影除生产身份id/name/revision外与导出模板逐字段相等；导入交付agent-content.json（三输入）成功，首例sample-preview的语义/字幕范围逐字段等于输入，花字行宽.5保留，原库不变，无pageerror。handoff-preview.png实际查看有真人源画面与字幕，未把此静态截图当作实时播放。证据handoff-verification.json、boundary-manifest.json及26边界条；comparison.html已追加可展开边界图，保留未试听/未正式评分说明。

新增scripts/templates/review-caption-keyword-boundaries.py可复现抽帧。此次补齐新能力的动态抽检和交付复用证据，没有新的正式分数、样式保存或导出；衣物/手势遮挡、整体视觉层级、干净中文竖屏实拍及听感仍未验收，整体目标继续。


### 遮挡边界检查与左上角应用候选（2026-09-29）

上一轮动态边界与链接回归属于progress。本轮读现有保护区域实现，确认其作用是排除/拒绝冲突元素，不能自动寻找空白位置；没有把关闭花字或隐藏冲突元素当作完成避让。继续用显式应用参数比较左上角：center(.23,.16)、行宽.4、scale.6，字幕与原构图保留。

批次production-50cc1f1b3ad35b5870943f923c14a106 attempt1 succeeded，3预览published，SHA/解码/音轨技术检查通过。结构验证同三输入与标注，仅关键词region和模板身份不同；全部编译叠加文字内容与起止时间相同。实际查看13中点的5张双列对照，左上角避开所查帧的人脸、胸牌/领带/衣物及手势，所有词组仍单行；NASA太阳背景仍与花字竞争，离底部字幕更远，短词实时可读性未证明。倾向此位置用于这三输入，但不设通用默认，不声称自动人物避让或90分合格。

证据Downloads/caption-keyword-corner-20260929含投影/插入请求、三视频、13帧、5对照图、结构/时间校验、inspection与comparison.html，附可编辑试映链接及同内容文件。本次未验左上角的连续边界/完整播放/试听，未保存新样式、改原版本或参考工程。批次brief前缀记录实际(.23,.16)，但复用脚本尾句仍带旧两高度描述；以insertions.json及template实际字段为准，脚本现已改成从明确应用参数描述，未重提批次。整体目标继续。


### 独立结束时机建模与工作台闭环（2026-09-29）

上一轮左上角实拍对照属于progress。本轮进一步核对短词展示模型，发现Timing只能配置开始锚点/偏移及最短最长值，结束跟随开始锚点隐式决定；固定事件ID生命周期不适合作为可复用声音样式的配置。因此增加可选timing.endAnchor：event_end/cue_end/semantic_end/video_end。Rust在现有调度中解析关联事件，仍受maxSeconds和输入总时长限制；未指定保持旧序列化与行为。字幕结束要求事件属于对应字幕且不跨句，缺失关联明确报错；语义结束要求语义关联，不静默推测时间。后续整片composition生命周期的原有优先级保留。

工作台应用规则新增结束时机，AI通过同一原生schema读取/写入。初次真实Chrome回归发现原生编辑保留字段，但selected草稿回读漏了endAnchor，导致面板回默认；修复初始化映射并复用同一v1测试样例dynamic-18e70a5b-5372-43f4-82e3-47ef0198cf1c重跑，没有重复创建。最终保存v2、刷新、keyword→literal内容切换仍保留结束规则、开始时机不变、撤销、390px无溢出通过；实际查看mobile.png。成功后归档测试样式，原有样式逐项不变，无pageerror。

模板210测试通过、1原有忽略；另补内容切换保留完整endAnchor回归通过。覆盖事件/句子/语义/视频四结束边界、开始偏移、两内容类型、时长上限、缺失关联和跨句错误、旧序列化/计划一致。Web tsc、Rust构建、diff检查通过。确认205生产批次及footage作业无活动后更新服务，PID83073，日志/tmp/moirai-end-anchor-service.log；实时schema含endAnchor。

对现有左上角组合做只读三实测输入计划比较：仅花字显式设置semantic_end，13重点词开始与文案相同，结束逐一等于已测语义段末词结束，其他所有叠加元素和字幕计划完全相同；4例延长、9例不变。句尾词house和December没有被自动延长，不能用此能力声称已解决短词实时可读性。证据Downloads/end-anchor-workbench-20260929含fixture、verification、mobile、synthetic-preview及measured-verification。没有为新结束规则导出视频或正式审美评分，未试听；整体目标继续。

### 语义结束规则实际导出与遮挡复核（2026-09-29）

上一条仅解释模板产品边界的回复属于no progress；本轮重新检查工作树和既有批次，继续实证核验。production-0b11d5311d89e0fb4414f05ae262c7de 已成功，三份预览的SHA、解码、音轨技术验证重新通过，未重新提交。13个关键词的起点、外观、弹入阶段及其他字幕轨道保持不变；4个延长、9个不变，退场仍40ms。

修复review-keyword-end-boundary.py将片尾采样钳位成重复帧的问题：缺少真正退出后采样时返回null、标注不可用，不再把淡出中画面当退出后证据。重新抽取并实际查看四张对照图。never got upset延长.24秒，片尾无退出后画面；June solstice延长1.76秒；northern hemisphere延长1.62秒，在6.82秒人物倾斜后文字右缘触及/覆盖额头边缘；longer sunlight延长.98秒。后三例所查退出后帧无残留。此前左上角13中点未遮脸的结论仅限那些中点，不能推广到整个停留区间。

结论：独立结束规则执行正确，但本应用不通过视觉验收，不把semantic_end设为通用默认。进一步优化应同时考虑人物移动期间的安全区域、文字行宽及阅读距离，而非只延长时长。house/December仍未延长，短词可读性未解决。Downloads/keyword-semantic-end-20260929/inspection.json记录检查范围和阻断项；comparison.html提供三视频、四对照图和片尾缺证说明。没有改保存样式/参考工程，没有正式评分或试听；整体目标继续。

### 上方花字的全停留区间抽样（2026-09-29）

上一轮实际语义结束对照及抽帧修正属于progress。本轮核对原生保护区逻辑：现有机制会排除冲突元素，不会自动寻找空白位置。本轮未冒称自动避让；继续用同三真实输入做显式摆放试验，花字中心高度从.16上移到.06，行宽.4、字号、semantic_end和其他属性保留。

compare-keyword-end-boundary.mjs增加输出目录与中心高度参数，初次ID含小数点被原生校验拒绝（尚未生产），改成合法连字符ID后提交production-7b2998df8208d4225eb2a5ca3bff990b。attempt1成功、三预览published，三文件SHA/解码/音轨技术检查通过。新增review-keyword-clearance.py严格核对编译产物：除生产身份/name元数据及关键词transform.positionY外，其余字段、动画和时间完全一致；非关键词保持完全一致。

对13次花字停留每.2秒抽帧并补结束前.02秒，实际查看全部13张联系图及NASA6.84秒原分辨率画面。所查帧没有脸/手遮挡或字形裁切，长词均一行，之前额头接触处已留出间隔。但文字更靠上、离底部字幕更远，视觉游离感仍存在，不作为通用默认或最终验收。采样间隙不能证明逐帧无碰撞；无实时完整播放和试听，短词可读性仍待验。

证据Downloads/keyword-top-clearance-20260929包含批次/验证/生产项、三视频、逐事件联系图、clearance-inspection.json、原分辨率复核图和comparison.html。未改参考工程或保存样式，无新增正式分数；脚本语法与git diff --check通过，整体目标继续。

### 工作台保存到试映的一步衔接（2026-09-29）

上一轮上方花字实际导出与93帧检查属于progress。本轮回到样式工作台主线，发现改动后试映链接禁用，用户必须先保存再点击试映。新增“保存并用声音试效果”：调用既有原生保存，成功后按保存回执的ID/revision导航；失败留在草稿，普通保存仍留在工作台，无修改仍用原版本链接。未增加Web业务模型。

真实Chrome回归模拟409保存冲突，确认名称/结束时机草稿保留、没有导航且库版本不变；恢复正常保存后一次操作进入新revision试映，semantic_end保留。首轮保存/跳转成功但验证脚本错用heading查找样式名称而超时；改成页面标题及header文本检查，复用同一fixture重跑成功至v3，未重复新建。刷新后干净状态恢复普通试映链接；390px无横向溢出，原有资产逐项不变，无pageerror，测试资产dynamic-2a2e6716-73c0-4e14-a43f-719bfbaba226已归档。额外只读检查v3试映画布实际就绪，实际查看mobile.png与trial-ready.png；早期trial.png是在更新中，不当作画布就绪证据。

证据Downloads/style-save-and-trial-20260929/verification.json和截图；脚本verify-style-save-and-trial.mjs包含失败保护、最新版本、移动布局和归档。Web tsc及git diff --check通过。这是工作台使用路径优化，不是新的审美合格或试听证明，整体目标继续。

### 试映页三步导航与真实素材状态保留（2026-09-29）

上一轮保存后直接试映属于progress。本轮继续整理试映主线：新增固定的“1 选素材与内容 / 2 看效果与布局 / 3 叠加与复用”导航。点击将焦点和视口移至对应区域，保持全部现有内容与参数，不切换/卸载表单；准备未完成时相应入口禁用。样式只涉及Web交互和布局，未改变Rust规划或素材。

新增verify-trial-step-navigation.mjs，用当前字幕v3和真实NIOSH输入验证选素材→看实际画面→改上半区域→叠加区搜索→返回内容/布局，素材、区域与搜索均保留。验证各目标获得键盘焦点、处于可见范围且不被固定导航挡住，390px无横向溢出，库前后完整相等、无pageerror。初次脚本使用check立即断言异步加载的素材复选框而失败，改成点击后等待对应素材预览按钮，不重试导入或生成生产任务。第二次完整通过，Web tsc及diff检查通过。

实际查看mobile-preview/content/composition三截图；真实画面可见，导航在长表单滚动后仍可用。试验中的上半区域只用于验证参数保留，不代表字幕可读性或审美合格；未完整播放、未试听。证据Downloads/trial-step-navigation-20260929/verification.json和三截图。整体目标继续。

### 区域缩放与独立摆放的区别（2026-09-29）

上一轮三步导航及真实素材验证属于progress。本轮追查上轮试映截图的微小字幕，先前口头推测是竖屏转横屏，经当前资产回读纠正：字幕v3源画布1280×720、字号40；上半区域将整个设计等比缩成一半，实际字号20。此为现有原生适配语义，不是保存样式本身字体异常。

试映页在非完整区域且未开启独立摆放时解释整体等比缩放，增加“保持字号，独立摆放”入口，调用已有完整区域+transform scale1契约；恢复完整画布适配后的字号后，用户可用九宫格移动。跨画幅时依旧是原生完整画布适配，不承诺保留源像素字号。不改默认摆放，不另建业务模型。

真实Chrome验证完整字号40→上半区域20→独立恢复40，移至上方后styles、motions、timing及文字区域宽不变，链接保存scale和中心，刷新后原生投影完全相等；390px无横向溢出、原库完整相等、无pageerror。实际查看guidance-mobile与independent-mobile截图，后者预览就绪。证据Downloads/trial-fit-guidance-20260929/verification.json，脚本verify-trial-fit-guidance.mjs；Web tsc、git diff --check通过。未新增导出、审美分数或试听；整体目标继续。

### 试映返回编辑后的内容自动续接（2026-09-29）

上一轮缩放说明与独立摆放验证属于progress。本轮发现试映返回工作台前容易忘记手动存内容，增加仅独立试映页启用的resumeContent。ProductionCreate将已完成选择/标注暂存于按路径隔离的sessionStorage automatic键，返回/刷新后复用原生校验恢复。普通生产入口不启用。手动快照独立保留；失效恢复不覆盖备份，主动清空素材则移除自动记录；忙碌、修正及未完成编辑不写入。

真实Chrome导入三份既有实拍标注，返回工作台再试映后逐字段验证自动快照/标注不变、3素材仍选中，手动快照不变；注入仅浏览器备份中的失效transcriptRevision，原生拒绝恢复且旧备份保留、未选任何素材；用手动快照恢复成功，再清空全部并刷新确认不复活。390px无溢出，实际查看restored-mobile.png，原库完整相等、无pageerror。证据Downloads/trial-auto-resume-20260929/verification.json，脚本verify-trial-auto-resume.mjs。

首次误在仓库根执行tsc产生不适用的跨项目配置错误，已改在apps/web按项目配置执行并通过；git diff --check通过。本轮没有导出/评分/试听，整体目标继续。

### 试映应用参数的往返续接（2026-09-29）

上一轮自动内容续接属于progress。本轮补齐同一路径的应用参数：成功原生准备后按样式ID在标签页记住白名单查询参数（画幅、区域、独立变换、两类行宽、视频区域、语义和叠加关系）。返回工作台的普通试映、快速试看和保存后试映入口共用trialHref，读取此前方案，但revision始终取本次选中/保存回执，旧版本及未知导航参数不会被恢复。失败的应用不覆盖上一份可用方案；存储不可用时普通试映可继续，页面提示可复制链接。

真实Chrome使用字幕v3+青色花字v2组合、显式空语义数组和独立文字行宽，导入三份真实标注，返回再试映后原生组合投影逐字段相等、3素材自动恢复。把scale改4触发原生拒绝后，记录保持原值，再返回工作台链接仍使用scale1。第一轮测试只匹配若干错误措辞导致等待超时，改为依据实际失败HTTP响应及alert检查后完整通过，没有重提生产任务。库前后完整相等，无pageerror。证据Downloads/trial-layout-resume-20260929/verification.json，脚本verify-trial-layout-resume.mjs。

trial-session两项测试通过，覆盖新保存版本优先、跨样式隔离、未知目标过滤和存储不可用退化。Web类型检查及diff检查通过。此次仅标签页导航状态，原生验证/时序/样式无变化，无新增导出或审美评分，整体目标继续。

### 句内重点词强调的独立样式候选（2026-09-29）

上一轮布局续接属于progress。本轮回到视觉质量，试验将青色重点词留在字幕句内，移除独立花字层，将原active_word高亮改为keyword及青色，字幕本身位置/字号/描边/入场保留。同三实拍、17字幕段、13关键词、词时间和原视频构图。批次production-e00985f5016a683b240dc869853a691a attempt1 succeeded，3视频published，SHA/解码/音轨技术检查通过。

review-inline-keyword-caption.py核对17字幕段文字、起止时间和几何相同，生成13同时间对照，全部实际查看。两例NASA在原语义延长段中点已过原字幕，因此补看June solstice3.01秒、northern hemisphere6.28秒，确认句内完整高亮；17个编译字幕中13个高亮范围与关键词对应。没有跨字幕分割关键词的新增验收依据。句内强调更集中，消除上方独立文字的阅读距离；house高亮随整句保留2.22秒、December1.72秒，原花字仅.34/.36秒。但它从字幕开始就高亮，不是读词触发弹入，也弱化了独立花字表现力，不作为所有花字的替代。

通过原生capture另存style-caption-inline-cyan-candidate-20260929 v1，命名明确待评审，原字幕/花字版本未更新。初次保存后校验显式mode===keyword失败，因为原生序列化省略keyword默认值；回读已保存同一候选，按原生默认语义验证成功，没有重复创建。保存后重新应用保留单文字层和完整styles，原生预览成功；实际Chrome确认外观面板高亮方式keyword、画布可见、三个实拍输入可导入试映，无pageerror，实际查看saved-style.png。

Downloads/inline-keyword-caption-20260929含三视频、13对照/5联系图、两补充帧、highlight-spans、inspection、候选回读/投影和ui-verification及comparison.html。导出来自保存前试验图，未提交正式保存版本应用评分；没有完整连续播放或试听，未宣布90分或整体完成。

### 句内强调候选的保存版一致性与边界检查（2026-09-29）

上一轮句内青色强调的三成片对照及候选保存属于progress。本轮核对保存后application和原试验图，差异为模板身份、描述/evidence及keyword默认值省略；用当前原生samples/validate对同三输入逐字段比较，排除templateId/templateRevision后整个计划完全相等，包括字幕、元素、事件、词时间、警告等。初次未排除模板身份导致断言失败，未掩盖其他字段，后续只排除这两项通过。证据saved-plan-verification.json。

新增review-inline-caption-boundaries.py，对三份已有成片抽17处字幕结束与3处首句入场，每处六个边界偏移（前两帧、边界、后一/二/四帧），底部200px裁切，视频范围外明确留空。实际查看全部20条组成的5张联系图，所查帧未见高亮串至后句、退出残留或文字裁切；NIOSH尾句到片尾，不能证明退出后的画面。并未覆盖所有后续句子的入场过程或完整画面，也未进行连续观片/试听。

Downloads/inline-keyword-caption-20260929已更新boundary-inspection和comparison.html，补充保存版验证与边界证据；未重导出、未写正式分数、未改候选版本。git diff --check通过，整体目标继续。

### 句内强调的中英文与双画幅排版预览（2026-09-29）

上一轮保存计划一致性及20边界抽查属于progress。本轮用当前保存候选v1实际浏览器原生预览，检查短句/长中文/长英文×横/竖两画幅，共6组。所有预览为6秒合成时间，不伪装实测配音。横屏使用scale1、captionWidth.84、centerY.9；竖屏显式使用scale1.6、captionWidth.9、centerY.88，保持源样式不变。

verify-inline-caption-formats.mjs逐组等待新preview generation和可见画布再截取，避免抓到前一文案帧。实际查看六张画布截图：所选重点词正确显示青色，长中/英文两行，所查帧未见裁切。竖屏仅证明这些合成文案在此显式应用配置下的排版，不证明真人遮挡或实时可读性；没有声音和连续播放验收。

库前后完整相等，无pageerror。Downloads/inline-caption-formats-20260929含六PNG、每组原生请求/回执、verification.json及comparison.html，附可打开的两画幅应用链接（打开后选择相应试文案）。git diff --check通过；无新增正式分数/导出或保存版本，整体目标继续。

### 句内强调保存版本的实际导出证据（2026-09-29）

上一轮中英文双画幅预览属于progress。本轮用库中style-caption-inline-cyan-candidate-20260929 v1重新prepare application，生产图仅替换ID，完整样式、时机、资源和编排保持原生投影。批次production-caff6d35570d8018372efdc250a2d820 attempt1 succeeded，三成片published，未修改源样式或参考工程。samples沿用同三实测输入与标注。

verify-inline-caption-saved.py验证三SHA及解码/音轨技术检查，并通过ffmpeg framemd5逐帧比较本次保存版与前次试验版：1048帧（含时序信息）完全一致；解码为PCM的音频SHA也全部一致。该证据只证明复用效果等价，不构成真人连续观片或试听。保存版现在有自身生产身份和三份完整证据，后续正式评分仍须按评审协议完成实际检查。

Downloads/inline-caption-saved-20260929包含保存asset/application、生产请求/回执/项、三视频、verification.json和review.html；新增produce-inline-caption-saved.mjs与verify-inline-caption-saved.py可复现。已询问用户偏好句内高亮、独立花字或按内容选择，暂未收到答复，不以沉默代替审美认可。git diff --check通过；未新增质量分数，整体目标继续。

### AI工具的正交时序说明修正（2026-09-29）

上一轮保存版本三成片与1048帧等价验证属于progress。本轮审查MCP发现edit_dynamic_asset_layers说明仍错误宣称切换binding会选默认anchor，与已完成的Rust保留时序实现矛盾。修正为保留anchor/endAnchor/offset及duration limits/motion，区分创建默认与编辑；补充独立结束选项、关联约束、时长截断，以及keyword整句高亮/active_word逐词的区别。模板生产文档同步示例，不新增业务代码。

verify-mcp-orthogonal-timing.mjs通过真实注册的MCP处理器调用当前Rust服务（非mock），读取schema包含endAnchor，创建未保存草稿并设置自定义semantic_start/semantic_end/.1偏移/1.75上限，依次改sentence/literal/keyword，逐次核对完整timing/motions/motionTiming不变并原生预览成功；库前后完整相等，未保存测试资产。证据Downloads/mcp-orthogonal-timing-20260929/verification.json。现有MCP传输测试通过，git diff --check通过。工具说明已改源码，既有客户端若缓存工具目录需重新连接才能获得新说明；未重启用户会话。未增加评分/试听，整体目标继续。

### 样式编辑预览的独立查看比例（2026-09-29）

上一轮仅澄清模板与时间轴边界，未改变状态，记为no progress；本轮从当前源码重新确认尚未完成的预览缩放实现并完成验证。EffectPreview增加编辑时可用的适应面板/100%/200%查看比例，仅改变显示容器，放大时内部滚动并定位到选中区域；不写入定义、原生预览参数或导出。选中和拖动继续使用现有原生坐标转换。

首轮真实Chrome验证发现橙色缩放控制点随画布一起变大、遮挡文字，随后用ResizeObserver按SVG显示尺寸保持12 CSS像素直径。复测桌面和390px移动视口截图并实际查看，控制点不再遮住大段文字；移动端200%仅显示画布局部，可内部滚动，无页面横向溢出。

新增verify-preview-view-zoom.mjs：候选style-caption-inline-cyan-candidate-20260929 v1，查看比例切换后1280/2560 CSS像素宽符合预期，原始1280×720位图及generation不变且没有未保存修改；200%拖动40 CSS像素，真实Rust layers回执收到20场景像素位移，timing/motions/motionTiming/styles逐字段保持；缩放控制点键盘操作成功调用scale_in_frame；撤销恢复原位图；适应面板下控制点仍12像素。库前后完整相等，无pageerror，未保存测试改动。证据Downloads/preview-view-zoom-20260929含verification.json、move.json和桌面/移动截图。

Web tsc和git diff --check通过。本轮仅验证样式编辑可用性，不新增审美分数、连续播放或试听证据；整体目标仍未完成。

### 当前图层的内容与时机摘要（2026-09-29）

上一轮独立查看比例及浏览器操作验证属于progress。本轮重新检查主线和当前规则面板，发现外观页只展示内容来源，而独立的开始/结束、偏移和时长限制需要切换面板才能看全。增加只读StyleRuleSummary，放在当前图层选择器下，所有属性页都可见；使用当前草稿timingEdits/durationEdits，提供直接进入应用规则的按钮。开始和结束选项与摘要共用UI标签映射；Rust执行契约不变。删除外观页重复的内容来源说明，避免重复堆叠。

实际Chrome修改当前候选草稿为semantic_start/semantic_end、提前0.1秒、上限1.8秒，回到外观页确认摘要同步；390px截图无横向溢出，实际查看桌面和移动截图。首次撤销断言立即读取，早于React状态同步，检查失败；改为等待摘要恢复原始文本后完整重跑通过。库前后完整相等，无pageerror，没有保存临时规则或修改参考工程。证据Downloads/style-rule-summary-20260929/verification.json及两截图。Web tsc、git diff --check通过。

本轮是内容绑定和时间独立性的界面可理解性改进，不代表真实声音调度的新覆盖，也没有新增导出、视觉评分或试听。独立样式的整体质量和场景适配仍需继续验证。

### 句内字幕的逐句阅读检查与原生诊断定位（2026-09-29）

上一轮规则摘要及浏览器验证属于progress。本轮回到已保存候选v1的三份实际导出，生成17句稳定帧底部200px裁切联系图，实际查看全部3张。所查帧未见文字裁切；最长句为两行，其余单行。按实际编译元素时长统计，字符率范围约10.8–34.0/秒；teaching assistant句显示2.12–3.12秒，共1秒，是需进一步复查的快速句。没有据此设定通用通过阈值，也没有改词时间或以静帧冒充连续播放。证据Downloads/inline-caption-readability-20260929/readability.json及17帧/3联系图；脚本review-caption-readability.py。

原生已有reading_speed_exceeds_limit诊断，界面此前只有合并后的句号编号。为便于实际检查，三个预览路径透传编译plan.captions；Web增加逐句原文/起止时间与定位按钮，点击暂停并将画面、原声音频定位到句首，滚动画布入视野。诊断和时间依然由Rust提供；独立花字可能在句内稍后出现，未将字幕时间解释为所有元素的时间。

Rust现有实测预览测试扩展验证captions与samples/validate计划逐字段一致，通过；Rust构建与Web类型检查通过。确认没有运行中的生产和素材任务后更新本地服务；首次nohup启动未保留进程，随即检查端口为空并改为前台持久exec会话22644启动成功，state恢复200，没有因观测超时重建生产任务。

verify-caption-diagnostic-seek.mjs实际调用当前服务核对三份17句与计划一致，真实Chrome导入既有三份实拍内容并选择第三份，点击2.12–3.12秒问题句后预览进度为2.12、音频暂停且currentTime对齐。桌面/390px两截图实际查看，移动端长文字换行且无页面横向溢出，库前后完整相等，无pageerror。合成示例另外验证caption区间有效且synthetic_example来源未变。证据同目录diagnostic-verification.json及两截图；git diff --check通过。

未新生成MP4、未保存样式或参考工程、未提交新评分；尚无连续观片及试听验收，整体目标继续。

### 共享高亮的继承显示与编辑闭环（2026-09-29）

上一轮17句阅读检查和原生诊断定位属于progress。本轮检查高亮组合契约：同一文字目前只允许一个启用的高亮，已有原生验证明确拒绝冲突，没有静默合并。进一步发现真实界面缺口：activeHighlight只查直接绑定，分组共享高亮虽然渲染生效，选中后代文字却显示无高亮，编辑时被Rust拒绝。

修复UI按当前图层祖先查找启用的共享高亮，显示来源及“影响所有引用图层”说明，沿用高亮方式/颜色控件编辑。新增Rust highlight_treatment原子草稿操作，要求指定图层确实引用该已有高亮，修改共享操作或显式清除所有引用，保留全部图层的内容/时间/动效，最终原生验证所有目标；AI工具说明及生产文档同步。继承启用时内容来源控件禁用并提供解释；已禁用的分组高亮不再错误阻止独立编辑。

原生测试验证双层共享改模式、完整layers/applications不变、无关目标拒绝、任一成员不兼容active_word时拒绝、清除及禁用后的独立编辑。真实Chrome通过verify-shared-highlight-editor.mjs检查继承显示、两层同步、保存刷新、共享清除/撤销和390px无溢出，实际查看mobile截图；测试样式dynamic-5f63382b-fa17-4e96-99bd-92aaa2affff6 v2已归档，旧库逐项保持不变，无pageerror。证据Downloads/shared-highlight-editor-20260929/verification.json、fixture.json及mobile.png。

Web类型检查、Rust测试/构建、10项MCP传输测试、git diff --check通过。确认无进行中任务后更新服务，当前exec会话68834；最后通过真实API再次验证禁用继承不阻止独立高亮，未保存该请求。没有修改参考工程、没有新增视觉评分或试听；整体目标继续。

### 高亮文字独立描边的面板闭环（2026-09-29）

上一轮共享高亮编辑闭环属于progress。本轮检查重点词外观属性，原生已有stroke颜色/宽度但面板只开放高亮填色。补齐单独描边开关、颜色和0–30画布像素宽度，直接绑定走text_presentation，继承走highlight_treatment，关闭后清除局部stroke并沿用普通文字描边；不改模型、声音时间或源样式。

扩展verify-shared-highlight-editor.mjs验证双色双层共享高亮：描边设为#ff3366/4.5，两层原生预览均有对应params，完整layers与styles保持；保存刷新保留，取消描边后高亮仍在、普通描边宽度保持，撤销恢复。首次check/uncheck调用在异步回执前断言浏览器勾选状态，测试中断；改为click后等实际原生回执，复用该测试资产重新验证，无重复新建。样式dynamic-5097476b-e100-4963-9de1-114700d9ee60 v4已归档。新证据独立保存Downloads/shared-highlight-stroke-editor-20260929；旧shared-highlight-editor目录本轮首次运行覆盖了fixture/mobile文件，旧verification记录不用于本轮验收。

另在既有句内青色候选上做未保存的直接绑定验证，确认调用text_presentation，layers/styles不变、画布像素发生可见变化，撤销后与原位图完全一致，服务端定义前后相等。实际查看direct-stroke.png及390px mobile.png，重点字有单独红描边、其他文字未使用该局部描边，移动面板无横向溢出。验证结果见verification.json和direct-verification.json，均无pageerror。Web类型检查、git diff --check通过。

本轮红色是验证控件效果的测试参数，不是新正式设计或审美推荐；未保存到实际候选、未生成MP4、未新增评分/试听，整体目标继续。

### 粗高亮描边的排版空间修复（2026-09-29）

上一轮高亮描边控件及双路径验证属于progress。本轮检查编译器发现仅普通strokeWidth参与text.maxWidth/maxHeight与左右锚点计算；更粗的局部高亮描边未预留空间。Rust compiler现对启用且命中该文字的高亮（直接/共享）取max(普通描边,高亮描边)，统一用于文字预算与左右对齐锚点，整个实例固定，避免逐词变化引起换行抖动。额外描边使区域无剩余空间时拒绝，前端翻译为减小描边或增大布局的提示。普通描边params、作者字号、布局框和时间模型不变；有粗局部描边的长句后续重编译可能重新适配，不能声称输出像素保持旧版。

新增原生测试覆盖直接/共享×左中右对齐、禁用高亮后恢复普通预算、无逐帧预算动画及过窄区域拒绝。首次测试错误修改styles[0]而非caption引用的styleId，导致对齐断言失败；修正fixture选择后整套templates测试212通过、1项既有忽略。Rust构建通过，确认无活动任务后服务更新到exec会话14849。

verify-highlight-outline-layout.mjs在真实Chrome中临时将句内候选描边改为红色12px，分别渲染6秒合成长中文和长英文，验证原生宽高预算减24、普通描边仍3，逐像素检测红色描边在原布局边界内；切为active_word保持相同预算。实际查看两张原生canvas位图，均两行未见裁切；粗红描边仅为边界压力参数，不是审美推荐。撤销后源库前后完整相等，无pageerror。证据Downloads/highlight-outline-layout-20260929/verification.json和zh/en.png。文字选中框仍按现有明确约定不含描边/阴影，未另改选中语义。

误在仓库根执行tsc使用了不适用的跨项目配置；随后在apps/web按项目配置检查通过，git diff --check通过。未生成新成片或保存实际候选、未新增审美分数/连续播放/试听证据；整体目标仍未完成。

### 保存版字幕的三实拍竖屏输出验证（2026-09-29）

上一轮粗高亮描边排版修复属于progress。本轮用句内青色候选v1原生application生成720×1280方案：原横屏完整放在x0/y320/720×405区域，字幕scale1.6、captionWidth.9、centerY.63，放在画面下方。原生投影仅替换生产模板ID，沿用同三份实测输入、17字幕段和重点词，未修改样式、参考工程或原词时间。此为横片保留构图的竖屏输出，明确不是原生竖屏素材。

produce-inline-caption-portrait.mjs提交production-a0ab31ad02b6a14f4b45695668300c14，持续观察同一批次，attempt1 succeeded、3视频published。verify-inline-caption-portrait.py逐一核对SHA、解码和音轨技术检查，所有词、字幕原文/词范围/起止时间与此前横屏保存版相等，解码PCM SHA完全一致，source crop四边为0且缩放无裁切放大。输出均720×1280。

抽取全部17字幕段中点，实际查看3张字幕联系图和每份各1张完整帧。所查帧未见字幕裁切，最长句两行，人物与字幕区域分离；上下留白明显，不能据此声称竖屏构图精致或达到90分。原先1秒快速句仍1秒，没有用延长时间伪装解决阅读压力。未连续播放、未试听。

Downloads/inline-caption-portrait-20260929包含三MP4、application/asset/生产记录、17帧和验证JSON。review.html提供三组横/竖对照与同一应用方案的工作台链接；真实Chrome确认6个视频元数据均加载、链接请求返回的完整原生模板（仅归一生产ID）与导出模板相等，试映画布就绪。已请求在Codex打开对照页，工具返回queued，不宣称用户已看到。服务回读候选定义与生产前完整相等，git diff --check通过。整体质量验收继续。

### 竖屏背景应用与样式分离验证（2026-09-29）

上一个仅解释产品边界的回复属于no progress；本轮复核当前工作树和上一轮会话97304，收到终态PASS，继续完成尚未交付的背景应用验证。Rust Application新增可选blurredBackground，true投影为已有BlurredFill；省略/false保留既有布局。Web试映开关、URL/会话恢复、评审回读及AI工具说明同步。样式保存不包含该应用参数。

生产批次production-0184d8b85d5e0be02d4088e1cc646c84已有3份竖屏输出；verification.json记录17句字幕/词时间与横屏保存版一致、解码PCM一致、前景无裁切。实际查看三份代表完整帧及更新后的390px移动截图：字幕未见裁切、原画面完整，移动标签与开关正常并无横向溢出；模糊背景仍有抢眼的大色块，不据此认定视觉质量达标。

ui-verification.json验证切换仅改变布局模式，刷新恢复同一原生应用，单前景/单背景/单音轨，关闭恢复原方案，样式库前后相等。本轮制作Downloads/inline-caption-portrait-blur-20260929/review.html，提供三组黑底/模糊底对照、逐句联系图和精确工作台链接；真实Chrome验证6个720×1280视频元数据可加载、链接返回模板与生产模板完整相等（仅归一生产ID）、实时画布就绪，且候选定义与生产前asset.json完整相等。证据review-verification.json。

本轮Web项目tsc通过；连续观看和试听尚未完成，未新增质量分数，横屏素材竖屏输出不冒充原生竖屏素材验收。未修改参考工程。整体目标继续，背景适配改善不能替代重点词/花字样式的质量与可编辑性验收。

### 共享外观的影响范围与单层独立编辑（2026-09-29）

上一轮背景应用对照及精确链接验证属于progress。本轮回到样式创作，发现多个文字图层共享styleId时面板无影响范围提示，也没有只改当前层的入口。新增Rust detach_style原子操作：复制当前草稿视觉值并只替换该层styleId；已经独立则无变化，组/无样式/未知层拒绝。内容、时间、动效和高亮关系不变。Web外观页显示共享层清单及“仅为当前图层独立外观”；AI工具说明和生产契约同步。

54项dynamic_asset原生测试、10项MCP传输测试、Web类型检查和Rust构建通过。确认素材及生产任务均无running/queued后重启服务，当前exec会话54763。verify-independent-visual-style.mjs实际Chrome创建双层共享测试资产dynamic-5331a804-ed8e-453b-8bdc-d6f17a187b0f：未保存字号58先同步两层，独立操作复制该草稿值，再只改第二层为42；保存v2、刷新和撤销恢复42，原图层内容/时间/动效/高亮关系保持。移动390px无溢出，共享提示截图实际查看；验证资产已归档，既有库逐项保持不变，无pageerror。

首次桌面截图捕获到预览更新阶段，已改脚本等待更新结束，并只读重开已保存同一资产重取截图，实际查看双层文字及属性。补充渲染验证初次误读取text.fontSize导致undefined断言失败；按实际compiler的fontSize（90px高归一单位）换算回画布像素，确认两层分别42/58，保存定义无变化。证据Downloads/independent-visual-style-20260929含fixture、verification、render-verification及桌面/移动截图。git diff --check通过。

本轮闭环的是外观共享与独立编辑，不涉及新增设计评分、真实声音导出或试听，整体质量目标仍未完成。

### 句内字幕细描边候选的三实拍对照（2026-09-29）

上一轮单层独立外观实现及浏览器保存验证属于progress。本轮回到实际样式质感，读取当前原生schema、源样式和既有三份输入；原style-caption-inline-cyan-candidate-20260929 v1与旧记录相等。新建独立style-caption-inline-fine-candidate-20260929 v1，仅将40px字号下的描边3→1.4、阴影blur4→3/opacity.7→.65/y2→1.5，内容、布局、时间、动效与重点词不变。它是细化候选，不作为新增设计家族凑20款。

produce-inline-caption-fine.mjs使用保存版本原生Application生成production-b8fb464f2dae6b809435063543902bb9；同一批次attempt1 succeeded、3视频published。review-inline-caption-fine.py核对SHA/解码/音轨技术检查、解码PCM与旧版完全一致、17句字幕和词时间一致；逐元素归一生成身份后，仅描边/阴影及由描边导出的文字预算变化，其余内容/参数/动画/时间相等。

实际查看7张逐句联系图（17组新旧帧）、3张代表句的入场/结束序列及采访中1张全幅。细描边减少黑边厚重感，在暗背景上更干净；花纹衣服上文字与背景的分离也有所减弱，不能直接认定整体更优。代表序列未见结束后残留，但不是连续观片。1秒快速句仍保持原时长。保留候选，不替换原版，不新增评分。

Downloads/inline-caption-fine-20260929保存三片、原生定义/应用/生产记录、逐句和边界图、verification.json、visual-inspection.json。review.html提供同一播放位置原版/候选切换和工作台链接。verify-inline-caption-fine-review.mjs真实Chrome验证6个视频版本加载、切换保留1秒位置、试映链接完整原生模板等于导出模板（只归一生产ID），编辑页显示描边1.4，原样式定义不变，无pageerror。证据ui-verification.json。

尚无连续观看、试听、原生竖屏及中文实拍验收，本轮不授予90分或宣称整体完成。

### 文字底板圆角闭环与轻底板实拍候选（2026-09-29）

上一轮细描边成片和17句对照属于progress。本轮针对花纹背景的分离度问题检查文字底板，发现共享渲染器已有background.cornerRadius，但Rust样式及工作台无入口。补齐可选backgroundCornerRadius（0–100，短边一半的百分比）、原生范围校验和编译映射、独立样式与组合模板的面板滑杆。比例不随跨画布缩放变化；省略字段时不新增编译参数。没有新增特定字幕专用渲染器或动画通道。

原生测试首轮未归一template.requestHash，因合法设计变化使请求哈希变化而断言失败；明确验证哈希不同后仅归一该身份字段，比较剩余参数/时间。最终templates测试214通过、1既有ignored，跨画布用例确认圆角35保持比例，Web类型检查与Rust构建通过。确认无活动素材/生产任务后重启；第一次立即请求早于服务就绪返回未连接，尚未保存或提交生产；state200后继续，当前exec会话16213。

verify-text-background-radius.mjs在新建的独立验收样式上通过真实Chrome：35→100预览参数与位图变化，文字alpha1/底板alpha.38保持；保存刷新100，改0后撤销恢复100，完整定义除版本/圆角外相同，390px无横向溢出。实际查看移动截图及圆角位图。验收资产已归档，既有样式逐项保持，证据Downloads/text-background-radius-20260929。

新建style-caption-inline-soft-panel-candidate-20260929 v1，从细描边版只增加#111820底板、opacity.38、padding10/4px、圆角35%。批次production-a7dc8fa8859fe2bb397d7b030ce1a085 attempt1成功，3片published；17句词/字幕时间、非底板参数/动作保持，解码PCM与细描边版一致。实际查看全部7张联系图和两张全幅：花纹衣服上的分离度提升，最长两行无所见裁切；底板仍是可见色块，在暗背景上收益较小，因此保留为可选候选，不替换原版，不算新增设计家族。

Downloads/inline-caption-soft-panel-20260929含3片、定义/应用/批次证据、逐句对照与review.html。真实Chrome验证六视频版本加载、同时间切换、工作台应用返回模板与导出完全相等（只归一生产ID）、编辑页圆角35可见、源细描边定义不变，无pageerror。git diff --check通过。未完成连续观片/试听、中文实拍及原生竖屏验收，未评分，整体目标继续。

### 三版句内字幕的中英文与三画幅适配检查（2026-09-29）

上一轮圆角模型/面板与三实拍导出属于progress。本轮补充原版、细描边、轻底板三个保存v1的跨文案检查；verify-caption-style-formats.mjs使用真实Chrome和Rust application-preview，在1280×720、720×1280、720×720下分别切换短中文、长中文、长英文，共27个6秒模拟预览。短句/长句文本来自工作台既有例句，不伪造实测TTS。三个画幅应用参数及请求完整存入verification.json。

27次画布都有可见文字像素，未触及画布边缘；实际查看三个完整联系图涵盖全部27项，短中文保持一行，长中文/长英文保持两行，所查字符串未见缺字、孤立标点行和文字裁切。轻底板跟随单/双行文字块，三个画幅均保留35圆角比例。像素边界检查不是完整文字识别或所有文案的正确性证明；仅针对所查三条文本和这组应用参数。既有样式库完整保持不变，无pageerror。

证据Downloads/caption-style-formats-20260929包括27份原始画布、三联系图、27字幕区域裁切、完整请求/编译回执、visual-inspection.json。review.html提供画幅/文案筛选、原始画布及对应工作台链接。真实Chrome验证9组筛选下27图加载、应用画幅链接正确、390px无横向溢出，证据review-verification.json。

本轮只补充模拟文案与画幅覆盖，未修改样式、未新增成片或评分；黑底预览不能替代中文实拍、真实声音时间、连续动效和试听，整体目标继续。

### 中文实测配音的双语速适配与同排修正（2026-09-29）

上一轮27个模拟文案/画幅检查属于progress。本轮读取素材库，复用已存在中文TTS音频input-13abb8663d29612eaf185d0421c9d0ab（语速230，7.879456秒）、input-386837c22e5f1b30594f91a2c997c952（语速140，10.706395秒）及input-ac789371639a22936895cbebf224de23（26秒长协作旁白）。三者为macos-nsspeech-v1音频，faster-whisper实测转写revision2；不是中文真人视频、不是本轮新生成语音，也未外传素材。前两份同稿37词但时间不同，第三份91词，语义四段与字幕八段分别标注。

细描边和轻底板保存v1按同一720×1280应用生成批次production-89d3c9a603306e7aeb72a78eee3cd479，attempt1成功、两项各3片published。verify-caption-measured-chinese.py验证六片SHA/解码/音轨、原词文本/起止不变、字幕区间严格来自所选词范围、全部入场关键帧固定16800ticks（0.14秒）、每片一个音轨、同音频两样式的解码PCM一致。同一句“先讲案例”在快版0.74秒、慢版1.02秒，样式入场未随语速拉长。

实际查看7张联系图覆盖18组两样式对照，发现长旁白“完成时间”在两行间拆开。用既有内容字段layoutPhrases标注词35–37，保持声音/字幕/样式不变，只重渲染受影响的长音频：production-aa91c3c6b9273df53d4479706d7db4ab attempt1成功、两项各1片。verify-measured-chinese-phrase.py核对只新增静态短语元数据（生成身份归一）、原词/字幕/参数/动作相同、PCM与修正前一致；实际查看两张修正前后图，完成时间已同排。未把内容排版修正写入可复用视觉样式。

主证据Downloads/caption-measured-chinese-20260929，修正证据同名-phrase目录。review.html提供两种语速的实际字幕区间表及六个最终播放入口（前四片初始批次，最后两片修正批次），明确批次不同、并非一个新六片批次；包含可导入的agent-content.json。verify-measured-chinese-review.mjs真实Chrome验证六片元数据、两个工作台链接原生模板与生产方案相等（只归一生产ID）、重新导入三份实测内容后长旁白预览含完成时间同排元数据和8字幕段，样式库完整不变，无pageerror。git diff --check通过。

本轮验证中文真实配音及实测时间，未连续观片或试听；纯音频黑底不构成中文实拍适配，未新增审美评分，整体目标继续。

### 中文内容跨样式版本的完整试映往返（2026-09-29）

上一轮仅解释模板/时间轴边界，属于no progress。本轮检查当前源码和服务state200后，新增verify-chinese-style-revision-roundtrip.mjs，使用轻底板样式的独立验收副本，在真实Chrome完成：导入既有三份中文实测配音内容→返回样式工作台→字号40改42→保存并试映v2→刷新恢复。未操作参考工程或覆盖已有设计。

验证保存定义仅版本与字号改变；portrait/full/scale1.6/center(.5,.88)/captionWidth.9全部保留；三份内容完整自动暂存快照前后深比较相等（含语义、关键词、字幕分段、转写版本及短语标注）；当前长旁白sample完全相等、8字幕段时间相等、完成时间的text.layoutPhrases仍编译存在。刷新后再次实际调用原生sample-preview并核对sample。390px无横向溢出、无pageerror，既有样式定义逐项相等；成功的两个验收副本均归档。补强整份快照断言后重新完整跑通，未只依赖选中数量。

证据Downloads/chinese-style-revision-roundtrip-20260929包含fixture.json、verification.json、桌面/移动截图。实际查看首轮两张截图：移动端可见恢复字幕；桌面截图仅显示控制区和部分画布，不作为完整视觉质检证据。git diff --check通过。本轮新增端到端验证和记录，未改业务实现、未新增成片、未连续观片或试听，也未授予审美分数；20款独立高质量样式目标仍未完成。

### 试映页桌面布局作用域修复（2026-09-29）

上一轮中文内容换版往返验证属于progress。本轮从截图中控件挤走预览的问题追查当前CSS；真实Chrome测得1440px下controls y198、宽1400，preview y735，原因是桌面规则.tw-effect-workbench .tw-dynamic-meta为所有后代设置grid-column:1/-1、grid-row:1，误命中试映布局fieldset。把该规则限定为.tw-dynamic-detail的直接元数据子元素，不改业务或媒体。

修复后1440px preview和controls均y198，左右排列（x20/732）；1024px仍左右排列（x20/524）；390px仍预览在前、控件在后，三宽度无水平溢出。实际查看1440px修复截图，可见左侧字幕画布与右侧位置/大小控件同时出现。另只读打开原样式编辑面板，确认元数据仍grid-column1/-1、grid-row1，无溢出。git diff --check通过。

证据Downloads/trial-preview-layout-20260929含前后各三宽度截图与矩形/computed-style记录、editor-check.json。此为UI作用域修正，未新增专项单元测试、未修改既有样式或参考工程、不作为成片审美或连续试听验收。整体目标继续。

### 新建样式语义角色与表现用途解耦（2026-09-29）

上一轮桌面CSS修复属于progress。本轮核查四类创建入口及Rust默认值，发现keyword/decorative_text通过subtitle种子创建，改变了binding却仍继承features.role=subtitle。新建重点词改为emphasis，字幕保持subtitle，装饰保持decoration；花字的语义角色设为None，因为花字属于表现形式，可以承担标题、批注等不同角色。仅改变创建默认值，不把用途分类与角色建立持续联动，不改既有库定义。

新增原生回归用例验证四类投影的语义角色，并确认组合/改写purposes不会改写角色。动态资产相关55项通过；扩大到模板模块215通过、1既有ignored；Rust二进制构建通过。第一次命令误用包名footage未执行测试，改用实际moirai-footage后通过。检查state最近200任务均succeeded及最新生产状态后重启本地服务，当前会话90937。

verify-new-style-semantic-roles.mjs调用当前服务四次create与preview，逐项核对role/binding/anchor，每类均产生叠加元素；所有定义仅为未保存草稿，样式库前后严格相等。证据Downloads/new-style-semantic-roles-20260929包含四类定义/编译预览及verification.json。git diff --check通过。本轮是模型语义纠错，不是新增视觉设计或90分评审；未连续观片/试听，整体目标继续。

### 语义角色的人与AI编辑闭环（2026-09-29）

上一轮创建语义默认值修复属于progress。本轮确认独立样式工作台没有角色编辑入口，补充Rust semantic_role(layerId,role|null)原子操作及应用规则面板“图层语义角色”；角色中文标签复用ontology的同一映射。操作只改features.role，拒绝容器/不存在图层/无效Role；MCP工具说明同步，使人和AI使用同一契约。没有把角色变更与样式用途、内容、调度或动效联动。

原生回归深比较完整定义，验证副本图层角色设置/清空时只有所选字段变化；动态资产56项通过，Web完整类型检查与MCP工作台10项通过，Rust构建通过。state最近200任务全succeeded后更新服务，当前exec会话1942。

verify-style-role-editor.mjs真实Chrome使用独立新建验收样式：默认emphasis→callout，仅role变化；保存v2/刷新；清空未保存→撤销恢复callout；再次清空保存v3/刷新保持null。全过程完整定义核对确认其他字段/内容绑定/时间/动效保持，390px无横向溢出，无pageerror，既有资产逐项相等，验收资产归档。实际查看桌面/移动面板截图，角色入口可见；桌面截图捕获预览更新中，不作为视觉成片证据。证据Downloads/style-role-editor-20260929。git diff --check通过。

本轮闭环的是可编辑模型属性，不是新的美术样式或审美验收；20款≥90目标仍未完成。

### 阅读底签/侧标当前版文案适配与英文同排修正（2026-09-29）

上一轮语义角色编辑闭环属于progress。本轮先读取库发现早期筛查文档已经过时：adaptive为奶油底签v5，marker为珊瑚侧标v4，已不是相似荧光矩形。保留实际保存版，只读检查“信任”、17字“把负责人完成时间和需要的支持写下来”、英文“clear next steps”，用review-active-style-gallery.mjs按各自事件中点取得6张720方形原生渲染图，实际全部查看。短中文一行、长中文两行且无所见裁字/角标碰字；英文底签一行，侧标将next steps拆到两行。

扩展取样脚本的EXAMPLE_LAYOUT_PHRASES可选参数，通过工作台现有起止词选择与“预览同排”按钮实际设置第4–5词同排（原句Agree on clear next steps，wordSpan3..5）。两样式重取帧并实际查看：侧标变为clear / next steps，角标保持在文字左侧；底签保持一行。原生实例内容/start/duration相等，动画仅归一随机key id后相等；每次取样均确认样式库前后严格相等。没有把这句英文的内容提示写进通用样式，也没有新建风格凑数。

证据Downloads/marker-adaptive-coverage-20260929包含4组8帧、原生preview、版本/事件manifest、inspection.json及review.html。Chrome验证8图加载与390px无横向溢出。对照页明确是黑底模拟文案静态检查；没有实拍导出、连续播放、试听或评分。早期style-gallery-findings文档加历史版本提示，避免反复按旧问题修改现版。整体目标继续。

### 用户校正：阅读批注统一左对齐（2026-09-29）

上一轮同排检查属于progress。本轮原先开始补看adaptive v5真实视频序列，已确认保存版等于当时导出源，并查看0-0/0-1/0-2、1-0/1-1/1-2/1-3、2-0共8张逐帧联系图：文字稳定、退场无所见残留，太阳画面仍被底签遮挡。随后用户明确指出这类文字应左对齐，优先按此修订，不再将旧版序列作为新版验收。

align-reading-styles-left.mjs以最新保存版CAS写入：marker v4→v5、adaptive v5→v6，完整定义深比较仅headline样式textAlign=center→left及revision变化，原始定义备份。没有改颜色、字号、区域、动作、内容或声音时机。当前旧审美记录不能覆盖新版本。

使用真实Chrome与Rust预览重新生成短中文、多行中文、英文同排三组共六帧并全部实际查看：多行起点一致、珊瑚角标未碰字；短词也固定到原文字区域左缘，非仅改第二行缩进。英文仍保留next steps同排提示。每轮取样确认库保持本轮保存状态。证据Downloads/reading-left-align-20260929包含前后保存定义、六新帧/原生回执与12图对照review.html；Chrome验证12图加载和390px无溢出，已请求在Codex打开。尚未重新导出新版本的真实视频，不继承旧版实拍评审或授予90分，整体目标继续。

### 左对齐版的七份真实声音输出与30处对照（2026-09-29）

上一轮用户要求的左对齐保存与六帧验证属于progress。本轮export-reading-left-align.mjs读取当前marker v5/adaptive v6，分别复用原r4/r5应用及对应三/四份样例，不改变内容或布局参数。两批production-d82f6130645d7401b8b60fb85d4d85ea（adaptive四片）、production-869436610aa370f1e3b1f0c6fd6cfd1a（marker三片）均succeeded。共五份实拍输出、两份中文纯音频输出（同一中文音频分别应用两样式），不是七份实拍。

check-reading-left-align.mjs核验七片SHA/解码/音轨检查、输入除template外完全相同、30处headline及附属图层内容/起止相等、解码PCM与各自前版一致。初次动画深比较遇到JSON往返的-0/0差别，归一零；第二次遇到左对齐导致positionX绝对值平移，改为逐关键帧验证差值为同一常数（允许1e-7误差），再比较其余完整动画结构。仅允许x/y常量平移，时长、缓动、handle和非位置通道保持，不能据此声称绝对位置未变化。

实际查看七张全幅前后联系图，覆盖30个重点词中点：固定左边缘比按词长居中更稳定，双行左起点一致，所查帧未见裁字或侧标碰字。仍存在adaptive遮太阳背景、marker在原下方位置压衣服/部分手势；本轮为对齐前后验证保留相同应用，不将其误报为遮挡问题已解决。尚未完成新版连续观片或试听，不授予审美分数。

证据Downloads/reading-left-align-real-20260929含七片、各批原生定义/应用/内容/生产回执、30个原始中点帧、七联系图、verification.json和visual-inspection.json。review.html有七播放器同时间切换新旧版本及完整应用链接。verify-reading-left-review.mjs真实Chrome验证14个视频版本加载、切换保留1秒位置、两工作台链接原生模板等于生产模板（仅归一生产ID）、390px无横向溢出、无pageerror。整体目标继续。

### 左对齐样式的应用留白复核（2026-09-29）

保持marker v5/adaptive v6的已保存左对齐定义，应用位置独立调整。marker采用scale .72、centerX .22、centerY .18；adaptive太阳样例先试centerX .78，抽样发现靠近头部，保留该候选至adaptive-initial-078，再改为scale .65、centerX .82、centerY .18。最终批次production-2cca7c5ec613fe40397637f31831da49与production-47616c8e68418c0b4475155f1b88c68c均成功。

证据Downloads/reading-clearspace-20260929：四输出（三实拍、一中文纯音频），18个重点词中点前后对照；查看三实拍每秒2帧序列，所查帧未见文字压人脸、手势或太阳示意。check-reading-left-align验证SHA/解码/音频检查、内容时间与PCM一致；动画仅允许位置常量平移，其他结构相同。review页面八个新旧视频版本加载、同时间切换、两精确应用链接原生模板及390px布局验证通过，git diff --check通过。此次为人工选择应用位置，不是自动场景避让；没有连续观片或试听，不授予90分，整体20款目标仍未完成。

### 双层花字长中文两行适配（2026-09-29）

上一轮左对齐与留白应用验证属于progress。本轮读取当前offset r4，并通过实际工作台预览17字“把负责人完成时间和需要的支持写下来”：单行缩字明显，偏移色块相对突出。refine-offset-multiline.mjs以CAS保存r5，完整定义比较只允许两个文字样式maxLines从1变2及revision变化；保留备份、幂等重跑核对，不修改字体/色彩/区域/动效/声音时机或参考工程。

实际查看长中文前后、短中文“信任”、英文默认与同排共五帧。长中文两行提高字号，短中文保持单行；英文原断行为clear next / steps，通过内容层wordSpan3..5提示变为clear / next steps，同排未写入通用样式。原生事件时间比较一致，每次工作台取样确认库定义前后不变。此款中心排布的双层花字没有沿用阅读侧标的左对齐变更。

证据Downloads/offset-chinese-20260929含前后定义、五张实际画布、原生预览/manifest、verification.json及review.html。这些是合成时间静态检查，尚未重做r5实拍、连续观片或试听，不授予90分，20款达标目标仍未完成。git diff --check通过。

### 双层花字 v5 三实拍回放验证（2026-09-29）

上一轮保存两行版及五静态帧属于progress。本轮同步author-style-pilot.mjs的花字maxLines=2，防止重新生产恢复旧值。export-offset-multiline.mjs读取当前保存v5，与已备份定义严格相等后投影原1280×720、scale .65、center .5/.85应用，复用v4三份实拍原输入。最初application错误传placement字符串被接口拒绝，改为契约Rect后提交；无重复生产。批次production-9c8e93433d3c925f317941c84acaa5c1成功。

生产模板与旧模板深比较仅maxLines及ID/revision变化。check-offset-multiline.mjs核验三个导出SHA/解码/音频检查、原输入除template完全一致、全部主字及偏移层内容/起止一致、PCM一致，保存版未改变。实际查看11重点词中点前后、三片2fps序列、December与vantage point from space的入场逐30fps及退出边界。长词字号增大、短词保持单行，所查帧没有裁字或退场残留；原下方位置仍遮挡部分手势，未声称已自动避让或摆放合格。

证据Downloads/offset-multiline-real-20260929包含定义/Application/schema/设计/原生生产回执、三MP4、对照/整段抽样/边界图、verification及visual-inspection和review.html。没有连续播放或听感验收，仍无90分结论；20款目标保持未完成。

### 双层花字 v5 应用留白位置（2026-09-29）

上一轮三实拍两行验证属于progress，本轮解决已观察到的下方压手势。保持保存v5及scale .65，采访样例应用center .22/.18，NASA两片 .82/.18。export-offset-clearspace.mjs创建三份独立应用/单样例批次，避免将针对一个场景的位置误套到其他场景。批次47c8801fcd659c8d068d31c1ad3bfc6a、086d18372b8d2735ec309a5ba49e0f76、ec71d9b8ea90696d7bd7430747439312（均production-前缀）全部成功。

check-offset-clearspace.mjs验证三份SHA/解码/音频状态、原输入/内容/时间不变、PCM一致；动画只允许x/y常量平移，其他轨道/关键帧/缓动结构相等；保存样式严格不变。实际查看11处重点词中点及三片全时长2fps联系图，所查画面未见花字遮挡人脸、手势、太阳示意或NASA标志。此为人工按画面留白选择应用位置，不是自动场景避让，也不代表任意输入适用。

证据Downloads/offset-clearspace-20260929保留每份Application/样式/设计/回执/MP4、中点及整段抽样图、verification/visual-inspection。review.html可同时间切换原下方位置与留白位置，包含逐样例精确工作台链接。未连续观片或试听，不授予90分；20款目标继续。

本轮verify-offset-clearspace-review.mjs真实Chrome验证六个新旧视频版本加载、同时间切换保留1秒位置、三条工作台链接投影严格匹配生产模板（仅归一模板ID）、390px无横向溢出及无pageerror；ui-verification.json记录通过，git diff --check通过。

### 双层花字 v5 中文实测声音与同排修正（2026-09-29）

上一轮留白应用调整属于progress。本轮保持v5定义，复用caption-measured-chinese-20260929的三份已测词时间本地TTS：快慢同稿及长旁白，应用1280×720/scale .65/center .5/.5。production-50c2472737f8ab3a503f4ddb96377a28三份成功，属于纯音频黑底，不是中文真人实拍。

check-offset-chinese.mjs核验SHA/解码/音频状态、输入除template完全相同、主字与偏移层14处时间内容一致、每处起止严格对应keyword首尾实测词、PCM与原字幕版本一致、保存样式未变。初次验证把原转写末尾逗号当作显示字符而失败；检查events.rs的Binding::Keyword明确裁剪指定末尾标点后，仅按该已有契约修正预期，时间和实际词数组仍严格比较。

实际查看14处重点词中点发现长串“负责人、完成时间和需要的支持”把完成/时间分到两行。读取实际词索引35=完成、36=时间，用内容layoutPhrases wordSpan35..37修正，仅重做长样例，批次production-c33b3593795a1ecc533a896eae784219成功。回读输入仅允许这一精确新增提示，词时间及PCM再次通过；实际查看修正帧，“完成时间”同排，两层一致。并未改变通用样式或手工延长显示时间。

证据Downloads/offset-chinese-real-20260929及offset-chinese-phrase-20260929含全部原生定义/应用/样例/生产回执、三原输出及一修正输出、15处查看帧、verification，前者review.html展示最终三片及断行前后，agent-content.json提供带同排提示的内容导入。没有连续播放或听感验收，不授予90分，整体目标继续。

### 生产脚本重跑保留人工/Agent已保存样式（2026-09-29）

上一轮中文实测与同排修正属于progress。本轮检查author-style-pilot.mjs发现其每次用早期种子重建相同ID并按当前revision写入，实际会把珊瑚侧标等已调好的外观/左对齐覆盖回旧预设。改为先查保存库；存在则直接投影确切当前版本，只有缺失ID才创建/inspect/以baseRevision0保存。没有在UI复制业务逻辑，原生仍负责保存冲突和应用投影；已有样式需通过显式版本编辑修改。

新增verify-pilot-preserves-library.mjs通过只允许GET与application POST的代理运行真实脚本两次，所有资产写入请求均会被拒绝。两次均成功：caption r3、offset r5、marker r5版本/名称准确复用，只有六次应用POST，全部库定义前后严格相等，两次生成manifest完全相同。证据Downloads/pilot-preserve-library-20260929/verification.json及first/repeat设计文件。不提交成片或新评审，不新增审美分数。node语法检查、git diff --check通过；整体20款达标目标继续。

### 三动态图标短事件检查：定位组透明度缺口（2026-09-29）

上一轮生产脚本保留库版本属于progress。本轮读取clock v1/completion v2/growth v1，在工作台合成0.4–0.8秒关键词窗口取三个中点及每款10个入场/稳定/退场样本，全部实际查看。稳定图形可辨认，柱形底部固定、勾选分段成形、指针围绕轴心；但0.76秒退场时钟和勾选的重叠端帽/轴心/接缝出现亮斑，不能据稳定帧验收。

源码追踪确认：当前图标逐层透明度淡出；独立素材group treatment还会在Definition::project展开成leaf应用，所以仅在现有组上加opacity不能解决。执行层已有ElementGroup composite、relationships::pack与GroupNode离屏合成。缺口是独立素材的显式合成组契约、投影与编辑入口，记录docs/dynamic-asset-group-opacity-findings.md，下一步需接通而不是隐藏淡出或烘焙图标。样式库本轮未改，未授予分数。

review-active-style-gallery.mjs初次取样因aria-busy尚未进入加载态即读回执，报No native preview evidence；修复为导航前注册并等待匹配definition.id的原生preview响应，再取样，删除无用全局响应集合。修复后三款稳定/序列两轮均成功且库严格不变，语法及diff检查通过。证据Downloads/icon-readability-20260929含原生preview、33帧、联系图、inspection及review；无真实声音或连续播放验收。整体目标继续。

### 独立素材显式整组合成：原生、人和AI编辑通路（2026-09-29）

上一轮复现淡出接缝及定位模型缺口属于progress。本轮LayerContent::Group增加可选composite（默认省略/false保留旧逐层语义）；显式开启时投影为原生composite group，group treatment保留组目标。insert对组ID/成员/组效果正确命名隔离，capture保留可复用合成组而继续拒绝普通场景组。原生group_compositing操作仅改标记并验证，不保存。Web容器外观页提供“整组合成”开关，修复原导航禁止容器进入外观页的条件；MCP说明同步。嵌套重叠合成组由原生明确拒绝，不静默降级。预览代表帧递归检查子层及祖先透明度，避免选到不可见子层的透明容器。

验证：模板模块218通过1既有ignored后，新增重叠组与代表帧用例，最终dynamic_asset相关60项通过；Web完整tsc通过；MCP工作台10项通过；Rust构建、diff检查通过。确认服务无活动任务后更新本地服务，当前exec会话38858。

verify-composite-group-editor.mjs使用独立QA副本，将共同退场放到组效果（固定0.4秒合成样例，归一化.85退场）。浏览器先取逐层版0.76秒，再点击开关；完整定义深比较只有root.composite变化。保存v2/刷新回读及390px布局通过，原completion保存版严格不变。初次UI检查发现外观页对容器禁用并修复；复测使用click等待原生回执，避免异步受控checkbox的check瞬时判断误报。最终更新服务后再跑成功，临时验收资产归档。

实际查看前后及移动面板。三个端帽/接缝/笔画像素原先分别224/241/234、184/214/204、224/241/234，合成后均163/170/166；刷新后整幅像素相同。证据Downloads/group-compositing-20260929含前后/保存定义、实际画布、UI和像素验证、review.html。能力桥已实现，但原clock/completion库样式仍未迁移：须保留子层揭示并处理任意声音事件长度下固定秒数退场，尚无真实成片导出/连续观片/试听或90分结论。整体目标继续。


### 整组固定秒数淡出：保存样式与三份声音导出（2026-09-29）

上一轮左对齐回读是状态核对，未产生新改动；本轮重新核对待办并继续整组淡出闭环。确认素材服务无运行任务后启用已构建的新版本，会话58752。通用 motion treatment 支持 motionTiming，与 repeatSeconds 互斥；group_fade 原生操作及容器面板支持入场预留、淡出秒数、应用和移除，短事件按入退场预算共同压缩。

migrate-icon-group-fade.py保留不可变原定义，clock r1→r2、completion r2→r3，只将每个子层退场末值0改为1，开启root composite，添加0.06秒组淡出及0.16/0.18秒入场预算。六组原生投影覆盖0.1/0.4/4秒事件，子层几何、内容、起止和非opacity动画严格保持，原opacity与组×子opacity的最大误差1.11e-16；通过后CAS保存并回读。

verify-fixed-group-fade.mjs实际查看两款各五时刻前后共20帧。入场/稳定帧保持，勾选端帽/接缝亮斑及钟针透底问题消失。独立QA中面板0.06→0.12秒，完整定义只允许该字段变化，保存刷新保留；390px无溢出，实际查看移动面板，无pageerror，成功QA已归档。首轮测试因range传0.47000000000000003失败，改为两位小数后完整通过；原生产样式未被UI测试修改。

三份现有实测中文纯音频、既有人工/Agent语义范围复用，批次production-c4811e38e9385dcaedb08e612a2d0f7f成功。六次时间/完成事件与原词区间一致，11/7可编辑子层均保留；SHA、解码、原内容和PCM比较通过。首次对比历史导出发现两处字幕换行不同，检查模板除组/淡出变更外无差异；再用当前渲染器导出旧模板对照production-09b4575c8ea760e8a50b16f3878a631e（三份成功），六组稳定帧及退场边界联系图全部查看，新旧字幕换行一致，确认历史渲染差异，非本次组变更。

证据Downloads/icon-group-fade-20260929包含迁移前后、六组时间验证、UI回执、工作台实际画布、两批成片回执和六组当前渲染器对照；review.html展示两款对照及三份成片。MCP工作台10通过，原生固定秒数组测试通过，diff检查通过（先前完整模板221通过1ignored、Web tsc通过见前序执行记录）。没有连续观片、试听或实拍构图验收，无90分结论，整体20款达标目标继续。


### 青色侧标 v3：左对齐、短事件停留与句末同排闭环（2026-09-29）

上一轮整组图标修复属于progress。本轮从实时库及历史筛查确认signal r2仍居中、入场.18/退场.10；保存r3为主字左对齐、语义角色emphasis（原误为subtitle）、两层入场.10/退场.06，其余外观/跟随关系/关键帧保留。refine-signal-reading.mjs保留原定义、验证四种原生预览，事件起止不变，0.36秒事件全不透明段.08→.20秒。0.1秒短事件只有一个全不透明关键帧、无稳定段，首次验证误要求两个，改为允许单个峰值且报告零停留，不伪造短词可读性。

工作台查看长中文前后及短词对照，重新加载面板确认左对齐/.10/.06，390px无溢出并实际查看移动截图。author-editorial-styles.mjs发现同类种子重跑覆盖保存版问题，改成只初始化缺失样式、已有版本直接投影；verify-pilot-preserves-library的editorial模式经拒绝所有资产写入的代理跑两遍，四次application投影、完整库不变、两次manifest一致。

新旧同参数批次production-33351399cc2100eb138c737d313ac669六片成功（二实拍一中文音频各两版）；14处重点词内容/时间与全部输入（除template）一致、SHA/解码与PCM相等。实际查看全部14处新旧中点及三份最短事件的八时刻前后图，所查未见遮脸/手、侧标脱离或退场残留；布局使用已查的左上留白，非自动避让。

中文“真正打动你的地方”左对齐后出现末行孤立“地方”，添加内容layoutPhrases词36..38后首批production-d8637c1cf067ef2020a91d335fceb083仍拆行。追踪发现events.rs的keyword_text_range要求原文严格相等，Keyword既有句末标点裁剪造成整条同排提示丢失。先添加回归复现失败；修复为仅Keyword布局范围以原词计算、验证既有裁剪规则后按UTF-16截去后缀，空标点范围省略。Sentence与内容不匹配拒绝逻辑保留。中文表情、重复英文、纯标点范围及静态编译元数据覆盖，16文本测试通过，模板模块222通过1既有ignored。

构建并确认无活动任务后更新Rust服务（exec67405）。同一同排请求重导production-2870e642c040431733cdc0d68d07e320成功；实际元数据为content真正打动你的地方、range4..8，源输入和PCM与前次一致；查看最终9.57秒全幅帧“真正打动/你的地方”两行完整左对齐。修复属于共享原生内容映射，不把短语硬编码进样式。

证据Downloads/signal-reading-20260929含定义/时间/面板验证、六份对照及两份中文修订、实际查看图集和最终review.html。没有连续观片/试听/正式分数，仍不能宣称20款≥90。语法检查与diff检查通过。验证过程中误用bun --check实际执行作者脚本并更新旧Downloads生成manifest；已将新输出留在本轮目录，并从只读原生draft-3e64c4014facbf88d4a93aed758ed156恢复历史三输入生产请求与版本标签（quotation2/signal1），不修改数据库或历史视频；恢复依据和原生投影差异记录manifest-recovery.json。


### 温暖批注 v3：长句两行与短事件可读性（2026-09-29）

上一轮青色侧标及句末同排修复属于progress。本轮实时读取文字样式，发现measured-sparkle r2入场.18/退场.12，0.36秒事件仅.06秒全不透明；实际工作台17字中文被压为一行小字，星光圆章相对过大。refine-warm-label.mjs保留原定义、原资源和空间跟随，保存r3仅改headline左对齐/maxLines2、三个图层入场.10/退场.06。四种原生事件长度验证起止不变，.36秒时全不透明.20秒；短于总预算仍按既有规则压缩，不承诺极短事件可读。

实际查看长中文前后，新版字号增大、两行左对齐；原生资源绑定与图层保持。verify-reading-style-panel.mjs回读当前版本与实际控件、两次重新加载确认对齐/行数/动效秒数，390px无溢出并查看移动截图，保存库前后相同。

production-9fbbd3f2da2de4a56570626394e227a4为旧r2/新r3同应用同三输入，共六片全部成功（二真人原声、一中文纯音频各两版）。中文使用已确认词36..38同排提示，两版均携带以保持内容输入一致。check-warm-label.py核对14处主文字与附属层内容/起止、输入除template严格一致、视频SHA/解码/音频技术检查与解码PCM一致。实际查看全部14处中点和三份最短事件各八时刻前后对照，长英文/中文字号改善，图标跟随，所查未见脸/手遮挡或片段结束后残留。没有连续观片或试听，不能据抽帧自动授予90分。

author-measured-sparkle-pilot.mjs同样有重跑覆盖保存版风险，已改为只创建缺失样式，当前保存版直接用于application/insert；新建默认同步两行/左对齐/.10/.06。代理拒绝资产写入，两次运行仅四次原生application/insert投影，完整库不变、两次manifest一致。验证输出隔离到warm-preserve-library-20260929。归档前次range测试遗留QA时钟副本style-qa-fixed-fade-clock-1790671674621，先完整比对原clock r1复制定义，正式时钟未变；记录qa-cleanup.json。

证据Downloads/warm-label-20260929含原定义、v3、原生时长/面板验证、长句画布、六片/14处对照及review.html。语法与diff检查通过；本轮没有新增原生或Web业务代码，不重复完整测试。整体20款均达90目标仍未完成。


### 宋体字幕：语义分句与四样例导出核对（2026-09-29）

上一目标轮仅核对左对齐保存状态与旧预览入口，没有新的样式改动；本轮接续已提交的宋体分句工作，核实predicate批次production-208e2c4db8e4ebeaf084ed6f4662f464已成功，不重启或重复提交。保存样式serif r3与Application保持不变；原分句批次production-e2f9bbf9fdff2bfadfa6d34820b50c42作同引擎基线。自动预算候选production-8846e88c4afa0ee7de95722f8d7f7f9d产生0.16秒Sure孤句及技术短语切断，未采用。Agent按原词索引校正批次production-6f0f0caaff50c970c16b99a77fbc442e；再将样例0的I would与destroy保留在同一显示单元，最终使用predicate样例0及reviewed样例1–3。没有修改参考工程。

check-serif-segments.py现在明确读取两份最终生产项，不覆盖中间reviewed记录。四样例逐词覆盖一次、每句首尾对齐原词时间、输入除template/captionSpans/captionPolicy严格一致；视频SHA、解码、原生音频检查与解码PCM一致，当前保存样式未变。英文三样例字幕数3→5、4→7、4→6；最长字符62→40、57→34、87→39，最短显示分别0.86、0.94、0.92秒。中文维持5段、最长12字、最短1.52秒。快速原声的阅读速度告警保留，不以拆句声称速度已全部达标。

实际查看全部23处最终字幕中点的前后同时间对照，确认I would destroy短语完整、金色重点词保留、所查没有裁字或遮脸。底部字幕部分经过手部/衣服，不宣称自动避让或普遍构图合格。Downloads/serif-segments-20260929/review.html整合四份最终视频、原分句切换、逐句图集和对应独立可编辑工程；原始候选证据保留。此轮未连续观片或试听，未新增审美分数。20款各≥90仍未完成。


### 青色弹字左上应用评审与太阳背景摆放对照（2026-09-29）

上一轮宋体分句校正属于progress。本轮核对cyan-impact当前r2，原左上应用1280×720/scale .75/center .22,.18仍无登记评审；已有84分属于中央大字的另一应用，不混用。实际查看cyan-natural-real-2026-09-29四份全幅代表帧及全部16处关键词30fps边界联系表（600×270左上裁切）。所查持有段不跳行、未裁字、退场无残留。太阳图案与文字竞争注意；December仅.36秒，缺实际速度与听感验收。

新增submit-cyan-corner-review.mjs核对当前r2、生产批次production-d46fc0518c17a581607f35a7e849cc47、四份库内/本地视频SHA、16组联系表源哈希和面板回执，登记该应用阶段性86分（21/22/17/17/9），保留两个阻断项。回读current/evidenceCurrent=true，meetsInternalThreshold=false，资产定义未改。verify-reading-style-panel两次加载核对两行/居中/.09入场/.04退场，390px不溢出；浏览器两次读取86分、需完善、未试听和问题文案，展开四视频/折叠卸载通过。首版UI核验点击后立即计数读到0；等待第4个视频挂载后重跑通过，未当作产品失败或改产品代码。

针对太阳背景生成同引擎左右对照previewOnly批次production-61224a1a44d65b2081bbf00b2f04ea80，两设计各一输入，已succeeded。候选仅centerX .22→.80，原视频全幅保留。核对输入除template相同，4处文字/时间/字号/布局尺寸/动效相同，仅横坐标平移742.4px；视频SHA、解码、音频验证及解码PCM一致。实际查看四处中点全幅左右图，右侧较安静、所查未遮脸/手，右侧几何背景仍有线条，不夸为无背景干扰。右侧仅一个样例、未检查新版完整连续动效/试听，不登记90分或继承86分。

Downloads/cyan-corner-review-20260929保存阶段评审、原生回执、UI检查及左右两片、四处全幅对比和review.html。保存样式与用户参考工程未修改。20款各≥90目标仍未完成。

### 候选阅读指标统一与迭代重点校正（2026-09-29）

上一轮青色左上应用阶段评审及左右导出对照属于progress。本轮检查可复用候选选择，确认现有六项评分没有人物/背景构图指标，不能据分数自动宣称最佳摆放。发现execution.rs阅读指标固定8字/秒、0.01秒分母，与rhythm实际captionPolicy及0.05秒分母不一致。新增回归先复现12字/秒、配置20预算时旧指标仍为2/3；修复为读取输入captionPolicy（优先）或模板segmentation，并共享Unicode reading_speed函数。覆盖声音覆盖/模板回退/中文与emoji/极短显示窗口。模板模块225通过、1既有ignored；后续旧权重不应用的补充断言单测通过。

指标版本caption-budget-v2、scoreModel heuristic-v2；偏好评价回执/反馈/训练档保留metricVersion。旧训练档读取时停用并提示，不覆盖数据库历史；旧反馈不参与新版本训练。回归覆盖历史保留、新旧训练隔离及零权重。MCP说明明确按实际预算评分、不能评估人脸/手势/背景干扰，文档同步。原生构建成功、确认无queued/running任务后更新本地服务（session95344）。四份宋体实测样例通过/evaluate检查：英文预算20的新阅读指标约.879/.939/.965，中文预算8仍1；原始词时间、样式库不变，真实超预算告警保留。数字升高反映计算修正，不意味着视频画质提高，不修改任何人工审美分数。证据Downloads/caption-score-policy-20260929。

用户明确纠偏：目标是可通用的模板规则，重点仍是模板效果。停止把单案例摆放与持续扩展评估基础设施当作主要产出。后续围绕字体层级、花字造型、动效节奏迭代，将长短文本、多行、装饰跟随、短词停留的适配沉淀成规则，用不同文案/声音/构图验证同一效果。位置只作适配变量；未实现新的自动视觉选位，不能宣称已具备。20款各≥90目标保留，尚未完成。

## 2026-09-29 — 效果优先：双色回声统一规则 r4

用户要求迭代可通用的模板规则，并明确变量建模必须服务实际模板效果。本轮将 `style-study-20260924-echo` 从 r3 保存为 r4：白色主文字、珊瑚红左残影、青色右残影，三层共享排版与缩放曲线；常规事件主文字 100ms 稳定、残影 160ms 消退、退场 40ms。短事件沿用原生阶段压缩，不逐例手改关键帧。残影在初始候选中与主文字缩放轨迹不同，长句暴露边缘不一致，最终统一三层缩放时钟。

- `scripts/templates/produce-echo-effect-rule.mjs` 保存并复用一个规则；生产批次 `production-14053cccfbd2f77d0e0c6ac014fe6055` 共 2 版 × 4 样例成功。三个英文采访视频与一个中文实测音频黑底样例共享应用参数（1280×720、scale .65、center .22/.18），不更改参考工程。
- `scripts/templates/check-echo-effect-rule.py` 验证 4 对导出的音频 PCM、文字与时序保留、三层排版/缩放一致及视频解码。已查看全部 4 组入场/稳定全画面对比与 4 组最短事件的完整 30fps 裁剪帧序列。另有短词、长中文、英文、中英混排合成预览，不能当作真实语音证据。
- `verify-reading-style-panel.mjs` 增加 STYLE_LAYERS 参数；headline、echo-text、echo-right 均在实际工作台可选中，排版与入退场数值与保存定义一致；两次加载及 390px 无横向溢出通过，未更改库数据。
- 修复 `author-style-expansion.mjs` 重跑覆盖已有样式的问题：已有样式直接按保存版本生成应用，仅缺失样式才初始化。禁止写资产的代理下重跑两次通过，全库不变。新安装种子仍是旧初始设计，不能声称新种子已升级至 r4。
- 交付：`/Users/zhengwei/Downloads/echo-effect-rule-20260929/review.html`，包含前后视频同时间切换、独立可编辑工程、合成预览与逐帧证据。

边界：复杂背景仍可能竞争注意力，长中文的“讲／清楚”语义换行未解决；没有听感及实时连续观看验收。本轮不授予 90 分，也不继承 r3 的旧评分；20 款 ≥90 的目标仍未完成。主要改进是实际效果的统一与可复用性，不能将数值校验通过等同于审美达标。

## 2026-09-29 — 回声效果接入初始化入口

上一轮已完成保存、导出及编辑检查，属于实际进展。本轮检查发现首次初始化仍会生成旧的单色回声，因此把已导出验证的 r4 效果定义作为 `scripts/templates/seeds/echo.json` 纳入仓库，`author-style-expansion.mjs` 缺失回声资产时直接使用该原生定义；移除旧单色生成分支。已有样式依旧使用库中的保存版本，不覆盖用户修改。种子使用 revision 0，不携带旧评分或应用证据；没有增加另一套 UI 或业务计算逻辑。

验证：`AUTHOR_SET=expansion node scripts/templates/verify-pilot-preserves-library.mjs` 两次真实服务调用通过，仅生成应用且全库不变；`node scripts/templates/verify-echo-seed.mjs` 模拟资产缺失分支，真实 Rust inspect 后的效果字段与当前保存 r4 完全一致（仅忽略 revision/provenance），拦截保存以保护现有库，再通过真实 application 入口完成清单。模拟保存不等同于独立新安装持久化验收。证据 `/Users/zhengwei/Downloads/echo-seed-20260929/verification.json`。这次解决效果分发回退问题，没有新增视觉评分，整体目标仍未完成。

## 2026-09-29 — 通用短语换行：局部超宽不再取消其他提示

上一轮已把优化后的回声规则接入初始化，属于实际进展。本轮检查共享排版器发现 `fit-region.ts` 使用 `grouped.every`：任何短语因附带标点变得超宽，会丢弃同段全部同排分组。该问题影响所有使用 layoutPhrases 的样式，不是某条文案的样式补丁。

改为逐分组测量，仅超宽组退回其原始分词；其他合法组继续参与换行与居中平衡。视觉测量仍在渲染器，语义短语仍由人/AI提供，未在前端新增语义推断或文案特例。字号、行数/尺寸预算、内容失效检测及显式换行规则不变。

验证：新增英文回归先复现失败（`two / three` 被错误拆开），修复后通过；新增中文标点超宽与“最重要”同排检查。`bun test src/text/layout-phrases.test.ts src/text/fit-region.test.ts src/services/renderer/__tests__/text-measurements.test.ts`：18 通过。实际查看共享测量前后对比 `/Users/zhengwei/Downloads/phrase-fallback-20260929/comparison.png`；此为隔离的文字渲染比较，不是完整视频导出。中文展示注册本机 STHeiti 字体以避免 NAPI 默认字体缺字。

全量 `tsc --noEmit --incremental false` 未通过，198 行诊断均为缺少 bun:test/Bun 类型与测试 fetch.preconnect 类型；日志保存在同目录 `typecheck.log`。不能宣称全量类型检查通过。没有改库中的样式版本和项目，也没有生成新审美评分。仍需中文语义提示自动生产和实际成片视觉验收；20 款 ≥90 目标未完成。

## 2026-09-29 — 增长提示：圆顶柱与整组淡出

上一轮修复共享短语换行，属于实际进展。本轮重新读取运行库，选取 `style-study-20260928-growth` r1 做实际造型与动效优化：圆顶与柱身通过相同 scaleY/Y 曲线沿固定底边生长，保留三柱依次长出的节奏；根组隔离合成并统一 60ms 淡出，取消子层分别透明造成的叠层显露。新增三枚圆顶仍为可编辑椭圆，八个形状加根组共九层。图标是定性装饰，不冒充数据图表。

保存过程：初版 r2 的组效果命名与面板约定不同，改为 `group-fade-root` 并保存 r3；参数和造型不变。最终批次 `production-666b831eac99e9c654644673a618c782`（旧 r1 / 新 r3 × 三个真实采访输入）六个视频全部 succeeded/published。r2 对照批次 `production-9eb8aff13e7e59cb85d0bc2dc9cfe45b` 保留；三个 r2/r3 MP4 文件哈希不同，但逐视频完整解码画面哈希相同，证明最终版与已审阅效果一致，不能混淆文件字节和画面证据。

- `verify-growth-rule.mjs`：0.125 / 0.45 / 1.4 / 4 秒合成窗口，验证编译关键帧底边固定、帽心与柱顶贴合、子层不淡出、组时序一致、正常窗口固定 60ms 退场。组 opacity 存在逐帧采样点，使用末个全不透明点而非倒数第二采样点计算淡出时长。
- 合成预览 3 时长 × 2 版 × 6 时刻共 36 帧已查看；真实导出全部入场/稳定帧和三组最短事件完整 30fps 裁剪帧序列已查看。`check-growth-rule.py` 验证来源输入/时序不变、音频 PCM 一致、文件哈希/解码与分组结构。未声称听感或实时连续观看通过。
- `verify-native-decoration-editor.mjs` 验证八个形状选中、颜色控件数值、根组隔离合成与淡出/入场预留参数、刷新及移动端；现有库数据不变。
- `author-growth-decoration.mjs` 改为已有资产直接复用，缺失时原生 inspect/save `seeds/growth.json`；运行已有资产路径回读与 r3 完全一致，种子原生标准化后除 revision 外也与 r3 完全一致。未删除现有资产模拟首次安装。
- 交付 `/Users/zhengwei/Downloads/growth-rule-20260929/review.html`：原生局部对照、六个视频同时间切换、独立编辑工程和连续帧。脚本与种子进入仓库，证据保存在该目录。

未通过项：统一位置在第三组覆盖背景标识；三组输入用于视觉适配，并非“增长”语义匹配验收。未授予 90 分，也不计为新独立风格或完整模板；20 款 ≥90 的总体目标仍未完成。

## 2026-09-29 — 同一效果的通用保护区摆放规则

围绕实际模板效果，补齐 growth r3 在不同画面中遮挡背景标识的问题。Rust 独立 placement-advice 契约接受精确版本应用、保护区、候选位置和留白；按同一顺序选择首个不碰撞且不出画的位置，全部受阻时返回空建议。未引入按素材 ID 特判，也不修改造型、尺寸、时序或动效。MCP 可调用同一能力；试映页可取当前帧、拖框、百分比微调、比较并应用，切换素材清除旧框，过期响应不会覆盖新设置。

实际三组输入共享同一 growth r3 和初始应用参数，只有人工标注的保护区不同。选择结果为原位、右上、右上；分别避开第二组太阳画面和第三组背景标识。批次 `production-91d5dc9f00a8b5eb0edf7f1dcd97700a`、`production-be4d8325e2ee41ad6fabc6e02e001e52` 全部导出成功。检查全部 11 个事件的入场、停留、退场代表帧及三组最短事件连续帧，未在已查看帧发现原有遮挡；音频 PCM、事件时序、形状大小与动效校验一致。原参考工程未修改。

原生模板测试 229 通过、1 既有忽略；MCP 转发与浏览器保护框操作、全受阻、不采纳过期结果、素材切换、移动端、库不变检查通过。全量 Web 类型检查未通过（198 行 Bun 类型/测试 fetch 类型诊断），不能声称全量检查通过。

对比页 `/Users/zhengwei/Downloads/placement-advice-20260929/review.html` 包含六个视频来源、同时间切换、13 张证据图及独立可编辑工程；页面加载与移动端检查通过。关键脚本：`verify-placement-advisor.mjs`、`produce-placement-advice.mjs`、`check-placement-advice.py`。

边界：保护区为人工提供，未实现自动识别/跟踪；检测基于设计区域，不覆盖完整阴影或动画越界。当前只建议主效果位置，保护框未持久化。三组是视觉适配样例，不是增长语义匹配验收；未听音或实时连续观看，未授予 90 分。此轮完成一项通用适配能力，20 款 ≥90 的总体目标仍未完成。

## 2026-09-29 — 双层花字退场与重复组实例

上一轮保护区摆放已导出验证，属于实际进展。本轮从效果入手检查 offset r5：粉色底层先淡出、白色主字直接结束，退场会丢失双层轮廓。初版 r6 改用整组透明度，在单次合成预览通过，但实际批次 `production-b37c5886ad834d6a1a4c9d91c18236f2` 暴露组控制器覆盖整段：只有最后一次出现淡出。该版不通过；不能沿用单次预览与旧脚本较弱断言称其已修复。

修复通过显式通用规则完成：Rust composition group / 动态素材容器新增可选 `separateInstances`，默认 false 保留历史总区间；true 按最终成员时间的连续重叠区间生成独立组实例，首尾相接也分开。每个实例独立解析组动效，子层内容/时间/缩放/倾斜不改。样式面板、组合面板及 MCP 的 `group_instances` 操作开放同一设置。重叠或长驻子层仍可能连接多个事件，因此这不是“每个语义事件”的隐式推断。

最终 offset r7 启用该规则，使用面板现有的 60ms 整组淡出，移除初版额外 40ms 整组淡入，保留原有 120ms 弹入/倾斜。白色与粉色从入场起保持完整轮廓；稳定造型、两行布局和字号不变。初始化使用 `scripts/templates/seeds/offset.json`；已有样式继续保留保存版。种子模拟缺失路径真实 native inspect / application、拦截保存验证通过；两次只读初始化重跑全库不变。

最终批次 `production-78d84062aee5899f652870b3e061ca89`：r5 / r7 × 四个实测声音输入，八个视频全部 succeeded/published。`check-offset-group-rule.py` 强化为核验全部 16 个花字实例均有对应独立控制器，且每个淡出恰为 7200 ticks（60ms）；同一输入、文字、事件时序、字体/布局参数、缩放/旋转轨道和音频 PCM 保持一致。已实际查看四组全部入场、停留、退场代表帧和各组最短事件 30fps 连续序列；另查看短词、长中文、英文、混排四类合成预览对比。未进行听音或实时连续播放验收。

原生模板回归 230 通过、1 既有忽略；新增组实例草稿编辑/投影测试单独通过。MCP group_instances 转发通过。`verify-offset-group-editor.mjs` 验证两个文字层外观/动效回读、整组合成/淡出、独立区间开关关/开经 Rust 返回、刷新、390px布局和库不变。全量 Web tsc 仍为 198 行既有 Bun/test typing 诊断；修改的组件无诊断，不能宣称全量检查通过。

交付 `/Users/zhengwei/Downloads/offset-group-rule-20260929/review.html`：八份视频同时间切换、20 张证据图、独立编辑工程、工作台入口；页面资源、切换和移动布局验证通过。原参考工程未修改。

仍未通过：固定左上角是动效对照用法，第二组覆盖太阳画面；长中文“讲／清楚”断行仍待语义提示处理。旧 growth / completion 等整组效果尚未按新 separateInstances 规则逐个升级重验，不应把本轮修复自动扩展到旧保存版或历史成片。本轮没有新增审美评分，也不计作一种新独立风格；20 款 ≥90 的总体目标继续。

## 2026-09-29 — 三款组合图标独立退场与跨画面应用

上一轮 offset r7 修复重复组实例，属于实际进展。本轮读取运行库确认 growth r3、completion r3、clock r2 仍使用总区间组控制器。通过 CAS 分别升级为 growth r4、completion r4、clock r3，定义深比较仅允许 root.separateInstances=true 与 revision 改变；不改造型、颜色、子层关键帧或声音事件。

三款使用同一 placement-advice 默认候选规则与上一轮已审查画面的人工保护区，结果均为第一组保留左侧、第二三组右侧。两批 `production-33f9e3321b88615d9b819fe01e29b29c`（三款×一输入）、`production-3c4e3284ddaf171df045b3c8ca13fe45`（三款×两输入）共九个视频全部 succeeded/published。原参考工程未修改。

`produce-icon-instance-rules.mjs` 保存精确版本、原生位置建议和旧组规则的真实样例预览。`check-icon-instance-rules.py` 检查全部 33 次出现均有独立控制器、每次整组淡出 7200 ticks（60ms），子层参数、时间及动画与旧规则预览一致；比较只排除 requestHash/applicationKey 来源标识，JSON 浮点往返允许 4 倍机器精度相对容差，不允许字符串/结构变化。所有文件 hash、解码、音频校验及与相同输入前次导出的 PCM 比较通过。已查看九组三阶段全画面（全部出现），以及九段最短事件的完整 30fps 图标局部序列，所查帧未见新增遮挡或退场残留。

三款种子同步保存版；completion/clock 的 author 脚本改为仅缺失时初始化、已有样式直接复用，避免升级后重跑报错或回退。`verify-icon-seed.mjs` 对三款分别模拟缺失，真实原生 inspect、拦截 save 校验与保存版一致，全库不变；不等同于真实空库安装。三款已有资产路径各执行两次，输出与保存版完全相等、全库不变。实际工作台验证所有形状选择/颜色、根组合成及淡出/预留时间、刷新、移动端和保存库不变；扩展验证器核对 separateInstances 开关，growth 已重跑，clock 在脚本更新后执行；completion 的此开关本轮未单独补跑，其原生定义与既有通用控件已验证。

交付 `/Users/zhengwei/Downloads/icon-instance-rules-20260929/review.html`：九段视频、18 张联系图与各独立可编辑工程。真实 Chrome 验证资源加载、单播放器独占播放及 390px 无横向溢出，静音播放不计听感验证。

边界：三款复用同一语音/标注用于视觉适配，不代表语义选材正确；保护区仍为人工提供。未实时连续观片或试听，未授予 90 分；三款属于已有图标家族，不增加风格或完整模板计数。20 款 ≥90 的总体目标未完成。

## 2026-09-29 — 内容短语跨样式复用检查

补充 template-production Skill 的内容审核规则：按句意标注动补、程度修饰、数量与量词、专名等紧密短语，检查助词所属关系；不使用示例替换表，不把整句/全部关键词默认锁行，不向样式写入词下标或固定换行。此为 Agent 创作流程，非新建自动分词服务。

新增可重复运行的 `review-phrase-style-matrix.mjs`（读取外部文案/短语/样式配置，按原生预览词边界映射、调用真实工作台）及 `check-phrase-style-matrix.py`。产物 `/Users/zhengwei/Downloads/phrase-style-matrix-20260929/review.html`。echo r4、adaptive r6、offset r7 × 三组文案，九组前后对比。完整库在生成前后相等；文本、时长、动画参数、字形参数相等，比较动画时仅排除随机关键帧 ID，参数排除 layoutPhrases 与两项请求来源字段。15 项既有短语/排版测试通过。

已查看全部三张对比联系图：adaptive 中“讲／清楚”变为“讲清楚”；echo/offset 中“最／重要”得到改善。初次只圈“最重要”会形成行首“的”，该轮保存在 `1-after-initial`，未当作通过；修订为完整修饰短语“最重要的”后，两款花字呈现“先完成／最重要的一件事”。第三组较长文案原本断行合理，标注前后保持。未通过修改字号、位置或样式版本补丁达成。

范围：合成时间的 1 秒静帧，不是新真实音频成片，不包含动效连续观片/试听，也不证明自动语义分析已实现。证明同一内容标注跨三款样式可复用，并给出助词边界需审查的反例；仍需真实长中文输入和更多句型验证。未授予90分，不增加独立样式或完整模板计数，20款≥90目标继续。

## 2026-09-29 — 三款花字的实测中文短语验证

批次 `production-4489203ab463ab5827da383c6af91eb0` 已 succeeded，三项全部 published、共九段导出。保存版 echo r4、adaptive r6、offset r7，统一1280×720、中心位置、scale .65；复用两个语速的已有同稿中文TTS录音与一段长旁白，保持转写 revision 2 和实测词时间。素材为本地音频配黑底，并非实拍口播；未上传或新建语音。

Agent按读取的原词序列补充“内容价值”“行动建议”“共同目标”“完成时间”“需要的支持”“优先顺序”“下一步行动”的内容短语范围，所有样式共用同一份样例标注。`produce-phrase-measured-matrix.mjs` 记录保存版本、精确 application、输入和无短语标注的原生预览；不更新样式或改动参考工程。`check-phrase-measured-matrix.py` 对照完整覆盖轨道（只排除随机id、两项请求来源标识及新增短语元数据，数值使用4倍机器精度JSON往返容差），确认字体/位置/动画/词时序没有改写。九份视频hash、解码、音频校验通过，PCM与同一输入的前次导出一致。

已查看九张全部事件三阶段联系图，共42次重点词出现，以及九张最短事件30fps完整连续帧。长词组在三款样式内呈“负责人、完成时间／和需要的支持”，所查帧没有新增短语跳动或退场残留。短词本身大多无需换行，不把无变化当作额外视觉提升。

交付 `/Users/zhengwei/Downloads/phrase-measured-matrix-20260929/review.html`，含九段视频及18张检查图。仍未试听或实时连续观片，不能据此认定声音审美、实拍遮挡和90分视觉质量通过；这批没有新增独立样式，不增加完整模板计数。下一项优先回到实际画面构图与素材风格丰富度，避免持续重复同类排版验证。

## 2026-09-29 — 地球动图实拍应用及图形描边通用修复

新增 `style-study-20260929-globe` 保存r2：六个可编辑原生椭圆图层构成地球经纬示意，展开经线、整体轻弹、每个显示区间独立60ms退场；不是地理地图/科学比例模型，无外部位图或AI生成素材。r1源设计的经纬线偏细，r2加粗至18/20源单位。author脚本及globe种子可重复读取保存版，不覆盖不同的已有人工设计。工作台验证六层选择/填充控件、组控件、刷新及手机宽度，全库不变。

两个既有NASA科普片段由Agent仅标注明确的地球相关词段，共三次图标出现；其他语义段keyword=null。位置建议读取人工保护框，在右上留白应用scale .32；不声称自动识别人脸或自动语义分析。首批 `production-4fe0da36f26c123d13b0db31d7baccf8` 两片成功，但全幅查看发现图标缩小后线条过细、部分呈断续像素。

定位到Rust `dynamic_asset::transform_projection` 将图形描边与几何重复缩放。图形描边本应保留512px源坐标值；文字描边仍使用画布像素缩放。已修复，并在文本/非文本共享样式时派生独立图形样式引用，避免相互干扰。新增原生跨画幅/尺寸、编译描边参数、文字与图形共享样式测试；完整templates测试233通过、1既有ignored。原生二进制重建，确认无运行/排队任务后重启，`/api/footage/state`正常；新服务session58841。旧工程编译参数不会自动迁移，该修复作用于新应用/插入投影。

相同r2定义、输入、位置重新导出批次 `production-e8bf00957995380090db90599811d764` 已succeeded，两片published。`check-globe-live.py`核对三次组实例严格对应实测关键词区间、每次六层、独立60ms退场，无关段落无图标；文件hash/解码/音频通过，PCM与同输入旧导出相等。`check-globe-stroke-comparison.py`确认完整叠加轨道除随机ID、两项请求来源标识及strokeWidth外相同，每条描边从重复乘.32恢复源值，几何、词时间、动画均不改。

实际查看修复前后局部图、三处中点全幅、全部进/停/退联系图及两段最短事件完整30fps局部连续帧：线条在小尺寸更连续清楚，所查未遮挡人物、太阳图示或背景文字，退场无残留。交付 `Downloads/globe-stroke-rule-20260929/review.html`（两个视频、三组局部对比及四张检查图），原始候选保存在globe-decoration目录。没有实时连续观片或试听；仅两种相近背景，未做三种场景审美验收，不授予90分。新增一款可复用装饰素材，不等于新增一个完整达标模板，整体目标继续。

## 2026-09-29 — 保存完整科普组合候选

新增 `composition-science-caption-20260929` 保存v1，名称“地球科普 · 逐词讲述与经纬提示”。将caption r3与globe r2通过原生application/insert组合：1280×720底部字幕（scale .7、centerY .88、captionWidth .84），右上地球（scale .32、center .82/.3），七个可编辑元素。模板保存样式/布局/绑定规则，不保存输入绝对时间。两段地球讲解由Agent标注主题关键词；第三段家庭趣事keyword=null，仅字幕，是错误触发的负样例，不冒充第三种地球题材。固定区域仍需应用前检查，没有自动主题识别/人脸避让。

previewOnly批次 `production-451bd3b2bf660cff5de94ad514045778` 三片全部published。`check-science-caption-composition.py`校验11个字幕保留计划全文及实测起止，逐词高亮关键帧对应wordTimings，图标次数0/1/2；三片hash/解码/音频通过，PCM与既有同源导出一致。已查看全部字幕的入/中/出全幅联系图、三处图标与字幕同时出现的原尺寸画面，以及各输入前九个词边界裁切。所查字行没有随高亮跳动，面部/原太阳图示/标识未被新元素覆盖；底部两行字幕仍会覆盖部分下方手势，这一取舍未解决。

候选保存前后检查其他模板与独立样式库不变，保存版与已导出候选逐字段一致（仅revision不同、允许4倍机器精度往返末位差）。`verify-science-caption-workbench.mjs`在真实工作台验证全部七层可选，内容绑定/语义角色/出现时机与保存字段一致，刷新/手机宽度/无pageerror，全库未变。保存版本为候选待审，不继承独立样式评分。

交付 `Downloads/science-caption-composition-20260929/review.html`，三份成片、检查图、工作台模板及可编辑工程链接；agent-content.json保存三份试映标注用于复用。部分输入仍有阅读速度预算警告，本轮未篡改转写或延长时间消除它；完整连续观片、试听、更多画幅/背景和手势遮挡策略尚未验收。无90分评分，不计入20款达标数量。本轮完成从独立素材到持久化组合模板的一步，而不是再新增三个独立模板。

## 2026-09-29 — 完整画面与字幕独立分区候选

针对上一版底部字幕覆盖手势的问题，新建 `composition-science-caption-panel-trial-20260929` v1“地球科普 · 独立阅读区”，保留叠加版。使用已有原生blurred_fill布局：videoRegion(.125,.03,.75,.75)，完整主画面缩至75%，模糊背景填充周边；下方20%深蓝阅读区与青色细线分隔，字幕centerY .90、弱化描边且去阴影。图标随16:9主画面区域缩放/平移（scale .24、center .74/.255）。九个元素可编辑，未增加特殊渲染器或固定音频时间线。

批次 `production-535e3d13111e3963a6638980de3d583a` 三片published。复用前批完整输入与语义标注，11个字幕全文、时间、高亮词窗口不变；图标次数仍0/1/2。解码/hash/音频校验和与原音PCM相等通过。`check-science-caption-panel.py`核对主画面均等比.75、无裁切参数或遮罩，当前三份16:9源的清晰画面底边561.6px，字幕布局盒顶边592.56px，不相交；不以此推断任意画幅的自动避让。首版核验使用完整导出，不是CSS模拟。

已查看三组同时间新旧对比、全部11句入中出联系图和一个图标/双行字幕共存原尺寸画面。所查原先被字幕覆盖的手势在主画面中可见，深色阅读区上的文字清楚；主画面明显变小，边缘模糊填充带来额外层次，也可能分散注意，因此作为布局候选而非全局替换。未实时连续观片或试听，不授予90分。

保存v1时仅归一化可选motionTiming:null为省略并允许4倍机器精度往返差，其他字段严格比较；其他模板与独立样式库不变。真实工作台检查九层可选、绑定/角色/时机回读、刷新与390px无横向溢出通过。Downloads/science-caption-panel-20260929/comparison.html提供三组旧新视频、代表帧、检查图与候选模板入口；原叠加版保持v1。两种布局属于同一科普组合的应用方向，不据此将20款独立达标数量加二。整体目标继续。

## 2026-09-29 — 中文原片增长动图与效果优先规则

使用与桌面原文件SHA256一致的75.233秒视频，批次production-9c827fc32d509a86001cbfd82d542624发布成功。仅5.64–6.76秒一个原生图形组，未新增文字，未改参考工程。核对词序列、组时机、输出hash与解码；查看中点全幅和完整事件30fps联系图。薄荷绿徽章与原片红黄花字不协调、构图关系弱，因此不授予90分，不增加合格模板数量。

源音频单声道，导出双声道；先前FFmpeg默认混为单声道导致sqrt(2)比较增益。修正为比较首声道、44100Hz：零延迟相关度-0.224478；输出后移64样本（1.451ms）对齐后相关度0.99999495，增益0.999460。1/20/50/70秒窗口均观察到一致偏移。尾部由音频75.185秒延伸至视频75.233秒。尚未修复源到导出的固定偏移，不能声称原声对齐通过；没有试听。检查脚本明确保留passed=false及sourceAudioAlignmentPassed=false，不用移位后的高相关度绕过验收。

检查产物Downloads/chinese-growth-original-20260929/review.html与verification.json。12秒衍生版虽然生产成功，本轮未完成其独立音频/画面验证。新增docs/template-effect-first-rules.md，明确最少变量、内容与模板边界、实际风格缺陷及候选比较标准；该文档是设计约束，不将未实现的配色联动或降级策略描述为已有能力。

## 2026-09-29 — 复古增长素材的实际视觉迭代

上一轮完成原片对照与音频偏移证据，属于进展。本轮新增保存素材style-study-20260929-bold-growth r1“复古增长 · 三阶跃升”，复用现有原生图形和动效字段：三柱各自由深色错位底、奶油色边缘、红/橙/黄内层组成，共九个可编辑图形及一个容器。移除大圆底，保留基线锚定的逐级升起与60ms组退场。没有为单个样例新增字段、保存原片绝对词下标或修改旧增长素材。种子scripts/templates/seeds/bold-growth.json，生产脚本produce-bold-growth.mjs。

批次production-5a32109dab66186c74d9e351447d4b0e成功，两段为同源75秒原片和12秒既有衍生片段，并非独立内容多样性。相同应用scale .24、center .18/.13、相同测得词区间；check-bold-growth.py确认仅一个九图形组、词序列与区间一致、hash/解码/服务音频检查通过，PCM与之前对应输入的导出逐字节相同。后者不代表源音频对齐，已知约1.45ms偏移仍未修复。

查看两张全幅前后对比和两张完整事件30fps联系图。去掉圆底后视觉重量降低，配色更接近原片花字；柱形生长与退场所查帧无残留。但角落位置仍与重点词缺乏构图联系，柱形造型也较基础，不能判为90分完整模板。下一步应与可编辑花字组合并验证相对附着及更多内容，不继续以同源样例堆数量。

verify-bold-growth-workbench.mjs通过九层选择、各自填充色与保存定义一致、刷新、手机宽度无溢出，保存素材回读不变、无页面错误。初版校验使用已过时的图层按钮入口失败，改为实际“当前样式图层”下拉后通过；没有为测试改产品。

交付Downloads/bold-growth-20260929/review.html，含两个视频、前后对比和全部事件帧。未试听、未实时连续观片、未评分；20个90分模板目标仍未完成。

## 2026-09-29 — 增长花字组合与实测声音适配

上一轮保存复古增长素材并完成两段对照，属于进展。本轮新增style-study-20260929-growth-headline r1“增长宣言 · 阶梯花字”：奶油色主字、深棕轮廓、红色硬阴影，九个阶梯图形通过现有text_box空间关系附着在实测文字边界上方，followMotion跟随花字缩放与倾斜。关系间距和图形相对偏移保存到素材；句子词下标、ASR时间不进入定义。十个叶图层加一个容器，不覆盖原双层花字或增长素材，也未修改参考工程。脚本author-growth-headline.mjs及种子growth-headline.json可回读重用。

先在真实工作台查看“突破”“持续增长”“让每一次积累变成真正的成长”合成时间预览，短词到两行长句都维持上方间距。首轮gallery请求2.6秒超过当前预览长度而失败，改用有效的0.35/0.5/1/1.5秒取帧；这不是产品修改。复用参数化verify-bold-growth-workbench.mjs，十层选择/各自填充色/刷新/手机宽度无溢出通过，保存定义不变。

进一步通过现有本地macOS婷婷TTS生成三段2.10/3.17/3.12秒录音，请求语速230/180/140。faster-whisper实测转写，保留原始ASR；将“節/續/長/讓/積/變”等繁体依原合成脚本校正为简体，CAS留痕，断言所有词时间未改。长句同排提示为“每一次积累”“真正的成长”，属于应用输入。没有上传视频、伪造词时间或试听。

批次production-9041456ce8a6deea6e3a725b1e9183a9成功，三个样例技术发布；关键词事件分别1.58–1.98、2.08–3.00、0–2.92秒。check-growth-headline-speech.py确认每段一个组、十个叶元素（九图形+文字）、输入词序列和关键词事件时间一致、hash/解码/服务音频检查通过。未验证源波形对齐，不声称已解决前述音频偏移。

已查看三段完整事件30fps联系图和长句全尺寸稳定帧。文字和装饰共同倾斜，换两行后装饰随文字顶部上移，所查无压字或退场残留。0.4秒事件中柱形完全展开后的停留偏短，短事件降级仍有优化空间。黑底样例不证明实拍避让、多画幅、声音审美或90分效果通过。交付Downloads/growth-headline-20260929/review.html；未增加已验收90分完整模板计数。

## 2026-09-29 — 增长花字短事件停留优化

上一轮完成文字边界依附组合与三段实测配音，属于进展。本轮保存同一素材style-study-20260929-growth-headline r2，将九个图形的enterSeconds从.22统一为.12，匹配主字120ms入场；不改其逐级曲线、布局、配色、文字、依附或60ms退场。使用现有相位时间模型，无新特例或字段。400ms实例的完整造型设计停留由120ms增加至220ms；这是该保存样式的默认节奏，不宣称新增自动短事件降级系统。

批次production-38254e1764f29158a91f6f25ebeb80a0三段成功导出。复用check-growth-headline-speech.py（新增PILOT_OUTPUT路径参数）核对十层、实测事件与词序列、hash/解码/服务音频检查；compare-growth-headline-timing.py断言仅九处入场时长和版本说明变化，三段导出PCM与r1逐字节相同，三个稳定帧平均RGB差为.071/.052/.226（0–255），符合重编码差异范围。不是源波形对齐证明。

查看短词120/220ms逐时刻对比、三段完整事件联系图：+140ms时新版柱形已经展开，原版仍在展开；文字/装饰关联保持，所查退场无残留，长句未出现新增换行或构图变化。新版十个图层选择、填充色回读、刷新、手机宽度无溢出与保存定义不变验证通过。脚本refine-growth-headline-timing.mjs保留r1证据并更新可重用seed。

交付Downloads/growth-headline-timing-20260929/review.html。尚未试听或实时连续观片，黑底样例未覆盖实拍背景/多画幅，不给90分或增加合格完整模板计数；整体目标仍未完成。下一阶段应将保存素材应用到合适的实际画面并完善完整模板组合，避免继续只围绕同一短词微调。

## 2026-09-29 — 成长访谈真实画面与双画幅对照

上一轮完成r2短事件优化和三段声音验证，属于进展。本轮从已存在的NIOSH导师访谈input-cde88118397f50e922df4e606786d79f（13.947秒，转写r1）选取明确的“go forward”词23–25，实测4.94–5.56秒。其余语义段不触发增长花字，包括否定句“without her ... would have done well”。完整54词形成6个字幕显示段，保持原声和词时间。源文件hash核对通过。

复用growth-headline r2与caption r3，构造横屏1280×720画内强调、竖屏720×1280完整容纳画面加阅读区两种候选。横屏使用实际查看的人物左侧空墙；竖屏使用blurred_fill、完整缩入的视频和下部暖黑底。位置为Agent人工构图，不是自动人物检测或通用画幅自适应。字幕颜色在整片组合内调整为暖白，不改独立素材库。首次预检拒绝空literal的底板，补上非渲染的底板标识后通过，未绕过校验。

批次production-3161055790d589404f7dfe38f41c1718两项成功；check-growth-headline-live.py核对完整词内容覆盖、唯一增长组精确时间、文件hash/解码/服务音频检查。查看两幅关键词稳定全图、每版6段字幕中点联系图及完整关键词30fps序列。横屏花字不遮人物，暖色与人物发色较协调；底字幕仍叠在部分低位手势上。竖屏阅读区在无强调词时明显空，人物缩小，不接受为合格完整模板。

仅将横屏保存为composition-growth-interview-landscape-20260929 v1“成长访谈 · 画内强调”，候选待审。save-science-caption-composition.mjs新增可选DESIGN_INDEX及按样例数校验，保持原默认行为；verify-science-caption-workbench.mjs支持读取对应保存文件。实测11个元素选择、内容绑定/时机字段一致、刷新、手机布局无溢出及库数据不变通过。竖屏未另行保存入模板库，生产证据保留。

交付Downloads/growth-headline-live-20260929/review.html，含两段视频、检查帧、横屏编辑入口和竖屏缺陷说明。未试听、未实时连续观片，未验证此输入的源波形对齐；同一画面的两种构图不构成跨内容充分验证，不授予90分或计为两套合格模板。下一步应解决整片底字幕手势遮挡及竖屏空白，增加适合的独立实际输入；总体20套90分模板目标未完成。

## 2026-09-29 — 竖屏暖纸阅读卡及无关键词场景

上一轮完成实拍横/竖屏对照并保存横屏候选，属于进展。本轮将竖屏过大的暗色阅读区改为“成长访谈 · 暖纸阅读卡”：固定栏目标签、绑定输入title的左对齐标题、完整16:9画面、深色正文与砖红逐词高亮、可选成长花字。四块暖纸底遮盖模糊背景的非视频区域，videoRegion按画布/源16:9比例设置，无意图裁切。字幕位于视频之外，不覆盖手势；没有修改growth-headline r2独立素材或原参考工程。

批次production-103b652ee7e98ac1f18a88869326a2de两个实际输入成功，第一段导师访谈保留go forward实测关键词，第二段工作热爱访谈没有成长关键词，完全不生成成长图形。两段同一人物与背景，不构成不同构图覆盖。check-editorial-interview.py验证完整原词与字幕覆盖、标题绑定各自输入、图形层9/0、hash/解码/服务音频检查。查看两幅全尺寸代表帧及全部9段字幕中点、第一段6处动效时刻；不是全片实时观片或全事件逐帧检查。

初始脚本变量重名在执行前修复；预检曾拒绝新标题层穿插composite组的z顺序，调整栏目、标题和分隔线到组上方连续层级后通过，没有放松验证器。saved composition-editorial-growth-interview-20260929 v1，19个元素。复用保存/工作台脚本确认19层可选、绑定/时机匹配、刷新、手机无横向溢出、库数据不变。

实际效果：比上一版暗底空区有更清晰的阅读层级，人物和字幕区分离；无关键词时版式保持稳定，但底部预留强调区仍显空，需要继续调整留白比例。仅保存为待审候选，未试听、未检查源波形对齐、未授予90分，不增加合格模板计数。交付Downloads/editorial-interview-20260929/review.html，包含两个视频、编辑入口和剩余缺陷。

## 2026-09-29 — 人物阅读卡的焦点裁切与装饰碰撞修正

上一轮完成暖纸阅读卡与两段实拍样例，属于进展。本轮使用现有full_bleed/videoRegion和样例focalPoint构造人物特写变体。模板画面区x=.04,y=.19,w=.92,h=.51，输入焦点x=.62,y=.5由实际人物画面人工审核；并非新增自动识别。标题区收紧，正文移至画面下方，完整画面版继续保留。两侧环境与边缘手势会有裁切，必须按镜头适用性选择。

初稿批次production-827bf2b838a1ae2d4907bb53e467305b两段导出后，全幅检查发现原底部分隔线穿过上移后的增长图标。移除该装饰线，不挪动文字或图标，重新提交production-ea6aa68c00cc7f1c6d5e9c406297b625，两段成功。保留editorial-closeup-20260929初稿证据，最终位于editorial-closeup-clean-20260929。

check-editorial-interview.py新增PILOT_OUTPUT参数及根据manifest展示是否裁切，复用于最终版；校验完整字幕、标题绑定、成长图形9/0、hash/解码/服务音频。compare-editorial-closeup.py核对样例唯一新增字段是focalPoint，最终清理只删除footer-rule及对应style，导出PCM与完整画面版一致；这不验证原始波形对齐。查看前后并排图、全部9个字幕中点及第一段6个关键动效时刻，最终分隔线碰撞消失，所查人物面部在框内；部分边缘手势裁掉，已在对照页说明。

保存composition-editorial-closeup-20260929 v1“成长访谈 · 人物阅读卡”为候选；18个元素。复用工作台脚本检查全部元素选择、绑定和时机一致、刷新、手机宽度与库不变。交付Downloads/editorial-closeup-clean-20260929/review.html，包含完整画面/初稿碰撞/清理后比较和两段视频。未试听、未全片实时观片、未覆盖其他人物/多人镜头，不授予90分、不将构图变体计为新的独立合格风格。

## 2026-09-29 — 保存模板跨人物、背景和长标题验证

上一轮保存人物裁切版并修复分隔线碰撞，属于进展。本轮读取暖纸阅读卡/人物阅读卡各v1，不改视觉定义，仅复制生产身份用于previewOnly。用Deborah浅色制服、John深色衣服/标识背景、Alex太阳图示背景三个既有输入，人工焦点分别x=.64/.52/.52、y=.5。标题长度不同，John标题自动分两行。相关内容没有明确成长关键词，全部keyword=null，不添加增长图形。

批次production-ba7cb45334ea9c159f2e6317abcab8ce，2构图×3输入共6段成功导出。check-editorial-cross-input.py核对所有源hash、原词完整覆盖、标题绑定、无无关增长元素、导出hash/解码/服务音频，并回读保存模板不变。查看三张双版同刻对比及6张全部字幕代表帧（每版3/5/4句，共24个字幕中点）；不是全片实时观片，也未试听。

审片结论：人物裁切的Deborah构图可用，所查标题/字幕无溢出；John裁切版损失部分NASA标识；Alex裁切版明显损失太阳图示，涉及讲解内容，应选择完整画面。人物居中不等于构图合适。此结论已写入模板生产Skill的“人物裁切与画面信息保留”，要求区分模板布局与输入焦点，先检查画面信息再选完整/裁切版，同时测试无关键词场景；没有新增伪自动识别逻辑或专用case字段。

交付Downloads/editorial-cross-input-20260929/review.html，6段视频、3组对比、全部字幕代表帧和逐输入选型依据。证据覆盖了不同人物/背景和一次长标题，但未试听、未验证源波形对齐、不代表任意标题长度或多人物适配。没有新增独立设计，不增加20套90分验收数量。

## 2026-09-29 — 两套阅读卡正式证据与质量评审闭环

上一轮完成6段跨人物验证并形成裁切选型规则，属于进展。本轮将相同设计挂回保存模板的正式成片，批次production-9ef8308037d490ddefa210cb40a5dbfa成功（previewOnly=false）。两份模板由v1成为v2，除revision外完整定义相等；不新增模板ID或声称新风格。此举使原生模板库能够关联播放证据与质量状态，技术发布不等于视觉通过。

review-editorial-candidates.mjs核对当前版本、全部6文件hash/解码/服务音频、三份同输入PCM相等，并分别对照前次已查看的1/3/6秒RGB均差<1，保证正式证据没有视觉漂移。随后通过/templates/reviews记录阶段性Agent人工评分：暖纸阅读卡79=构图18+动效17+素材17+适配17+编辑10；人物阅读卡78=21+17+17+13+10。主要扣分是无强调时留白/主体比例、裁切损失图示或标识，以及当前无关键词批次未覆盖装饰动效、未实时播放/试听。没有通过降低门槛或虚填听感获得90分。

两份评审meetsInternalThreshold=false，API质量摘要为needs_revision；verify-editorial-review-ui.mjs实际查看模板列表，确认79/78分、“需返修”和“未试听”均显示。19/18层编辑性沿用已检查的相同定义证据，并明确新旧版本只差revision。新评审未把6个样例算成6个合格模板。

交付Downloads/editorial-quality-review-20260929/review.html，分项依据、缺陷、工作台入口及跨人物对照。评分为有限抽帧证据上的Agent判断，不是自动客观审美测量。整体20套90分目标仍未验证完成，后续应优先改进留白占比及适用范围选择，再扩大独立风格覆盖。

## 2026-09-29 — 注释便签可复用素材与三种词长验证

保存独立素材style-study-20260929-note-paper r1“注释便签 · 暖黄纸条”：深棕左对齐文字、按文字测量的暖黄底板、胶带与高光依附text_box并followMotion。三个叶层加组合根；120ms入场与60ms退场使用现有相位能力，不新增句子特例或绝对时间字段。author-note-paper.mjs和seeds/note-paper.json保留作者定义和可复用种子。

生产批次production-54dded06d9a34cb2e48fae3cededb7cf使用既有三份实测中文TTS/ASR输入，两字“突破”、四字“持续增长”和两行长句，事件时长0.40/0.92/2.92秒。check-note-paper.py核对保存定义不变、三层结构、原词与事件时间、导出hash、解码和服务音频检查，三段通过。verify-bold-growth-workbench.mjs已泛化最终选择层，完成三层可选、颜色回读、刷新、手机无横向溢出与定义不变检查。

实际查看三张全尺寸稳定帧及三份事件30fps联系图：短词底板收窄、长句自动两行，胶带位于文字顶部，所查无裁字和退场残留；长句总览缩略，不是每帧全尺寸审查。独立几何便签设计仍较简洁，未验证真实复杂背景适配。未试听或实时连续播放，未检查源波形对齐；此前原片64样本偏移问题未解决。此次不评90分、不增加合格完整模板计数。

交付/Users/zhengwei/Downloads/note-paper-20260929/review.html。docs/template-effect-first-rules.md补充实际字段、视觉效果和验证边界映射，明确模型服务于完整样式，不把参数数量当作质量。20套90分目标仍未完成。

## 2026-09-29 — 便签实拍应用与共用位置策略

上一轮完成黑底三种词长，属于进展。本轮用三份既有真实访谈输入，保留全部字幕与实测词时间，人工选择never got upset/from space/longer sunlight作为注释词。初版统一左上位置与0.65缩放，批次production-60f3d65d0df0a80924ee8c51d5eb619e三段导出；实际查看三张全幅、全部12个字幕中点和三份事件30fps联系图，发现太阳图示被便签覆盖，不能作为通用布局通过。

保留初版证据，修订应用策略为统一0.5缩放、左上(.2,.25)/右上(.86,.25)两个候选和.02保护间距。复用已有Rust placement-advice，保护区来自此前实际审片的人工标注，并按真实输入对应关系复核。得到左/右/右选择；没有改变便签r1保存定义，也没有针对每句话改字号、换行或动效。共用请求保存在scripts/templates/seeds/note-paper-placement.json，refine-note-paper-live-placement.mjs读取它，仅将具体输入的保护区传入；三份实际执行请求与该策略相等验证通过。它是调用层可复用策略样本，不宣称新增工作台策略库或自动画面识别。

最终批次production-dae843ed257dba1ae0c4db006f213583、production-1f4f53b7682de3a78c6418f63e7db5c4、production-70105c64329ed64948b09c4c81c7eb20各一段成功。check-note-paper-live.py验证完整字幕、关键词事件、保存素材不变、hash/解码/服务音频；compare-note-paper-live.py验证同输入、同素材、前后导出PCM相等。查看三张最终全幅和事件联系图：太阳图示和NASA背景标识不再被便签叠盖，所查面部未遮挡、文字没有裁切、胶带与正文共同退场。右侧标签仍有贴纸式孤立感，底字幕覆盖部分下方手势；不据此给90分。

交付/Users/zhengwei/Downloads/note-paper-safe-20260929/review.html，含三组前后对照、最终视频和事件检查帧。未试听、未全片实时播放、未检查源波形对齐；旧原片64样本偏移未解决。三种摆放实例不新增三款模板，不污染模板库为三个重复设计。20套90分目标仍未完成。

## 2026-09-29 — 便签主字幕与轻量比例对照

上一轮完成实拍便签保护区选择，属于进展。本轮将便签设计用于主字幕，保存style-study-20260929-note-caption r1：全部叶层绑定sentence/cue_start，正文取消倾斜缩放，改为8px小幅上移入场，保留左对齐、测量底板与胶带依附；每句独立组合实例。原note-paper r1未改。produce-note-caption.mjs及seeds/note-caption.json保存可复用作者定义，不写入具体句子坐标。

初版批次production-0f77bc5bea646ad4955dd71e2c6034ba在同三份访谈覆盖3/5/4句。查看全部12个字幕中点与两幅全尺寸长句，发现0.65缩放的大面积底板过重、下方手势遮挡。保留初稿，统一应用缩放改为0.52、垂直中心.85→.89，文字区域84%/两行上限不变；批次production-81aec5e197ffa2bcd179857a92522bcc再导出三段。check-note-caption.py两批均通过每句起止词时间、完整文字覆盖、每句三个叶层、保存素材不变、hash/解码/服务音频和相对于旧版同输入导出的PCM相等。compare-note-caption.py确认同素材同输入，仅应用transform变化。工作台三层选择、颜色回读、刷新、手机宽度及定义不变通过。

查看轻量版全部12句中点与全尺寸长句：黄色底板变薄、下移，人物画面占比改善，去掉角落文字重复；但两行句尾出现calculator或sun孤词行，左对齐自动换行的行长平衡需要进一步完善。不能把遮挡减少判为完整视觉通过。当前fit-region.ts只对居中文字执行balanceMeasuredLines，需结合阅读标签的左对齐目标评估通用换行策略，而非为这些例句硬编码换行。底部手势仍可能遮挡，连续换句动态尚未专项检查。

交付/Users/zhengwei/Downloads/note-caption-compact-20260929/review.html，包含初版/轻量版三组对照与视频。未试听、未实时连续观看、未验证源波形对齐，既有64样本音频偏移仍未解决。保存为阅读用途变体，未评90分，未计为新的独立合格风格；20套目标仍未完成。

## 2026-09-29 — 左对齐自动分行的通用修正与成片复测

上一轮发现便签主字幕的calculator/sun孤词尾行，属于提供下一步依据的进展。本轮修正apps/web/src/text/fit-region.ts：行长平衡不再以textAlign=center为前提，左/中/右对齐均使用现有测量分行器；字号、行数预算、显式段落与有效layoutPhrases约束保持。该路径属于Web字形测量与渲染，不新增Rust业务副本，不增加句子专用分支。旧左/右对齐自动区域的换行可能改变，手动段落保持；不是自动语义分析。

更新fit-region.test.ts验证三种对齐得到相同分行、各自对齐值保留、同字号同两行与较小行宽差；layout-phrases.test.ts同步覆盖三种对齐合法短语边界。连同attachment-bounds与text-attachment-geometry，24项测试、189断言通过。首次编辑命令工作目录错误未修改文件，随后从仓库根修正并重新运行；原左对齐贪心预期测试随需求更新，未忽略失败。

生产批次production-a1e72aa58db95030ca3b276dd144d848保留note-caption r1、三份输入、完整模板和应用transform完全相同，只使用更新后的渲染器。首次重渲染键过长被原生校验拒绝，改为把渲染版本纳入hash后通过，未放宽校验。三段导出通过12句原文覆盖、各句起止词时间、三叶层组结构、文件hash/解码/服务音频，以及同输入前版导出PCM相等。compare-note-caption-balance.py核对定义/输入/应用/设计/样例相等。

实际查看全部12句中点和两幅全尺寸问题长句：calculator与sun孤词尾行消失，分别形成“...I would / destroy my brother's calculator”和“...hemisphere has / pointed more towards the sun”，底板随更均衡的两行收窄；所查未裁字、胶带随新边界居中，单行样例保持。未进行连续换句动态专项或试听，底部手势遮挡仍可能存在。不能从局部分行修正升级为90分整套验收。

保存composition-note-caption-20260929 v1“访谈笔记 · 便签字幕”为候选；实际工作台三层选择、绑定/时机回读、刷新与手机宽度验证通过。交付/Users/zhengwei/Downloads/note-caption-balanced-20260929/review.html，含旧/新分行对照和三段视频。docs/template-effect-first-rules.md补充正交分行规则与旧布局变化边界。既有原片64样本音频偏移未解决；未增加20套90分计数，总目标仍未完成。

## 2026-09-29 — 便签字幕全部起止边界检查

上一轮完成左对齐分行修正和实拍复测，属于进展。本轮复用原批次production-a1e72aa58db95030ca3b276dd144d848的三个已导出文件，不重建工程或重复生产。check-note-caption-boundaries.py检查12句字幕的22个唯一起止点，取每点前后30fps七个时刻，剔除视频范围外时刻后共145张底部200像素裁切帧；包含8.80与11.52秒两处无间隔换句。编译组区间无重叠，正文无X动画、Y入场行程4.16px符合8px×.52缩放；最短句1.10秒。

实际查看三份边界联系图及3.366667/3.40/3.433333秒全幅：所查旧句淡出、新句出现时无叠字，胶带随正文出现/消失，原声停顿期间没有新增字幕；无间隔换句切入新文本。联系图曾看似横向滑入，经全幅与编译动画核对排除，为小格浏览误判；未据此改动正确样式。为减少审片误读，在联系图中增加格线并排除0秒前重复钳位帧。

compare-note-caption-balance.py的review.html现包含三组起止边界图和检查范围说明。此证据补齐入退场交界抽帧检查，不等于实时连续播放、全时域逐帧或试听，也不能证明任意短于1.1秒的字幕适配。未改声音，原片64样本偏移仍未解决；未给90分、未新增模板数量，20套90分总目标仍未完成。

## 2026-09-29 — 原片64采样音频偏移定位与修复

上一轮补齐字幕起止边界证据，属于进展。本轮处理持续未通过的原片音频对齐。probe-source-audio.mjs在本地Chrome对用户原始75秒MP4分别使用Mediabunny AudioBufferSink逐包拼接和Web Audio decodeAudioData整文件解码，保存前6秒原始float采样；compare-source-audio-decoders.py与FFmpeg同一声道44100Hz对照。在1–4秒窗口，逐包结果需向后取64采样才逐采样相等；整文件解码无需平移即逐采样相等。逐包第一个buffer的timestamp为0，不能仅靠拼接时加入时间戳修复此文件。证据在Downloads/source-audio-alignment-20260929。

修正apps/web/src/media/audio.ts的resolveAudioBufferForAsset：视频与音频优先使用浏览器整容器解码，保留AAC priming/edit-list裁切信息；视频格式不支持时仍回退原逐包路径。不硬编码64采样补偿、不更改用户时间轴，不把解码工作复制成Rust业务逻辑。回退格式尚未覆盖此次对齐验证，不能宣称所有编码已通过。两个既有模板音频错误/MIME回归测试通过。

批次production-4770a84548a8e8810167e4be359f0d94使用原75秒视频、完全相同的原模板/输入/图标事件，仅更换幂等键重导出。原参考工程未改；新证据保存在Downloads/chinese-growth-audio-aligned-20260929，旧失败证据保留。check-chinese-growth-cue.py加入PILOT_OUTPUT并按实际音频结果展示通过/失败：新全片零偏移相关性0.9999951256，归一化误差0.00317125；旧64采样平移反而不匹配。hash/解码/图形事件结构通过。

check-source-audio-alignment.py在1/20/50/70秒四个窗口搜索±256采样，最佳延迟全部为0，零偏移相关性均>0.999992，误差<0.0042，未对通过结果作平移补偿。核对前后manifest除幂等键外完全一致。1/6.2/50/70秒四帧与旧导出RGB平均误差均0，支持此修改只修正声音链路。源解码长度3316672采样、导出3318784采样；导出按视频时长补尾，AAC重编码不要求PCM逐字节相等。

本次已解决此原片此前64采样固定偏移；历史失败文件不会自动变化。未试听，技术对齐不等同听感审美或90分模板验收，不新增合格模板数量。20套90分目标仍未完成。

## 2026-09-29 — 原创灯泡动图与三种词长花字组合

上一轮解决原片64采样偏移，属于进展。本轮回到插画/icon丰富度，保存style-study-20260929-bulb r1“灵感灯泡 · 暖光点亮”，16个原生可编辑图形叶层：暖黄灯心/橙色阴影/深棕轮廓/奶油高光、铜色螺纹灯座、五条展开光芒。非位图或外部素材。独立预览已查看全尺寸造型。author-bulb-decoration.mjs与seeds/bulb.json保留作者定义。

保存style-study-20260929-bulb-headline r1“灵感点亮 · 灯泡花字”，文字加16图形共17叶层。灯泡缩放.22，全部图形依附实测text_box上沿并followMotion；奶油字、棕描边和铜色偏移阴影与图标一致。不保存具体句子坐标、时间或换行。author-bulb-headline.mjs与对应seed可复用；工作台17层可选、填充色回读、刷新、手机宽度与保存定义不变验证通过。

三段本地婷婷TTS分别230/180/140语速，输入input-c316fc600f96ab94357170f3214715f8、input-c9c4d117706c4d1b0c6f447b257b16a4、input-be7f00cace26c3b9a82faf9293ac6e55。ASR与原合成文本核对后将繁体恢复为简体，通过带revision的correction保留词时间和历史；低置信词/ASR时间估计边界仍保留，不冒充人工听校。关键词为“灵感”“新的思路”“可以行动的小步骤”，事件0–.34、1.56–2.30、1.86–3.70秒；第三段短语标注保留“可以行动的”和“小步骤”。

批次production-53f63879b6913542ea75269700ccd11c三段成功导出。check-bulb-headline.py验证17叶层/16图形、保存定义不变、完整输入词与关键词事件时间、hash/解码/服务音频检查。查看三张全尺寸稳定帧及完整事件30fps联系图（最长联系图为缩略总览）：短词光芒约120ms展开后仍有停留，长词两行、图标随文字上沿上移，所查无压字或退场残留。

交付/Users/zhengwei/Downloads/bulb-headline-20260929/review.html。这是一个原创图标设计及其花字组合，不能算两套90分完整模板。尚未覆盖实拍背景、其他画幅、试听和源波形对齐；短词总时长340ms仍需连续播放评价。没有授予90分，整体20套目标仍未完成。

## 2026-09-29 — 灯泡真实语义触发、负例与采样率覆盖

上一轮完成原创灯泡及中文TTS花字样例，属于进展。本轮保存composition-bulb-science-20260929 v1“科普随想 · 灵感点亮”，组合完整逐词字幕与16层灯泡，灯泡右上(.84,.26)、缩放.23。三份既有实拍输入共12句原文；只将John的we've learned so much（词5–9，5.64–7.02秒）标为新认识关键词，Deborah家庭故事与Alex太阳讲解没有匹配关键词，灯泡实例分别0/1/0。该标注和摆放为Agent人工判断，不是自动语义匹配或人物检测。

批次production-62e017dd1a2426c0e843f3f77db7f465三段成功；check-bulb-live.py验证完整字幕、唯一灯泡组16层及精确词事件、保存素材不变、hash/解码/服务音频。查看John关键词全尺寸帧、三份全部12句中点及关键词完整30fps联系图；所查灯泡未遮人脸/背景NASA标识/字幕，光芒入场、共同退场无残留。两份负例无无关灯泡。局限仍是角落图标与人物较独立，未据此给90分。

复用源文件hash后，check-bulb-live-audio.py对三份AAC源（44.1kHz双声道一份、48kHz双声道两份）各取开头/中段/结尾语音窗口，重采样到44100Hz同一声道对照导出。九个窗口±128采样搜索最佳延迟全0，零偏移相关性最低0.9979278；归一化波形误差最大0.06444，属于重编码/重采样差异的实测值，不声称逐字节相同或听感无差异。扩展了此前单个44100Hz单声道原片的修复证据，但未覆盖所有格式与回退解码路径。

工作台17层选择、绑定/时机回读、刷新和手机宽度验证通过。交付/Users/zhengwei/Downloads/bulb-live-20260929/review.html，含三段视频、检查帧、音频核对说明与编辑入口。未试听或全片实时播放，未评90分；该组合保留为候选，不增加已验收完整模板计数。整体20套90分目标仍未完成。

## 2026-09-29 — 字幕依附候选保存与工作台闭环

完成上轮未收尾的字幕旁灯泡候选，批次 production-5a96f98dfb66a9a7d1e89118023ef27a。复用原灯泡 r1 及三份实拍输入，字幕宽 .78、中心 X .53，灯泡缩放 .12。16 个图形通过 text_box 左侧依附、.015 间距和组内偏移保持造型；没有按句子逐个调坐标。声音与关键词 5.64–7.02 秒不变。

前轮已检查三段导出、12 句中点及关键词事件联系图；本轮重新查看角落/依附对比图，字幕旁构图更集中，图标不再孤立占据右上背景。仍只有一份输入触发图标，不能据此证明任意内容适配。前后同素材、同输入标注和三段导出 PCM 一致的 comparison.json 已保留。

保存 composition-bulb-caption-bound-20260929 v1“科普随想 · 字幕旁点亮”为候选。实际工作台验证 17 元素可选，内容绑定/时机回读一致，刷新与手机宽度检查通过，库中其他定义不变。修正 check-bulb-live.py 与现有 review.html 对依附版仍误称“右上位置”的描述，Python 语法校验通过。docs/template-effect-first-rules.md 补充现有字段、设计默认值及验证边界；没有新增重复业务模型。

交付 /Users/zhengwei/Downloads/bulb-caption-bound-20260929/review.html。未试听或实时连续观看，未评 90 分；属于同一设计的构图变体，不增加独立合格模板数量。20 套 90 分目标仍未完成。

## 2026-09-29 — 同一字幕依附模板跨内容验证

上一轮完成候选保存与编辑入口验证，属于进展。本轮不改模板，将 composition-bulb-caption-bound-20260929 v1 原样用于两个新的实际关键词：“from space”13.26–13.72 秒、“because of the tilt of the earth”4.10–5.46 秒；Deborah 保持无关键词负例。标注为 Agent 内容判断，不是自动检测。字幕分段、原词时间、输入与全部视觉字段保持原样。

produce-bulb-attachment-coverage.mjs 提交批次 production-07a77ad6fa3c5a2f0b60cff6a9f4cee9，三个预览成功。check-bulb-live.py 检查12句完整字幕、灯泡实例0/1/1、关键词组16层及起止词时间、hash/解码/服务音频通过。check-bulb-attachment-coverage.py 进一步确认使用确切保存版本、库定义未改、字幕边界未改、三份导出 PCM 与上一版相同。

实际查看两个关键词中点全幅与完整事件30fps联系图：所查灯泡随不同字幕左边界移动，间距稳定，无裁切、压字和退出残留；人物面部与太阳图示保留。长因果句仍横向占用较大，底部字幕可能盖住身体/手势；短词事件仅460ms。联系图为缩略审查，未做实时连续观看或试听。这证明两种额外输入事件上的复用，不是任意画幅/长度通过。

交付 /Users/zhengwei/Downloads/bulb-attachment-coverage-20260929/review.html。未新增风格、未授予90分；20套90分目标仍未完成。下一步应改善长句阅读节奏并扩展独立设计，而非为同一个灯泡继续增加坐标变体。

## 2026-09-29 — 长句阅读区域收敛与两行依附

上一轮补充同模板跨内容证据，属于进展。本轮先只改共享正文区域宽度.78→.64，保持中心/字号/高度/动效/灯泡规则与输入不变。批次 production-335f1b5207c979d363f36c9d470461a9 三段成功；compare-bulb-reading-width.py 确认只有文字区域宽度及等中心X变化，原输入/标注/导出PCM相同。实际查看对照：短句不变，长因果句收成两行，减少横向占用，但出现 because/of 断行。

第二步保持该模板完全不变，仅输入layoutPhrases增加11–18完整因果短语。初次请求使用错误的直接startWord字段被反序列化拒绝，改为已有wordSpan结构后通过，未修改API契约。批次 production-2f0518f1c3391f722aeeecbbfc6644c5 三段成功。compare-bulb-reading-phrases.py 确认两次设计完全相同，仅内容短语变化且三段导出PCM相同。check-bulb-live.py 两批均通过12句原文覆盖、灯泡0/1/1、事件起止/16层结构、hash/解码/服务音频。

查看最终长句全幅、全部12句中点和因果词段完整30fps联系图：得到“For the June solstice, / because of the tilt of the earth,”，因果短语保持同排，灯泡跟随两行文本块左边界，所查无压字、裁切或退场残留。两行增加垂直占用，底部身体/手势仍可能被挡；没有实时连续观看、试听或全画幅验证。

保存 composition-bulb-reading-width-20260929 v1“科普随想 · 紧凑阅读对照”为候选。工作台17层选择、绑定/时机回读、刷新、手机宽度和库其他定义保持检查通过。脚本refine-bulb-reading-width.mjs通过WITH_PHRASES选择是否传入内容短语，模板不包含句子特例；规则补充到template-effect-first-rules.md。

交付 /Users/zhengwei/Downloads/bulb-reading-phrases-20260929/review.html；原宽度对照证据保留在bulb-reading-width-20260929。此为同一风格的阅读优化，不新增独立风格数量、不授予90分。20套90分总目标仍未完成。

## 2026-09-30 — 原创行动清单素材与方法花字初版

上一轮完成紧凑阅读对照，属于进展。本轮扩展独立图形设计，保存style-study-20260929-checklist r1“行动清单 · 逐项完成”，20个可编辑原生图形：暖白纸张、靛蓝外框/标题条、奶油装订夹、三行薄荷绿底块、分笔勾选与条目线。三个勾选在入场阶段错开出现。图示是行动建议的抽象装饰，不表示实际任务完成；没有外部位图来源。

保存style-study-20260929-checklist-headline r1“行动清单 · 方法花字”，正文加清单共21叶层，奶油字、靛蓝描边和紫色偏移阴影；清单按text_box上沿依附，默认词可替换。author-checklist-decoration.mjs、author-checklist-headline.mjs及对应seed保留可复用定义；非句子专用坐标。

本地婷婷TTS三段“完成，然后继续。”“现在就开始行动。”“把目标拆成三个可以完成的小步骤。”，实测关键词分别0–.32、.68–1.60、1.22–3.46秒。输入input-855095df75ed875fa4f3c574d4a87acb、input-177bfbf9a09e6e42ddb99e9646177c0a、input-8560256a59271fb174be96c5c9af1846。繁体转写按保留的合成文案经correction修正，原词时间不变；短词逗号包含在原ASR词中，关键词取完整词边界，未伪造分词时间。保留ASR低置信警告，不冒充听校。

批次production-fdfa1a2a5a69843ce7b9154d96ddb8bc三个导出成功。check-checklist-headline.py验证保存素材不变、21叶层/20图形、原词与关键词时间、hash/解码/服务音频。查看三个全尺寸中点及320ms短事件完整30fps联系图：图形造型可辨、所查无裁字，短词退出后无残留；短词逐项勾选较快。长句短语超过可用宽度回退为“三个可以 / 完成的小步骤”，拆开可以完成，属于未解决阅读问题。未据技术通过授予90分。

方法花字工作台21层选择、颜色回读、刷新、手机宽度及定义保持验证通过。交付 /Users/zhengwei/Downloads/checklist-headline-20260929/review.html，并显式标为待修订。此为一款新图形与其文字组合，不能算两套独立合格模板。尚无实拍、全画幅、实时连续观看、试听或源波形对齐证据；20套90分目标仍未完成。

## 2026-09-30 — 清单长句与勾选节奏修订

上一轮新增清单图形并定位两处视觉不足，属于进展。本轮读取保存r1后通过revision校验更新style-study-20260929-checklist与style-study-20260929-checklist-headline为r2。独立图形改名“行动清单 · 勾选确认”，六个勾选笔画统一80ms显现，取代短时间内逐项错开；所有事件共用此规则，未声称按时长自动降级。花字区域宽.80→.88、居中不变、字号84→78，为有效语义短语预留空间。保持输入词、短语标注、声音时机不变；未向渲染器加入单句特例。

refine-checklist-style.mjs保存前后定义及CAS证据；produce-checklist-headline-speech.mjs新增PILOT_OUTPUT。批次production-38ec1cabe691277c5368d220cf83de1a三个预览成功。check-checklist-headline.py验证21叶层/20图形、保存r2、原词与事件区间、hash/解码/服务音频；compare-checklist-refinement.py确认输入及标注相同、三段导出PCM与初版一致、每段六个勾选笔画在9600ticks即80ms达到opacity1。

查看长句前后全幅对照、四字中点和320ms短事件完整30fps联系图：长句变为“三个可以完成的 / 小步骤”，不再拆开可以完成；短词勾选同步显现，退出后无残留。7/3字分行仍有行长差，是优先语义完整的取舍；未把视觉改进自动判为90分。320ms总时间没有延长，连续阅读感受尚未实时观看验证。

工作台21层选择、颜色回读、刷新、手机宽度及定义保持验证通过。交付 /Users/zhengwei/Downloads/checklist-refined-20260930/review.html；初版证据保留。源seed为初版构造样本，修订由独立revision脚本保存，不允许重跑初版脚本覆盖r2。未试听、未检查源波形对齐，仍缺实拍背景和多画幅验收。此修订不增加风格数量；20套90分目标仍未完成。

## 2026-09-30 — 清单实拍应用、负例与已审内容复用

上一轮完成清单r2排版与动效修订，属于进展。本轮保存composition-checklist-advice-20260930 v1“行动建议 · 清单字幕”：逐词字幕加20层清单，使用保存图形r2。清单scale.14、统一依附字幕text_box左侧，gap.015；正文宽.64、中心(.53,.91)、字号38.4。未按人物或单句写坐标。

三份真实视频输入为导师访谈input-cde88118397f50e922df4e606786d79f、Deborah家庭故事和Alex太阳讲解。仅导师的things you need to do（词17–22，3.66–4.68秒）标注行动建议，清单实例1/0/0；其余两份不强加清单。关键词为Agent人工内容判断，图示不表示实际任务完成。全部13句字幕保留。

初批production-d36db0d8968835185a7399563c7ab50e成功。查看关键词全幅、13句中点及事件30fps联系图：清单可辨，依附字幕，所查未遮脸、无退出残留；底字幕明显覆盖导师部分手势，不能判为构图90分。还发现复用了旧Alex短语标注，because/of再次断行；随后改为复用此前已审内容短语11–18，同时保持无清单语义负例。

最终批次production-83bdcaf4bce70622190e8658858c2503成功，使用精确保存模板不变。第一次按baseRevision0提交被版本保护拒绝，重新读取并与已审保存快照一致后使用revision1，未覆盖人改。check-checklist-live.py验证13句、1/0/0、关键词时间及20层、hash/解码/服务音频；check-checklist-live-reuse.py确认输入/词时间/显示分段不变、仅复用内容短语、三段导出PCM同初批。查看最终Alex字幕中点，因果短语不再拆断。

check-checklist-live-audio.py先核对三份原视频SHA，再在每份开头/中段/末段窗口搜索±128采样。九窗最佳延迟均0，零延迟相关性最低.9979278，最大归一化误差.06444；属于重编码/重采样实测，不等同逐样本相同或试听。模板21元素选择、绑定/时机回读、刷新、手机宽度和库其他内容保持检查通过。

最终交付 /Users/zhengwei/Downloads/checklist-live-reviewed-20260930/review.html，初批证据保留。未实时连续观看或试听，尚未解决手势遮挡、多画幅与更多行动建议正例。未授予90分，不增加独立合格模板计数；20套90分目标仍未完成。

## 2026-09-30 — 侧栏保护区实验：位置通过，长句阅读未通过

上一轮完成清单实拍与手势遮挡定位，属于进展。本轮保留直接叠加，捕获并保存style-study-20260930-checklist-sidebar r1“侧栏阅读 · 清单建议”：正文32px、左对齐、宽.24高.30、最多5行；清单依附实际文字上沿。候选中心左(.18,.32)/右(.85,.32)、统一padding.015；保护区来自Agent对三份既有视频的人工审片，涵盖人物/手势与太阳图示，不声称自动检测。

produce-checklist-side-reading.mjs复用同一保存定义及同一policy.json，调用原生placement-advice获得左/左/右。三批production-b1d8dc544339758ba9f84a8d81b29df1、production-7e23d343b759439f1a01cb1d87a4aba5、production-048f62c1a1537a23f81b36751e1a4442均成功。check-checklist-live.py适配单样例计数和上方依附描述；三个样例检查字幕完整、清单1/0/0、事件时间/20图形、hash/解码/服务音频。compare-checklist-side-reading.py验证定义、共同策略、内容标注一致，三段导出PCM与原底字幕版相同。

实际查看导师关键词全幅和全部13句中点：手势不再被字幕覆盖，导师左侧空白处的短提示可读；但Deborah长句变成五行，calculator孤词，Alex长因果短语因列宽过窄再次回退拆开。此处不能以位置不碰撞替代审美通过，也不能将这套侧栏设为通用完整字幕默认。comparison.json明确needs_revision_not_default，未授予90分。侧栏应优先用于短提示；完整字幕需要最小阅读宽度、行数与保护区联合评价，而不只是摆放是否避开矩形。

工作台21层选择、填充回读、刷新、手机宽度和保存定义不变通过。交付 /Users/zhengwei/Downloads/checklist-side-reading-20260930/review.html，保留三组底部/侧栏对照与全部字幕帧。未实时连续观看或试听，保护区为人工静态包络，未证明任意运动主体适配。三种位置是同一策略实例，不新增三款模板；20套90分目标仍未完成。

## 2026-09-30 — 阅读预算进入原生候选建议并复核失败样例

上一轮侧栏实验提供了位置通过但阅读失败的证据，属于进展。本轮扩展rust/templates/placement_advice.rs的可选readingCheck，接收调用方渲染测量样例与maxLines/minFontSizePx预算。Rust校验样例ID、有效数值、文字元素归属及每个文字元素覆盖；任何样例行数过多/字号过小/溢出都拒绝原本几何安全的候选。没有测量时返回not_provided，保留旧几何行为，绝不自动给可读性通过。API schema由原生类型自动更新，MCP工具说明同步；工作台圈选提示明确当前面板只做几何建议，未宣称自动测量已接入面板。

原生placement_advice五项测试通过，覆盖几何兼容、保护区/越界、阅读失败拒绝、三类原因、边界值通过与未知元素拒绝；MCP传输测试通过。构建服务成功。确认生产批次无running/queued任务后，按原机器配置重启本地Rust服务，未修改NAS/模型/凭据。

build-reading-probe.mjs打包实际measureTextElement模块，使用真实opencut wasm初始化而非字体/业务mock；measure-side-reading.mjs在本地Chrome加载实际系统字体，按已导出编译文档测量13句。初次普通打包不支持wasm多输出，改成真实wasm浏览器加载后通过。结果导师六句最多3行，Deborah长句5行，Alex三句4行，最终字号均32px；与此前逐帧审查发现一致。测量为各句中点的静态文字，不含运动缩放、语义判断或实时听看。

verify-side-reading-gate.mjs向实际更新后的API提交共同3行/28px预算。导师返回left+passed；Deborah/Alex返回null+failed，分别列出1和3个too_many_lines样例。省略测量时三者仍选左/左/右且not_provided，明确区分几何与阅读证据；保存素材读取前后完全不变。证据存于Downloads/checklist-side-reading-20260930各子目录reading-measurements/request/advice及reading-gate-verification.json。

该能力让Agent拒绝已证实拥挤的布局，不代表为失败内容自动生成了合格替代方案；预算由调用方指定，服务不能认证测量是否覆盖所有真实内容。未新增90分模板计数，20套90分目标仍未完成。

## 2026-09-30 — 侧栏短句替代方案：空间改善，语义分段待修订

上一轮原生阅读门槛拒绝拥挤布局，属于进展。本轮保持侧栏视觉定义/位置/字号/内容原词不变，为两份失败输入使用共同segmentation策略：maxCharacters42、maxPhraseSeconds3.5、pauseBoundarySeconds.32、maxCharactersPerSecond24、minDisplaySeconds.5，captionSpans留空交由原生自动生成。未延长原声或修改词时间。首次预检32字符/秒超出现有上限，被拒绝后按24字符/秒实际评估，未放宽原生校验。

plan-side-reading-segmentation.mjs预检得到Deborah6个、Alex7个显示单元，保留2/1处reading_speed_exceeds_limit警告。produce-side-reading-segmentation.mjs提交production-cf9716834234ca5ccf23a124ab2b97f5与production-3da0108f9120546469178a61af6794e0，两批成功。check-checklist-live.py支持自动分段的原生plan计数，验证全部文字与无清单负例、hash/解码/服务音频。两份仍为语义负例，不因重分段制造清单。

measure-side-reading.mjs增加输出根和样例索引配置，使用同一真实浏览器测量代码复核13个新显示单元，全部1–3行、字号32px。compare-side-reading-segmentation.mjs核对视觉字段/关系未改、样例只清空显示分段、导出PCM与前版相同；实际readingCheck均passed并仍选左/右。首次PCM比较超出Node默认缓冲，增大到16MiB后正常完成，非音频失败。

实际查看两份全部字幕中点：原来的四五行拥挤消失，手势保持露出。但“out of anything I could / find around the house”和“...longer / sunlight...”被拆到连续显示单元，自动分段的语义边界不足。最短单元.56/.78秒，三处阅读速度警告仍在；不能从行数/字号门槛通过推导阅读体验合格。原生spans目前按停顿、标点、长度与时长分段，不会为layoutPhrases主动移动自动字幕边界；这为后续通用修订提供依据，不能为这些句子硬编码替换。

交付 /Users/zhengwei/Downloads/checklist-side-segmented-20260930/review.html，comparison.json明确needs_semantic_revision。未实时连续观看或试听，未设为默认方案、未评90分、未新增合格模板计数。20套90分目标仍未完成。

## 2026-09-30 — 可选短语保护：通用分段规则与工作台闭环

本轮新增 Rust SegmentationPolicy.preserve_layout_phrases，JSON preserveLayoutPhrases，默认false且省略默认序列化。自动分段按内容layoutPhrases在预算内保留短语整体，尊重硬停顿、说话人、标点、语义单元与时长/字数限制；超限回退，Latin尾词平衡不得拆开已保留短语。显式captionSpans和源词时间不变。业务位于Rust；Web只提供选项并转发标注，MCP描述同步。22项原生rhythm测试、Web类型检查、服务构建通过；无排队生产任务时重启服务。

produce-side-reading-phrases.mjs复用上一版视觉字段与42字/3.5秒预算，仅开启规则及添加内容短语。Deborah标注I could find、my brother's calculator，Alex保留因果短语并增加longer sunlight。相同新标注在选项关闭时仍有layout_phrase_crosses_caption，开启时全部在同一字幕内；没有按具体词句写业务条件。两批production-c792367ad1140839009b4d74b002f68c及production-6cd4b9045ff103ebc5ec5e37c4126e6a成功。

check-checklist-live.py验证字幕完整、无关键词时无装饰、hash/解码/服务音频。真实Chrome文字测量13句均1–3行32px；compare-side-reading-phrases.mjs核对视觉定义和输入词时间一致、导出PCM相同，原生readingCheck passed且仍选左/右。比较脚本首次误从sample读取策略，修正为实际template.segmentation后通过。查看全部13句中点联系图：原跨句短语问题消除，侧栏视觉分量仍偏小，仍有三处速度警告，最短.56/.78秒；空间门槛通过不代表整体效果达标。

verify-phrase-policy-ui.mjs在独立浏览器实际选择Alex输入、标注32–34词、设置共享分段参数、勾选并请求原生计划，核对请求标注与完整短语响应；保存试映内容、刷新恢复后开关/字数仍在，素材库定义未改，页面错误为零。未修改参考工程。

证据与可播放复测页：/Users/zhengwei/Downloads/checklist-side-phrases-20260930/review.html，comparison.json、ui-verification.json及两个样例子目录。未试听、未实时连续观看，未评90分、未设置默认、未新增合格模板计数；20套90分目标仍未完成。

## 2026-09-30 — 侧栏大字视觉实验：40px实测保持，未作为全文默认

上一轮短语保护落地且跨输入验证，属于实际进展。本轮优先视觉分量，将共同侧栏风格从32px/24%栏宽/3px描边改为40px/26%栏宽/2px描边、最多3行、lineHeight1.12，仍左对齐。保存独立候选style-study-20260930-checklist-sidebar-large r1，未覆盖旧候选与参考工程；不是新增合格风格。produce-checklist-reading-scale.mjs三份输入共用左右位置及人工保护区策略，原生选择左/左/右。生产应用使用42字/3.5秒/.32停顿/24字符每秒及短语保护；此分段覆盖在生产模板，未回写素材定义，暂不具备严格应用评审一致性，不提交正式评分。

三批production-1a27e44553b22ca346131e4e4fa159ac、production-03e30095d8a7c3d01115f7a28ea91a1d、production-d0a6809cff7515e163a86de43325a3cf均成功。check-checklist-live.py验证文字完整、关键词清单1/0/0、绑定时间、图形层数、解码与hash。真实Chrome测量共22句全部40px、1–3行，无缩字/溢出；原生readingCheck以最低40px仍passed。compare-checklist-reading-scale.mjs核对三段PCM与前版相同，Deborah/Alex字幕文本与时间完全相同，只变视觉；导师由原6句变为自动9句，单独标明不能当同分段对照。

实际查看全部22句中点与导师关键词30fps联系图、全幅代表帧：更大文字更有视觉分量，保持人物/手势/太阳图示露出；清单依附上方、事件前后消失。但导师分段切换过碎、出现“I would / have stayed”跨句，仍有6处阅读速度警告；另外两份仍2/1处。空间通过不能消除语义/速度不足，侧栏不设为完整字幕默认。下一步应分开完整字幕与侧栏关键词提示的职责，验证共享组合，不继续为每句扩大侧栏或改写时间。

工作台21层选择/填充回读/刷新/手机宽度无溢出、库定义未改通过。可播放前后对照与证据在 /Users/zhengwei/Downloads/checklist-reading-scale-20260930/review.html、comparison.json、ui-verification.json。未试听、未实时连续观看、不评90分、不增加合格模板数量。20套90分目标仍未完成。

## 2026-09-30 — 完整字幕与侧栏重点分层，保持保存应用一致

上一轮大字侧栏实拍发现全文切碎问题，属于进展。本轮produce-checklist-split-roles.mjs从既有底字幕组合构建两个独立角色：headline绑定sentence，底部72%宽、36px、左对齐、最多两行，去掉入场位移和逐词高亮，使连续阅读稳定；side-keyword绑定keyword，左栏27%宽、44px暖黄、最多三行、轻微8px入场，清单20图形依附其实际文字上沿。无keyword的输入不生成重点/清单。声音事件和内容标注沿用输入，不含具体句子的运行时条件。

保存style-study-20260930-checklist-split-roles r1，然后通过其原生application重新投影并生产，未再修改任何视觉/编排字段。第一次production-20fe21eb2279bd76ee446f6febbcb32a使用默认16字/10字符每秒预算，已完成并保留回执。预检发现英语内容应明确输入阅读预算，最终三份sample增加共同captionPolicy（60字、6秒、.32停顿、24字符每秒、短语保护），保持显式captionSpans与所有词时间不变；production-c19390ef3923676f39bd4b2d81380b6a完成。不是因等待重复提交，是修订明确的输入策略。

check-checklist-live.py检查三份完整字幕、清单1/0/0、关键词时间、hash/解码/服务音频。measure-split-roles.mjs真实Chrome字体测量13句正文36px、1–2行，关键词44px、2行，无溢出/缩字；compare-checklist-split-roles.mjs核对原底字幕版所有正文文本/时间完全相同、三份导出PCM相同，并重新从已保存样式投影逐字段比较生产模板，仅允许ID不同，通过。工作台22层选择/属性回读/刷新/手机无溢出/定义不变通过。

实际查看全部13句中点与导师关键词全幅代表帧：主次比全文侧栏清楚，长句恢复连续阅读；但底部字幕仍覆盖部分手势，侧栏装饰仅有一份实拍正例。最终仍有4处速度警告、1处长句字数警告，另两份无重点的提示属预期负例。未授予90分、未设默认，未增加合格模板数量。未试听、未实时连续观看。证据位于 /Users/zhengwei/Downloads/checklist-split-roles-20260930/review.html、comparison.json、ui-verification.json。20套90分目标仍未完成。

## 2026-09-30 — 同一分层样式中文覆盖与80分阶段性评审回写

上一轮完成保存样式与生产应用逐字段一致验证，属于进展。本轮produce-split-roles-speech.mjs复用style-study-20260930-checklist-split-roles r1的同一1280×720应用，使用既有三份本地TTS及当前转写revision，不重新合成、校正或改变源词时间。重点分别完成（0–.32秒）、开始行动（.68–1.60秒）、三个可以完成的小步骤（1.22–3.46秒）。production-fc7e246d55523d18cf0ba197f4b4c2b4成功。

check-checklist-live.py验证全文字幕、清单1/1/1、20图形、hash/解码/服务音频。measure-split-roles.mjs改为根据样例实际keyword数量验证，三份关键词实测44px，1/1/2行；正文36px单行，无缩字与溢出。compare-split-roles-speech.mjs检查关键词起止等于源词时间、PCM与以前同源配音成片相同、保存应用重新投影等于生产模板（仅ID不同）。原生计划三份无警告。

实际查看三份全幅中点和关键词事件30fps联系表；最长联系表显示缩放，未声明逐像素检查。清单跟随不同词宽与两行上沿，退出后不残留。但0.32秒短窗口缺实时阅读验收，10字断为7/3，清单尺寸与表现力仍有限；黑底不能证明实拍适配。

submit-split-roles-speech-review.mjs将该应用阶段性评审写回原生素材评审：构图20/25、动效20/25、素材17/20、适配14/20、编辑性9/10，总分80。meetsInternalThreshold=false，current/evidenceCurrent=true；依据明确仅三份中文音频应用证据，未试听、未实时连续观看，不借用实拍来抬分。短时阅读、长词平衡、复杂背景为阻断项。不是三款新模板，20套90分目标仍未完成。

证据：/Users/zhengwei/Downloads/checklist-split-speech-20260930/review.html，comparison.json、style-review-request/receipt.json。阶段性分数用于保留缺陷与生产证据，不代表用户审美认可或开拍同等质感。

verify-split-roles-review.mjs真实浏览器确认80/100“需完善”、未试听、扣分依据、三份成片播放器及刷新保留。首次两次测试在React折叠区更新前读内容/播放器数量失败，改为等待实际内容与挂载/卸载后通过；没有修改产品逻辑以迁就测试。review-ui-verification.json记录通过结果。

## 2026-09-30 — 分层样式v2：句末停留与清单视觉分量

上一轮中文覆盖与80分评审回写属于进展。本轮先查原生events：minSeconds只诊断/筛选，不会自动延长元素；已有timing.endAnchor可独立设置结束边界。因此无需新增字段，refine-split-roles-hold.mjs在核对保存版本与v1快照完全一致后CAS升级style-study-20260930-checklist-split-roles至r2。所有keyword绑定图层统一endAnchor=cue_end、maxSeconds=3；关键词开始出现、当前字幕末尾退出，不改源声音或正文边界。清单全部图形围绕自身中心放大1.25倍，文字依附offset同步放大，gap保持。长词7/3分行保留语义完整性，未为均衡行长拆开词组。v1的80分属于历史，不继承到r2。

produce-split-roles-speech.mjs增加输出目录、定义路径、样例来源配置，同一r2应用重跑三份中文音频及三份实拍。批次production-38fe2a196b5df8da324018ef66d7268b与production-0d126360a3e0234c833b221d50feea20均成功；后者复用了最初脚本的中文标题/brief（元数据不准确），实际manifest输入、原生编译及审核页明确是实拍；脚本已修正未来按来源标记，不为改标题重复提交生产。

check-split-roles-hold.py依据关联caption与3秒上限验证重点文字、清单组共同起止，字幕完整与关键词负例保持。真实字体测量六份输入正文36px、重点44px无溢出/缩字；compare-split-roles-hold.mjs逐字段核对保存应用投影（仅ID不同）、所有源词/字幕文本/字幕时间相同、六份PCM与v1一致。“完成”从.32秒延长为1.56秒，另外中文两例保持.92/2.24秒；实拍重点从1.02延长为1.90秒，两份无关键词仍不显示装饰。

实际查看中文短/长词全幅、实拍重点全幅及短词/实拍的事件末尾30fps联系图分块：图示更醒目，稳定延续到句末，结束后退出无残留。未检查本轮所有事件的全部连续帧，未试听、未实时连续观看。底部字幕手势遮挡、长词行长不均衡仍在，3秒截断对更长句的主观效果还需覆盖；不评90分、不增加合格模板数。22层工作台选择/填充回读/刷新/手机无溢出通过。

六份可播放结果与比较证据：/Users/zhengwei/Downloads/checklist-split-hold-20260930/review.html、comparison.json，实拍原始证据在checklist-split-hold-live-20260930。20套90分目标仍未完成。

## 2026-09-30 — 内容词组粒度修正，现有通用排版得到4/6长词

上一轮句末停留和1.25倍清单已跨六份输入验证，属于进展。本轮检查fit-region实际算法及输入发现，长词7/3来自layoutPhrases把词5–10（三个可以完成的，7字）与10–13（小步骤，3字）分别绑定；不是均衡算法失效。没有修改模板宽度/字号/时间或全局断行代码。produce-split-lexical-phrases.mjs只把第三份输入标注收敛为完整词语8–9（完成）与10–13（小步骤），给通用词组间均衡留出合法边界；没有插入换行符、改文案或写句子匹配条件。

production-f2f9bb2705bd5d6923b10aad8bd7c61b成功。check-split-roles-hold.py验证三份字幕完整、关键词/清单句末边界、20图形、hash/解码/服务音频。真实Chrome测量第三份关键词为“三个可以 / 完成的小步骤”，4/6、44px；正文36px单行。前两份关键词实测排版完全相同。compare-split-lexical-phrases.mjs逐字段核对保存模板仅ID不同、输入只改第三份layoutPhrases、源词和正文文本/时间不变、三份PCM相同。实际查看最长词全幅，上下行更均衡，清单随实际文字边界重新居中，无裁切。

工作台短语排版说明增加最小必要词组指导，提示把长修饰语绑成一组可能导致行长悬殊；该改动仅文案，没有新业务逻辑。本轮未重新进行UI自动化，未试听、未实时连续观看，也未重新检查所有事件帧。记录为同一样式的内容适配改进，不新增风格、不改变库内r2、不评90分。仍需解决实拍底字幕手势遮挡与更多风格质量验收；20套90分目标未完成。

可播放前后对照：/Users/zhengwei/Downloads/checklist-split-lexical-20260930/review.html，comparison.json与各reading-measurements.json保存证据。

## 2026-09-30 — 回到20套目标的全库证据审计与验收看板

上一轮内容标注粒度修正改善长词排版，属于进展。但连续清单变体不增加独立高质量模板数量。本轮重新执行audit-current-style-delivery.mjs，核验运行服务版本/生产引用及磁盘视频哈希：41活动样式条目、62归档条目；4份当前且证据有效应用评审属于3个样式版本，共13份成片；有效独立样式应用90分达标数为0，38条无当前有效应用评审。旧模板目录20条qualified及60份哈希属原技术合格记录，不追认为当前质感目标完成。

实际读取四份有效评审及阻断项：青色弹字r2应用86/84、青色双笔触r1应用86、观点引号r5应用79。主要缺口为背景竞争、手势遮挡与极短事件实播/听感；未把最高应用分等同整个样式分。清单r2无当前有效评审，r1的80分是历史。

build-style-acceptance-board.mjs显式将41个条目整理为21个设计方向，完整覆盖、无重复，明确分组不证明独立设计验收。看板显示版本、当前应用分数/缺项、真实阻断项及工作台链接；保留库条目不做清理。下一批优先青色强调、双层花字、便签纸面；依据有效评审与现有修复证据，仍需实际复核，不预授90分。21方向卡、41链接及390px无横向溢出通过，查看桌面截图。

本轮属于证据审计和工作组织改进，没有新增模板或重新视觉评分。输出/Users/zhengwei/Downloads/style-acceptance-board-20260930/index.html、board.json与style-delivery-audit-20260930.json；技术说明docs/style-acceptance-audit-2026-09-30.md。20套90分目标仍未完成。

## 2026-09-30 — 青色强调左右候选：避开太阳图的实拍证据

上一轮全库审计纠正达标数量，属于进展。本轮按优先级处理青色弹字r2的已记录视觉阻断项。produce-cyan-protected-placement.mjs保留原保存样式，统一scale .75、中心候选left(.20,.18)/right(.85,.18)、padding .015。保护区为Agent依据画面标注：Deborah人物/手势；Alex人物与太阳图；John头部、躯干手势与下方logo；中文纯音频无保护区。原生建议左/右/左/左，未编写按句子/输入ID选择位置的运行时条件，未声称自动人物检测。

四批production-a847822ad7e3cae852298c33500feb59、production-1b56f2099fff9737c608d8a03ba09dc0、production-7de132e7508b34111e5f3b9e64a4c400、production-2ea6e3ffd319af8c5c1f198c87608c13成功。check-cyan-protected-placement.py核对字体样式、动效、区域尺寸、绑定时机及输入内容一致，只改变位置；16个关键词内容/起止相同，hash/解码/服务音频通过。实际查看四份共16个中点及Alex全幅：右上避开太阳图，未见裁字或遮脸；极短事件的实播阅读仍未验证。

首次旧样片PCM精确相等断言失败，三份实拍新旧PCM不同，中文音频相同。未忽略差异或声称原样本完全不变。check-cyan-source-audio.py下载本地服务原始输入并校验SHA，针对四份源声音各取前/中/后三窗，±128采样搜索最佳延迟。新旧版本所有窗口最佳lag均0；新版最低零延迟相关性.997927788。证明所查窗口没有时间偏移，不证明全程音质相同，也未定位PCM差异原因。本轮没有修改音频代码。

measure-cyan-protected.mjs用真实Chrome字体测量16个词段，1–2行，约40.30–56.25px，无测量溢出；原生readingCheck maxLines2/minFont28四份passed且位置保持。工作台图层选择/填充回读/刷新/手机无横向溢出与保存定义不变通过。保护矩形仍是静态人工包络，中点检查不等于全程动作安全或动效全帧检查。

输出/Users/zhengwei/Downloads/cyan-protected-placement-20260930/review.html，完整位置请求/回执、reading-gate.json、audio-source-verification.json、verification.json保存证据。不同位置是不同应用，不继承旧86分；未试听、未实时连续观看，不评90分、不新增独立模板。下一项仍是极短词窗口与背景适配的动态验收。20套90分目标未完成。

## 2026-09-30 — 青色摆放复测的音频差异定位

上一轮青色左右候选实拍复测通过几何/文字门槛，但新旧实拍导出PCM精确比较不一致。本轮没有掩盖差异：对同一输入原文件分别运行浏览器 `decodeAudioData` 整容器路径与旧的 Mediabunny逐包+OfflineAudioContext路径。四份中中文音频两版PCM完全相同；三份视频中，容器解码长度为308700/617400样本，逐包路径为309248/618106，存在AAC priming/edit-list处理差异。新导出更接近整容器解码：三份N​​RMSE新vs容器 .0142/.0160/.0085，旧vs逐包 .0088/.0208/.0083；差异并非单一固定延迟。源文件SHA通过，四份新导出各取前/中/后三窗的最佳lag均0，零延迟相关性最低.997927788。结论：未发现时序偏移，不能宣称逐样本PCM相同，也没有为迎合旧样片撤回已有整容器解码修复。证据cyan-protected-placement-20260930/decoder-metadata.json、decoder-path-comparison.json、audio-source-verification.json。

这项定位解释了旧新成片哈希/PCM不同的技术原因，但没有完成听感验收；音频路径改动仍需独立回归（尤其AAC视频的长度/编辑列表）。青色样式摆放和视觉结论不因PCM差异自动升分。20套90分目标仍未完成。

## 2026-09-30 — 双层花字r7保护区复用与两层适配缺口

上一轮音频差异诊断提供新证据，本轮转向第二个设计方向双层花字。读取当前r7及旧group-rule对照，保留库定义。复用青色左右保护区策略时，scale .65的双层宽度约.345，Alex左侧碰人物/太阳、右侧越界，原生拒绝。首轮仅Deborah提交，保留offset-protected-placement-20260930回执；未将拒绝当成功。新的全局scale .5四份统一应用选左/右/左/左，未按具体句子改字/时间。

production-2444a2e11a215c6403a9c66b9cb62a4a、production-8f0538236ddede03fc53fa651871c572、production-58cc90eef279d71ade06489b156f009f、production-17e0559be9ccc816f9b3737b1cb502b4均成功。check-offset-protected-placement.py验证16关键词内容/时间与旧r7一致、hash/解码/服务音频；四份PCM与同源最新青色导出完全一致（旧视频解码路径下三份不同仍保留记录）。工作台两个叶层选择、填充、刷新与手机无横向溢出通过，保存r7未变。

measure-offset-protected.mjs真实Chrome测量32个文字层：1–2行、约42.86–50px、无测量溢出。layer-fit-comparison.json发现两层字号在部分事件不同（约45.09与42.86），相同内容两层目前独立适配，可能影响偏移轮廓一致性；未因无溢出而授予合格。查看Alex四个中点和中文五个中点，已避开太阳与脸，白主字/粉偏移区别于青色单层；中文长词的层间轮廓仍需要进一步全幅放大与共同测量规则检查。未查看所有动态帧、未试听、未实时连续观看。

输出/Users/zhengwei/Downloads/offset-protected-fit-20260930/review.html及各项测量/事件/PCM证据。相同风格的摆放变体不新增模板，不打90分。下一步优先处理双层文字共同适配，保留可编辑两层与同组透明度。20套90分目标仍未完成。

## 2026-09-30 — 双层花字r8统一描边预算，16事件字号一致

上一轮发现双层11/16事件字号不一致，属于进展。本轮查实际保存参数与measureTextElement确认描边参与区域测量：主字3.5px、粉底6px导致独立适配字号不同。refine-offset-fit.mjs在核对当前r7与前轮快照相同后CAS升级r8，仅将粉底描边宽度与主字一致；未改文字、区域、字体/字号、偏移、旋转、组透明度或事件时间。没有新增跨层业务模型或声称通用共享测量已实现。

四批production-2f897439cefcf513c6294a48dced69d9、production-e03660865243b510846ab088e021e165、production-6d22b3c6fc6d16123a918088688eb860、production-78f9f6fd9d4b380860b2a1dce3c329f1成功。measure-offset-equal-fit.mjs实际Chrome测量32层；verify-offset-equal-fit.mjs验证16事件两层字号与换行完全一致、无溢出，字号45.09–50px，同时逐字段核对样例/元素/编排不变，style仅底层strokeWidth变化。工作台两个叶层选择/填充回读/刷新/手机宽度/定义不变通过。

check-offset-equal-fit.py验证16关键词内容/时机、hash/解码/服务音频，四份PCM与同源最新青色版本完全一致。查看中文最长词全幅和Alex四处中点：白字粉偏移仍可区分，长词轮廓对齐改善，右上避开太阳与面部。未检查所有动态帧、未试听、未实时连续观看；极短词、其他画幅与更复杂背景仍待验收。不授予90分、不增加独立风格计数。

输出/Users/zhengwei/Downloads/offset-equal-fit-20260930/review.html、paired-fit-verification.json及各reading-measurements.json。对照页保留旧r7原左上应用，所以画面对比同时含位置/尺寸变化；严格的仅描边变化证据以paired-fit-verification和前轮offset-protected-fit的相同应用为准。20套90分目标未完成。

## 2026-09-30 — 双层花字r8动态证据补齐

上一轮两层预算一致修复已验证，属于进展。本轮check-offset-event-motion.py核对四份当前导出SHA、16个事件均有两层共同起止、叶层不重复opacity、组从1到0且末尾60ms淡出。生成所有事件前后各两帧的30fps候选区域联系表，并记录视频SHA与帧数量。没有重新生产、改动保存样式或音频。

实际查看最短December完整边界联系表及四份共16个事件的入场/中点/退场三阶段裁切：所查未见跳行、两层脱离或粉底单独残留。December总.36秒、全不透明.30秒；这不是静止持有时长，原120ms缩放旋转仍在，未据此声称实际阅读合格。其余完整联系表已生成但未全数逐帧查看，非实时连续观看/试听，不能从自动验证推导90分。

新增/Users/zhengwei/Downloads/offset-equal-fit-20260930/motion-review.html，四份可播放视频、三阶段图及每事件完整联系表可展开；motion-verification.json关联实际哈希与时机。保留20套90分目标，未增加合格模板数。下一步需要在不损害声音触发准确性的前提下解决极短词阅读窗口，并继续便签风格当前版本验证。

## 2026-09-30：便签以统一规则复测，未新增合格款数

- `style-study-20260924-note` r5→r6：前景和纸影文字统一左对齐，保留字体、纸面留白、胶带依附和词事件时机。修改前快照及CAS迁移脚本保存在 Downloads/note-rules-20260930。
- 增加配置驱动复测脚本 `scripts/templates/produce-style-rule-review.mjs`，复用Rust位置建议/投影/生产。输入保护区与样式分离，四样例共享scale .5及左右候选，得到左/右/右/左。保护区是人工标注，不是自动识别。
- 四批 production-d50eea9437cf7754d98ffc304ec23741、production-971af8dad9e71da96a8e9be962f9d266、production-cdaad8b987cc5c2cfffe3ecac4f96a64、production-a79290a227139c7c56dbe9d176245abf 均succeeded，视频SHA校验通过，内容及事件时间与r5一致，音轨解码PCM与当前同源青色导出相同。
- 真浏览器实测16组前景/底层排版：字号40.8695–42px、1–2行、无溢出，前后层字号/换行一致。工作台3层可选择，刷新后保持，390px无页面溢出，未改变已保存定义。
- 实际查看四张三阶段抽帧表（16事件各入场/中点/出场），所查帧太阳图、标识及人物保持可见，左对齐与胶带纸面关系一致。没有实时连续观看或试听；抽帧不保证所有运动时刻安全。
- 画面判断：便签适合边角批注，中文纯音频黑底仍空，不能把装饰本身技术通过当完整成片质量。未评分、未计入90分模板数，20款目标仍未完成。
- 证据：`/Users/zhengwei/Downloads/note-rules-20260930/review.html`，同目录verification.json、fit-verification.json、ui-verification.json。仅验证脚本及数据改动，未运行无关全仓测试。

## 2026-09-30：便签r7统一材质退场

- r6→r7：纸面、纸影与胶带使用已有composite分组，separateInstances按关键词独立生成。组上单一30ms透明度退场，胶带局部透明度固定.9；70ms入场位移/旋转、字样、词时间和位置不变。没有新建专用材质字段。
- 4种合成预览时长通过编译检查；检查中发现原生关键帧会插入帧采样点，验证修正为取最后一个value=1的关键帧，未修改运行时淡出行为。
- 四批 production-359dd99723c5ece68fc4e4532e1e46ba、production-f72e9f65f3a40bb542a18474c4a595b8、production-66014866b9dafc04b0330ffc3805b01d、production-dcae0fd102513ce42a60dcf37273dfd2 导出成功。16个独立三层组，非透明度运动关键帧、内容及时间与r6一致，音轨PCM与当前同源版本一致，视频SHA核实。
- `check-note-group-motion.mjs`验证上述组与时间约束；实际浏览器32文字层测量无溢出，40.8695–42px、1–2行。工作台3层选择、刷新、移动端宽度验证通过。
- 已查看4张三阶段抽帧表；合成后退场保持纸面与纸影的遮挡关系。未实时连续观看或试听。此改动是材质细节修正，不是新的独立风格，不授予90分，不解决中文纯音频场景画面空的问题。
- 证据 `/Users/zhengwei/Downloads/note-group-20260930/review.html`，含4视频、全部16事件三阶段帧及同目录验证报告。20款90分目标仍未完成。

## 2026-09-30：便签r7动态边界及右上应用83分阶段评审

- 前一轮已改变保存样式并验证，属于进展。本轮补生成r7全部16事件的30fps边角帧表（包含事件前后2帧），核对视频SHA；实际查看December、home planet和中文最长词三个完整帧表。未见这三个事件中的分层错位或退场残留。December总时长.36秒、全不透明.33秒，阅读机会偏紧；不将全不透明时间误称为全静止。
- 发现原四样例拆在两个位置，不能合并作为单一Application评审证据。补生产同一右上应用三输入批次 production-0e7f734bd12eb7bfbaf5ad82e3da80e4，成功导出3片13事件，SHA/输入内容/词时间/同源PCM检查通过。实际查看当前三片全部事件的三阶段全幅帧。
- 保存阶段评审 style-review-acb777b141f701821d743b1f4ec0ab1d13d494e62014d0e45c8d833dc5941f90：构图22/25、动效21/25、素材16/20、适配15/20、编辑性9/10，共83分，不达标。回读current与evidenceCurrent均true。只适用于r7的1280×720、scale .5、center(.85,.18)，不是风格全局评分。
- 阻断依据：纸面/胶带造型简单、材质细节不足；最短词阅读偏紧且未完成连续观片、试听和中文实拍适配。纯音频黑底仅验证文字适配，不算完整成片。下一步应改善视觉材质/短事件节奏，而非继续堆叠参数或将位置变体计为新风格。
- 证据：Downloads/note-group-20260930/motion-review.html；Downloads/note-right-review-20260930/review.html及style-review-request/receipt.json。没有新增90分款，20款目标仍未完成。

## 2026-09-30：便签r8材质候选与多级依附修复

- 当前样式由r7升级r8：纸影偏移缩小、局部透明度.35，胶带增加两条可编辑高光。纸面仍是平面图形，不冒称扫描材质。关键词时机与组淡出保持不变，r7的83分不继承。
- 首批 production-b27cae9238bea7c85bec5d12b81d7eec 虽成功导出，但实际对照发现高光漂移，不通过视觉验收。失败证据保留在 Downloads/note-material-20260930。
- 定位并修复Rust `relationships::text_attachments`：直接text_box关系的实测位置修正未沿后续layout/followMotion关系传递。现在多级图形跟随者继承确切上游文字实例与锚点绑定；不引入文案或坐标特判，关闭followMotion则不传递。新增回归覆盖乱序三级关系、重复时间实例、禁用跟随。35项composition测试及7项attachment筛选测试通过（其中有重叠），cargo build通过。
- 确认没有running/queued任务后重启本地Rust服务，现进程1106，日志 /tmp/moirai-footage-attachment-chain-20260930.log，/api/footage/state恢复。第一次nohup启动未存活，随后用独立会话启动；未重复配置凭据。
- 修复后批次 production-144abebf7f8578c975f59fa8fba7a0bf：三片成功，SHA/解码/同源PCM通过，13事件每组5层，同一时段、30ms组退场、主文字内容和时机不变。检查三张完整关键词中点前后对照（r7左、r8右）：13段高光均位于胶带上，厚重底边减轻。未全时刻逐帧验收或试听。
- 工作台5层可分别选择、刷新保留、390px无页面溢出。UI截图捕获时效果仍在更新，只能证明属性选择状态，不能作为预览已完成证据。
- 最终证据 /Users/zhengwei/Downloads/note-material-fixed-20260930/review.html；初次失败与修复后分开保留。当前r8未评分，短词阅读偏紧、图形材质辨识度和连续听看验收仍待完善；未新增90分款。

## 2026-09-30：0.8秒最短停留实验及相邻重点边界

- 先验证cue_end：它不能延长句末December(.36秒)，只延长部分句中词，因此未改保存样式。
- 复用模板visualRhythm.minDisplaySeconds=.8，生产三输入编排候选 production-fbf97a6a561fecd7a230c21f616ebbbb；不是新的独立风格，不冒称原Application投影一致。r8定义没有变。
- 三片13事件中5段延长：December .36→.8、home planet .6→.8、study the Earth .72→.8、十分钟 .66→.8、感兴趣 .78→.8；其余保持。5层同步，内容/源词时间不变，音轨PCM与同源导出一致、SHA核实、没有相邻关键词重叠。
- Rust events.rs补齐最短阅读停留的下一关键词边界，额外延长不创造跨词重叠。新增回归验证紧邻事件、片尾、显式event_end优先及时间偏移。36项composition测试通过，binary build成功。
- 首次成片使用原minDisplay逻辑，该三输入本身不触发相邻边界。待任务全部完成且无活跃队列后重启至修复服务（PID5550，日志/tmp/moirai-footage-reading-hold-20260930.log），逐事件回读live plan与已导出时间完全一致；新边界另由回归测试验证。
- 实际检查最短词1.267–2.267秒的30fps完整边角帧表，以及另两片全部词段三阶段全幅帧。未连续实时观看或试听，未给该编排候选打分，不计入20款90分目标。
- 证据 /Users/zhengwei/Downloads/note-reading-hold-20260930/review.html、hold-verification.json及manifest.json。minDisplay只提供更多阅读机会，密集事件和其他构图仍需验证。

## 2026-09-30：密集重点与无重点负例完成实际导出

- 前一轮推进原生停留规则与真实成片，属于进展。本轮同一r8视觉、0.8秒模板策略增加两个边界样例，批次 production-741ac10a1abb24819f6528eace727957，导出成功。
- 密集中文样例从原测得的词中标注两个完整动作“读完／写下一句话”，语义与字幕范围同时拆到同一边界；未更改任何源词时间。最初字幕跨新语义边界被服务正确拒绝，修正样例标注后提交。此为压力样例，不作为推荐重点密度。
- 6组各5层；读完6.66–7.04秒（.38秒），后句7.04–8.18秒。最短停留被下一关键词限制，无相邻重叠、无组混合。实际查看6.567–7.267秒30fps完整局部帧表，前后两个便签及其细节同步切换，未见残留。
- 无重点负例显式keyword=null、neutral，输出overlay为空、0个组，原片主轨存在。两份源词时间保持、PCM与对应原版一致，SHA/解码检查通过。未试听或实时连续观看。
- Web“最短展示”改称“目标最短展示”，说明利用词后空隙、下一关键词/上限/片尾提前结束及显式边界优先。`bun run typecheck:web`通过。这里只改文案，没有新建或改变字段。
- 证据 /Users/zhengwei/Downloads/note-boundaries-20260930/review.html 与verification.json。没有追加审美分数；此证据证明边界执行，不保证密集重点好看，仍不计入90分款。

## 2026-09-30：奶油底签r7跨输入候选

- 从便签转向另一既有设计方向。最初按旧称谓称为荧光标记，读取当前定义确认已是“阅读强调·奶油底签”，本轮沿用阅读底签方向，不称为笔触复刻。
- style-pilot-20260923-adaptive r6→r7仅增加背景圆角20（短边半径百分比），保留字体、左对齐、颜色、40ms入退场。共用位置策略scale .55、左右候选(.20,.18)/(.85,.18)，四输入人工保护区得到左/右/左/左；相对原scale .65是可读性与避让的取舍，不把移位当新设计。
- 四批 production-7de745ad87fbe2bcbc5759b8767fc835、production-8876a6fa17c6b0cea7073ba136414b53、production-5407756fb9f6e0958c8f4946cda856c1、production-ba848f22ac9e32970bb2875f3bc2a562 均导出成功。源输入、16词段内容与时间同原r6，SHA/解码验证、PCM同当前同源导出。未继承旧评分。
- 浏览器实测16文本全部37.4px、1–2行、无溢出，工作台图层选择/填充值/刷新/390px宽度通过。实际查看四份全部关键词入场、中点、出场全幅帧表，太阳图避开，长词底签与文字匹配；未试听或实时连续观看。
- 画面结论：适合克制的边角注释，缩小后视觉力度偏弱，轻圆角并未带来足够设计辨识度。当前未评分，不新增90分款，20款目标仍未完成。下一步应在可读字号与画面信息保留之间找更好的统一构图，而非继续缩小以获取几何通过。
- 证据 /Users/zhengwei/Downloads/cream-rules-20260930/review.html，原图对照位于 reading-left-align-real-20260929/adaptive。此次仅样式数据/验证产物，无运行时代码变化。

## 2026-09-30：奶油底签恢复阅读分量

- 同一保存r7，应用scale .65 + textWidths.headline .24，保留同一左右候选。四输入得到左/右/右/左；不再靠整体缩小至.55换取几何通过。
- 四批 production-ff073c15839ff9a2235195552206a556、production-98ba61d1db07e227007e23dad73ac429、production-6a642df9813bb02c35b2a1cc358e99a4、production-385a2e2d007f12402a5fef8145afef43 成功导出。16事件内容/时间不变、SHA/解码验证通过、PCM同当前同源导出。
- 实测16段均44.2px、1–2行、无溢出，相比37.4px提升约18%。以maxLines2/minFontSize40送回原生readingCheck后位置建议仍通过。已查看全部事件三阶段全幅帧，长词依靠换行收紧宽度，太阳图与左侧标识保留；未连续观片或试听。
- 浏览器试映验证独立行宽.24与scale .65传入原生应用，刷新恢复控件数值，库中定义前后相同。无新增样式或评分，短词节奏与最终审美验收仍未完成，不计90分款。
- 证据 /Users/zhengwei/Downloads/cream-readable-width-20260930/review.html、reading-verification.json、ui-width-verification.json。此轮为应用参数与效果验证，没有新增运行时逻辑。

## 2026-09-30 灯泡花字跨内容验证与统一动效收紧

上一轮完成设计标准整理及已有帧复查，本轮完成真实保存与两批成片对照。`style-study-20260929-bulb-headline` r1→r2，所有17个叶层与组 treatment 的 enterSeconds 从 .12 改为 .08、exitSeconds 从 .06 改为 .03；定义差异检查确认除 revision 和这两个相位字段外无变化。未增加专用字段或逐句布局补丁。

共同应用1280×720、scale .55、center(.82,.30)、textWidths.headline .28。输入为 John 实拍的学习短语与已有三份本地中文配音，均使用原有实测词时间；没有修改转写或参考工程。旧批次 production-548b6295dce91d8f9f30db1c597ca91a，新批次 production-e4bde693a1e04395d6dbf9e538bb715c，均四份导出成功。

四份实测均46.2px，行数2/1/1/2；关键词时长1.38/.34/.74/1.84秒，词内容与起止时间保持，17叶层保持可编辑，服务解码/音频校验及文件哈希通过。新旧导出PCM逐份完全相同。工作台17层选择、填充回读、刷新、390px无横向溢出及无页面异常检查通过，检查未修改库定义。

已查看实拍稳定全幅、中文短词/长词事件联系图和四份r1/r2入退场局部对照。r2更早完成入场，较晚开始淡出；所查帧图文关系保持。实拍代表帧未挡人脸；只有一份实际背景，不能视为跨背景保护验证。抽帧对照工具改用显式帧号和fps_mode=vfr，避免接近片尾的时间seek无帧，以及select输出同步补帧导致误判。最终对照为 *-motion-vfr.jpg。

证据 /Users/zhengwei/Downloads/bulb-cross-snappy-20260930/review.html；基线在 bulb-cross-input-20260930。未连续实时观片、未试听、未授予90分。此为原有灯泡风格优化，不新增独立合格模板数；20套90分目标仍未完成。

## 2026-10-07 灯泡花字实拍适配及边缘留白

继续上次已提交的三个批次，经API确认全部succeeded后读取现有成片，没有重建或重复提交原批次。bulb-backgrounds-20260930中两份有重点词的实拍与一个无重点词负例通过：0/1/1组，正例各17叶层，原词时间和样式r2不变，解码/服务音频/哈希检查通过。正例实测46.2px、1/2行；实际查看稳定全幅及两个完整事件30fps局部联系图。无重点负例不产生花字或图标。两个正例均为紫色展板背景，不能称为明暗背景充分覆盖。

长因果词段的右边留白偏紧。28%行宽→26%的首次候选仅把长词缩至45.69px，视觉改善小，保留失败对照bulb-safe-margin-20261007。最终候选统一24%行宽，右候选centerX .85→.84；其他视觉、声音、内容和时机保持。使用原生placement-advice及同一人工保护区选择左/右/右，不是自动画面检测。

最终三个批次 production-84c2e16ba9d2404524e6e7f3338996f9、production-03ce34247cb2ca41eb826dac4da9a773、production-81d770f48a3457c1b388883ae14d6f2d 全部成功。短词仍46.2px，长词42.1299px、两行，无溢出；实测数据送回原生readingCheck，以40px/最多两行为门槛通过。无重点负例没有文本，阅读测量不适用，不能传空samples作为通过。最终与原基线三份PCM逐份完全一致。

查看最终长词稳定全幅、两个正例完整事件联系图：留白改善，所查无裁切、压人脸、太阳图覆盖或退出残留。此次为应用配置迭代，样式库仍r2，不冒称全局默认已修改。可复现配置、成片与前后对照：/Users/zhengwei/Downloads/bulb-safe-margin-v2-20261007/review.html。未试听、未连续实时观片、未授予90分，不增加独立合格模板数。20款90分目标仍未完成。

## 2026-10-07 泛化优先与单例 Agent 调整的职责明确

按用户最新要求新增 docs/template-generalization-policy.md，并接入模板生产 Skill、生产文档和效果规则入口。模板保存视觉不变量、适配约束与降级规则；Agent可按单个case调整输入标注、位置、行宽、比例和装饰取舍，不自动修改库默认。个案适配与通用设计缺陷、底层契约错误分别处理。泛化验证冻结模板，在未参与调参的新输入上允许约束内调整，记录效果、调整成本与失败。此前固定参数实验保留为历史证据，不再作为所有输入必须同参数的要求。

本轮为创作规则与Agent入口更新，未声称新增自动识别、原生策略字段或合格模板。模板效果及20款90分验收仍待持续推进。

## 2026-10-07 模板使用指南原生与工作台接通

新增可选definition.usageGuide六部分，Rust校验非空且各最多4000字符，schema/MCP同源暴露。工作台应用规则页支持读取、编辑、移除、未保存状态及原保存流程；旧定义缺省兼容。65项动态素材测试、Web类型检查和MCP传输测试通过。确认无活跃任务后服务更新，PID12416。

灯泡r2→r3只新增具体使用指南。真实API保存/回读成功；定义其他字段不变，inspect投影仅revision改变。Application请求包含版本，因此生成的trial ID也变化，不能将ID差异误判为视觉变化。工作台读取、临时编辑后恢复、刷新、390px无横向溢出验证通过；UI保存尚未实测，API保存已实测。证据Downloads/template-usage-guide-20261007。指南是建议，不是强制策略引擎。

完整后续范围保存在docs/template-module-completion.md，包括Agent应用记录/恢复、逐款指南、素材与分析、新输入效果验收和20款90分目标，本轮不宣称整体完成。

## 2026-10-07 执行目标及模板库指南审计

新增 `docs/template-completion-goal.md`，将剩余工作分为模板规则、Agent应用追溯、工作台边界、分析可信度、素材设计、新输入泛化和20款质量交付七项目标。应用目标系统仍保存旧blocked目标，新建因存在未完成目标被拒绝；不伪造旧目标完成，按仓库目标继续执行。

实时库有103条动态定义（41活动、62归档），活动条目整理为20个候选方向，不能等同20款合格设计。灯泡r3已有指南；另外40份按当前绑定、图层关系和风格起草的指南已通过原生inspect与回读，未保存库，未作新的效果评价。库前后快照一致，证据 `Downloads/template-completion-20261007/guide-draft-verification.json`；逐款清单见 `docs/template-guide-inventory-20261007.md`。

素材记录为42张图片、6段视频，没有新增AI生成验收证据。扫描342条生产记录并核对转写后，发现数个新inputId实际仍为旧人物与同源裁片，不能声称全新背景或盲测。已整理相对单款风格的新内容候选，真正不同实拍背景仍需从已授权本地素材中选择。此审计没有新增90分款或新的成片证据。

## 2026-10-07 单次应用历史、Agent接口与标准工作台恢复

Rust新增不可变应用记录与恢复接口，保存主样式/叠加、完整Sample、保护区、版本快照、调整原因、差异及证据。每个context采用父记录CAS；保存与恢复各自幂等，恢复事务先保留current。记录过期可读，但拒绝保存/恢复过期解释。恢复返回目标参数和投影，不写模板库或项目。状态明确 `qualityVerified:false`、`sourceFilesVerified:false`，没有冒称源文件重新验真或视觉评分。

MCP新增列表、读取、保存、恢复四个透传工具，模板生产Skill已接入调用协议。6项Rust回归、2项MCP相关测试、Web类型及2项session检查通过。确认没有运行/排队任务后构建并更新本地Rust服务，PID23744，日志 `/tmp/moirai-footage-application-history-20261007.log`。

真实API保存基线→调整→备份当前并恢复，通过重复请求无重复记录、父链与源样式不变检查。证据 `Downloads/template-completion-20261007/history-verification.json`。真实Web试映保存完整标注与保护区，调整字号/关键词后恢复，核对备份保留未存变化、恢复后继续保存、转写草稿阻止恢复、并发冲突保留本地编辑和390px无横向溢出。应用历史默认折叠，文案区分“保存样式新版本”与“本次应用”；证据 `Downloads/application-history-ui-20261007/verification.json` 与 `boundary-verification.json`。

当前Web恢复只覆盖面板可完整表示的配置；自定义画布/主区域、内容变量、独立声音/时间事件、译文及按设计绑定素材保持完整可读，预先禁用恢复并说明Agent原生路径。最后交叉审查发现特殊placement+transform、禁用素材绑定与旧uiState覆盖字幕分段三项边界，已修复：无法完整还原的组合提前只读；非空权威字幕分段不被旧UI提示覆盖；不透明uiState经结构检查再使用。另补叠加placement为空的严格适配限制，避免静默改成完整区域容纳。

修复后Web类型检查通过，6项恢复能力回归加2项session测试共8项/34断言通过。浏览器用隔离的模拟历史列表检查5种边界，四种不支持记录均禁用恢复，异常uiState不崩溃，0次history POST、0页面错误。此边界测试明确 `historyTransportMocked:true`，不冒称真实持久化；真实原生主流程证据仍为前述verification.json。边界报告和脚本在 `Downloads/application-history-ui-20261007/restore-capability-verification.json` 与 `check-restore-capabilities.mjs`。

本阶段完成应用追溯基础与真实标准工作台路径，尚未执行新输入的完整“分析→效果检查→返修/替换”循环，没有新增成片评分、连续观片或试听。20款90分目标仍未完成。

## 2026-10-07 目标恢复运行，40份逐款指南正式写回

用户恢复目标模式后，原生get_goal回读active。继续完整的模板/Agent/工作台/素材/泛化/20款验收目标，不以之前的目标工具恢复限制作为阻断。

对40份缺省指南逐定义核对并CAS保存，起始41条活动定义现均具备完整六部分指南，灯泡r3保持原样。纠正了草稿中literal与title绑定混淆、active_word与语义重点混淆、无字图标宣传文字行宽、两种增长造型与时钟组退场差异等实际问题。各定义仅usageGuide/revision变化，40份原生投影仅revision变化，回读准确；原有62归档和63非目标定义保持，期间QA新增单独登记。根任务再次回读40个新revision及灯泡冻结值通过。

正式版本表和具体指南边界见 `docs/template-guide-publication-20261007.md`；前后定义、CAS/幂等回执和投影对照在 `Downloads/template-guides-published-20261007`。仅指南更新也产生新revision，旧4份有效应用评审已成为历史，未继承分数；当前库没有新的当前90分记录。规则文字完成不等于效果完成。

## 2026-10-07 长词新内容的Agent真实返修与语义负例

冻结灯泡 `style-study-20260929-bulb-headline` r3，使用Liz35–53秒输入 `input-ef94e29df6efd4b938a61038a2756cc0` r1，在未参与本灯泡样式调参的词段“answers to research questions”上执行单次应用。人物/布景在其他实验出现过，不称全库盲测或全新背景。源SHA核实，关键词及保护区来自Agent读取保存转写与查看源帧，非自动检测；短语使用真实wordSpan[10,12)，不制造词时间。

原右侧候选与人物保护区冲突，原生建议选择左上(.22,.22)。24%行宽第一次生产 `production-8549edf69f1afdea8e682f4a22a9839d` 导出成功，但真实Chrome文字测量33.3899px，低于指南40px预算，原生readingCheck失败。保留失败证据，仅本次应用行宽改为34%，生产 `production-777b346e0da2bfeced7d873a89b7b5f9`；测量恢复46.2px，2行、无溢出，readingCheck通过。重新由当前源码构建测量器后两份测量相同，保存bundle SHA。不改变模板默认比例/造型/动效。

两份具体Application重新原生投影与生产模板完全相符；关键词仍为3.64–6.18秒，17个可编辑叶层，原转写词/时间保持。成片SHA、服务解码及音频技术校验通过，两版本全段解码PCM逐样本相同。实际查看两份4.8秒全幅，第二个Agent另看完整关键词事件82张30fps局部帧（3.567–6.267秒）：未见裁字、人物侵入所查ROI、图标漂移或退出残留。第二行较宽，左边距约画宽6%，只有足够空白区才适用；细光芒小屏辨识和数帧入退场的连续观感仍待评价，未试听、未连续实时观片、未授予90分。

基线→选位→测量失败返修→验证结果共4条真实不可变历史，context `bulb-liz-research-20261007-v1`，根任务最终回读4条均restorable。完整原因、源限制和失败/成功证据保持在历史，不将34%行宽写回通用模板。报告 `Downloads/agent-application-loop-20261007/review.html` 包含前后成片、全幅对照和动作证据。

另选白衣讲台 `input-243f5008f62ad955f94e4ced4b429e73` r2，Agent读取原文并查看七张源帧后判断“内容价值/专业能力/信任”未出现明确灵感转折，原片已有重点及双语字幕，保留keyword=null。真实批次 `production-b1be666ee7975b05333089ee8b5c588e` 按源3:4画幅720×960导出，编译无overlay，源词/时间不变、SHA/解码/服务音频校验通过，实际查看4秒成片帧。此为不同画面上的选择负例，不能替代该背景的花字正例验收，也不计新增风格。记录位于同报告negative目录。

对已授权本地素材另检查9份源视频、117张抽帧，找出用户中文暖房原片和白衣讲台等不同背景的候选。两者有烧录字幕，只作为保留原片信息的叠加/选择检查；Sudha虽未导入但仍同NIOSH布景，不伪称独立背景。候选词范围、ASR时刻、来源SHA、手工保护建议和既往使用说明在 `Downloads/template-new-backgrounds-20261007/candidate-plan.json`。未上传视频、未调用付费模型或修改原参考工程。

## 2026-10-07 工作台素材默认/替换/禁用完整闭环

ProductionCreate由assetId字符串改为完整ResourceBinding界面状态，明确三态“沿用模板默认／替换素材／本次禁用”。显式enabled:false不再被filter丢弃，实时预览、自动session、JSON导入导出、应用历史保存/备份/恢复及试产共用完整对象；无替换素材时保留未完成表单提示。已移除这一项历史恢复只读限制，其他未实现配置仍不静默丢字段。

Web类型检查、11项测试/44断言通过。隔离QA样式和新的本地1.805秒配音实际走过默认图像→禁用→替换→从历史恢复禁用，并核对备份保留未保存替换；JSON导入、刷新后仍禁用。批次 `production-b05ff5b8e959fa241d3abc192c7eb923` 实际导出无默认图片，代表帧已检查。必需槽案例仅注入未保存投影变体，真实Rust sample-preview返回required resource missing并在UI展示；未mock原生校验。QA样式已归档，原样式不改，不计质量交付。

证据 `Downloads/resource-binding-ui-20261007/verification.json` 与 `required-native-rejection.json`，导出 `disabled-export.mp4`。此轮未跑无关全仓测试，未宣称试听或美学通过。整体目标保持active，尚需更多不同背景正例、实质素材/设计丰富度、其它高级编辑能力以及20款当前应用≥90的完整证据。

## 2026-10-07：质量门槛与工作台执行规则继续收口

最短显示时长已作为通用执行字段完成四级组合：模板默认、图层覆盖、主应用覆盖、叠加应用覆盖。它只控制关键词事件的目标最短展示机会，下一关键词、片尾、显式边界和上限仍优先；不修改声音词时间，也不把整套视觉节奏塞进叶层。Definition、试映、URL/session、JSON、历史备份/恢复和再次保存均保留字段缺省与显式值，Rust 越界拒绝，21项测试/106断言和 Web 类型检查通过。证据 `/Users/zhengwei/Downloads/min-display-ui-20261007/verification.json`。

当前库中20个 `collection-*` 方向存在版本匹配的内部评分90–92记录，但 `aestheticQualityVerified=false` 且 `listened=false`；它们的状态是“内部评分达标/待最终审美验收”，不是最终20款交付。工作台质量摘要新增 `aestheticQualityVerified` 并把内部评分、试听、最终审美状态分开显示。时钟 r6 是本轮首个91分内部评审样式，已覆盖7个真实输入并保留密集词/无语义负例，仍需最终审美确认。任何后续样式评分都必须绑定当前 revision、具体 Application、三份以上实际成片和明确检查范围，不能继承旧 revision 或用技术导出替代视听。

引号 candidate A 沿用 r8 的未保存候选约束，在真实房间视频上做了一次应用级验证。上方大引号和纸卡层级比 r8 的双侧引号清楚，但收尾引号与短线落入脸部/头发保护区，且纸卡重复原片烧录的同一句字幕；66.1秒原字幕切行时重复阅读更明显。该批次 `production-2549fc007e2a32ebff3d9af38d784405` 作为 `skip-for-room` 拒绝实验保留，未写回模板、未改变 r8 的82分，也没有把位置特判抽象成通用规则。对下一步的要求是换用没有重复烧录字的真实画面后再决定是否保存新 revision。

学习插画 r3 的完整拆层报告见 `docs/template-learning-design-20261007.md`。8个资源层、真实生产、负例画幅修正和工作台选中/替换/恢复已通过，但目前仍属于编辑性和素材来源验证；浅色背景细节、连续动效和真实横竖背景的最终审美尚未通过，不增加90分模板数量。

candidate A 另在 Deborah 与 Alex 两个真实画面上完成未保存应用级对照：`/Users/zhengwei/Downloads/quotation-design-20261007/candidates/topmark-a-real/assessment.json`。两份成片分别得到约53px两行和45.6px单行，开头引号、纸卡、收尾引号与细线在抽查的入场/稳定/退场帧中保持层级并避开人物；这支持继续做独立新 revision，但不继承 r8 的82分，也尚未构成正式评分。room 的重复烧录字幕和脸部冲突仍按前述 skip 处理。

## 2026-10-07：引号花字 candidate A r9 应用评审，未达到门槛

candidate A 已从 `style-study-20260928-quotation` 保存为 revision 9，保留 revision 8 及其历史 82/100 评审。r9 增加上方大号 Georgia 开引号、下方收尾引号和两条短细线，共 5 个可编辑元素、4 条空间关系，并用 root group 统一进退场动画；没有把单个画面的坐标或避让结果写回通用模板。保存回执与实时定义分别位于 `/Users/zhengwei/Downloads/quotation-design-20261007/candidates/topmark-a/save-r9-receipt.json` 和 `definition-r9-live.json`。

使用统一 Application（1280×720、scale .70、centerX .215、centerY .43、headline 行宽 .30）对 Deborah 英语实拍、Alex 英语实拍和中文真实配音黑底样本进行生产，批次为 `production-45d551555c73c33211d56d9755fc62a8`。独立评审 `style-review-643bf4849d38c683a236649d210841c9a1fba4e525bd168ab93e37217e7771bf` 回读 `current=true`、`evidenceCurrent=true`、`listened=false`、`meetsInternalThreshold=false`，分项为构图 22/25、动效 21/25、素材 18/20、适配 17/20、编辑性 10/10，总计 88/100。

未达 90 分的具体原因是统一左侧位置覆盖了 Alex 画面中的部分太阳图示，黑底样本场景信息有限，纸卡材质仍偏平面，且尚未完成原声实时阅读和听感验收。room 原片继续标记为 `skip-for-room`：原片已烧录同一句花字，直接叠加会重复抢读。r9 不能标记为通过，也不能覆盖或继承 r8 的 82 分；下一轮应优先改进通用 placement advice、增加纸卡材质层次，并完成原声实时听看验证。证据目录为 `/Users/zhengwei/Downloads/quotation-design-20261007/r9-unified-review/`，其中包含 `editability-check.json` 与 `own-review-verified.json`。

## 2026-10-07：最终审美验收写回契约

`qualityReview.aestheticQualityVerified` 现在是显式的最终验收断言，默认值为 false。只有当前 revision 的全部成片证据有效、总分至少90、没有阻断问题且评审明确记录 `listened=true` 时，Rust 才接受 true；`/schema`、MCP `review_dynamic_asset` 说明和 Web 质量摘要同步使用该字段。旧记录按 false 兼容读取，技术导出、内部评分和位置建议不会自动把样式标记为审美通过。
## 2026-10-07：引号纸卡质感候选与按输入选位策略（89分阶段评审）

为处理 revision 9 的纸卡层次扣分，保留 `style-study-20260928-quotation` r9 及其 88/100 当前评审，另复制独立候选 `dynamic-f805bb65-888c-4b4c-84e5-42ef3b729ca7` revision 1。候选只增加 纸卡圆角值10（背景较短边一半的10%）、0.95 背景不透明度和低强度柔影；五层元素、四条空间关系、左对齐正文、事件时序和根组动效保持不变。

原生 inspect/save 回读通过，三份 `sample-preview` 编译通过。实际生产批次 `production-eaf3ad81fe5ec585f78a206ba820a8e6` 完成 3/3 `published`，每份 `decodeVerified=true`，音频技术校验通过。证据目录 `/Users/zhengwei/Downloads/quotation-design-20261007/candidates/quotation-depth-r10/`，其中包含定义、Application、预览、批次、哈希回执和浏览器代表帧。已提交独立阶段性 quality review `style-review-2e7a71c71010199b6549516190d435a1fa2bf31e4cc635e0544b248937eaef50`，总分 89/100（23/21/19/16/10），`current=true`、`evidenceCurrent=true`、`meetsInternalThreshold=false`、`listened=false`。阻断项是未完成连续观片/原声试听，以及三份均为黑底配音、缺少真人/图示实拍保护验证；不能继承 r9 分数，也不计入90分模板。

同时基于 r9 的实际扣分生成 `placement-strategy.json`。Agent 先从当前代表帧人工标出人物、手势、讲解图示和已有字幕保护区，再根据可用空区排序调用 `placement-advice`：Deborah 选择 `left-mid`，Alex 因太阳图示保护优先选择 `right-mid`。保护区为人工近似矩形（可信度 medium），原生接口只做边界/矩形相交检查，不做图像检测；选中结果仍需成片复核。该策略表达为本次 Application，未写入模板固定坐标。所有候选被阻断时扩大保护区、换构图或跳过样式，不能压低阅读预算硬塞。

## 2026-10-07：引号冻结定义的三应用系列实测（最低88分，未通过）

冻结上述独立纸卡候选 revision 1，使用两个无重复烧录花字的实拍和一份中文真实配音，分别保存Application并生产：Deborah 左上中部 `production-9d567230df82840d255b679734db2af1`、Alex 右上 `production-5cc0c45222a823db392c4423cf5640f1`、中文居中 `production-b1e388aede27e01f7b3d4a524055d2a3`。3/3 published、解码和音频技术验证通过，样式默认定义保持不变。

复查源帧后已纠正前一版 Alex 保护矩形偏小的问题，扩大头肩/手势保护并由right-mid改为right-top；旧几何建议不能继续充作安全证据。新成片的8个事件各检查6张阶段帧，共48帧，并逐片看完整稳定帧。Alex在所查事件中避开人物和太阳；Deborah未压脸/铭牌，但尾引号与植物分离较弱，且4词短段仅0.86秒、稳定预算约0.60秒，需要应用级阅读保持返修。中文最长句完整，但黑底不计实拍背景。

已使用新原生series接口写回评审 `style-review-series-7f6ecf570f4e328a3cc5686123e91089698b74c7d2a817aa6991dd1f632b08bf`，三case **88/91/90**，系列取最低 **88**。GET核验 `current=true`、`evidenceCurrent=true`、`meetsInternalThreshold=false`、`listened=false`、`aestheticQualityVerified=false`。未连续实时观片/感知试听，不计新增最终90分交付。旧r9的88分及r10单应用89分记录保持，互不继承。

证据在 `/Users/zhengwei/Downloads/quotation-design-20261007/candidates/quotation-r11-inputs/`；各case含独立Application、manifest、实际预览、事件帧、可编辑结构回读与review草稿，根目录保存精确series请求/回执/回读。完整论据与后续修复边界见 `docs/quotation-design-20261007.md`。

## 2026-10-07：引号Deborah应用返修，系列数值最低90但试听仍阻断

基于r11实际问题保持独立纸卡候选r1不变，仅对Deborah Application设置 `minDisplaySeconds=2.0` 并将centerY从.38上移到.26；保留第一原句关键词，取消片尾无法获得足够阅读时长的4词触发，不修改ASR、声音或字幕分段。新批次 `production-ba2f53cac516076dc27880133afa3b43` published；预编译与真实工程五叶层均0.86–2.86秒，早于下一原声词2.88秒。r11/r12导出PCM逐样本相同。

已查看完整事件66张30fps左上ROI帧、6张取消尾事件全帧及稳定全幅：尾引号/细线脱离植物背景，正文完整，约1.03–2.77秒可见完整稳定结构，退出后无残留。新Deborah阶段91分，与原Alex91、中文90组成series `style-review-series-8544612a9965029d2533ab2f1472d61ddf535b3c7ac28bc3f8ea3ca1068ee263`，GET核验current/evidenceCurrent为true，最低90；但**未连续实时观片/原声试听，threshold/listened/final均false**，仍未增加最终交付数。

原生历史context `quotation-deborah-reading-20261007-r12` 已保存基线→返修→验证3条可恢复记录，保留r11失败。完整证据 `/Users/zhengwei/Downloads/quotation-design-20261007/candidates/quotation-r12-reading/`。两秒停留和左上位置仅属于当前应用，不写回模板默认；本轮不声称任意画面泛化或浏览器面板操作通过。
