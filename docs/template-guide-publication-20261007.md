# 模板使用指南正式写回记录

2026-10-07。用户已授权补齐模板库；本次完成G1中的活动样式逐款指南保存。仅补创作指导，不调整视觉、不生成新成片，也不宣称完成20款90分目标。

## 已写回范围

- 40条原来缺省的usageGuide已逐款确认后写回；本轮起始41条活动样式现均有指南。灯泡花字r3已有指南及全部定义保持原样。
- 起始62条归档、其他非目标定义及图层/造型/配色/动画/资源/绑定均未修改；本任务未操作参考工程。活动条目没有被重命名或当成40款独立设计。
- 每条使用保存前实时revision执行CAS和固定payload幂等键；保存前后定义仅usageGuide及revision不同。40次inspect投影均仅revision不同，API回读与预期完全相等。
- 旧应用评审仍保留在原revision，不迁移到新版本；本次没有新增90分评分或听感通过。
- 并行任务新增条目单独记录在publication-verification.json的concurrentAdditionsNotModified；本次未改动，不以全库数量不变作为断言。

## 逐款核对后修正的边界

| 设计差异 | 保存指南的具体约束 |
| --- | --- |
| 逐词正文与句内重点 | caption/compact为active_word；三个inline候选及宋体未设active_word，不能称逐词跟读。 |
| 纸签r8与三层便签 | 纸签五叶层含阴影和两道胶带高光，70ms/30ms；note-caption/note-paper只有文字、胶带、高光，分别绑定sentence/keyword，不互相借用评审。 |
| 主字幕、侧栏与分层清单 | 小侧栏32源字号/5行，大侧栏40/3行，分层版正文36/2行加侧栏44/3行；只有分层版关键词明确保持到cue_end且最多3秒。 |
| 无字图标与花字组合 | 独立灯泡16层、清单20层、复古增长9层均无正文，不宣传提供文字行宽；花字组合另外有文字依附规则。 |
| 两种增长造型 | 圆底增长8层为圆盘、基线、三柱和圆顶；复古9层为三柱各自阴影/奶油边/内层，不能共用造型描述。 |
| 时钟细节版本 | 主时钟11层有组处理，精细钟面21层无group treatment、淡出在叶层；不迁移组退场保证。 |
| 星光、灯泡图片和原生图形 | 图片内部不能逐部件编辑；Lucide与IRA来源记录保留，未声称AI生成。两种星光分别是淡紫花字两层及暖纸批注三层。 |
| 历史参考条目 | live-cyan的features.role是title，但binding实际是literal，单行且保留参考案例时机。双层验收条目也是literal/video_start，不能计作已泛化声音模板。 |
| 奶油底签圆角 | backgroundCornerRadius=20为相对圆角参数，不写成20px；68源字号和实测44.2px应用分开。 |

这些修正是逐款核对定义与已有证据后的指南更正。建议性范围不等于运行时强制校验；Agent仍须对单次应用测量、审片并记录调整原因。

## 保存版本

| 样式 | 版本 | 用途核对 |
| --- | --- | --- |
| 行动建议 · 字幕与重点分层 / `style-study-20260930-checklist-split-roles` | r2 → r3 | 22叶层；keyword / sentence |
| 侧栏大字 · 清单建议 / `style-study-20260930-checklist-sidebar-large` | r1 → r2 | 21叶层；keyword / sentence |
| 侧栏阅读 · 清单建议 / `style-study-20260930-checklist-sidebar` | r1 → r2 | 21叶层；keyword / sentence |
| 行动清单 · 方法花字 / `style-study-20260929-checklist-headline` | r2 → r3 | 21叶层；keyword |
| 行动清单 · 勾选确认 / `style-study-20260929-checklist` | r2 → r3 | 20叶层；keyword |
| 灵感灯泡 · 暖光点亮 / `style-study-20260929-bulb` | r1 → r2 | 16叶层；keyword |
| 灵感提示 · 灯泡轻弹 / `style-study-20260928-idea` | r1 → r2 | 2叶层；keyword |
| 便签正文 · 左对齐字幕 / `style-study-20260929-note-caption` | r1 → r2 | 3叶层；sentence |
| 注释便签 · 暖黄纸条 / `style-study-20260929-note-paper` | r1 → r2 | 3叶层；keyword |
| 便签批注 · 纸签贴入 / `style-study-20260924-note` | r8 → r9 | 5叶层；keyword |
| 增长宣言 · 阶梯花字 / `style-study-20260929-growth-headline` | r2 → r3 | 10叶层；keyword |
| 复古增长 · 三阶跃升 / `style-study-20260929-bold-growth` | r1 → r2 | 9叶层；keyword |
| 增长提示 · 三柱跃升 / `style-study-20260928-growth` | r4 → r5 | 8叶层；keyword |
| 地球科普 · 经纬展开 / `style-study-20260929-globe` | r2 → r3 | 6叶层；keyword |
| 句内青色重点词 · 轻底板候选 / `style-caption-inline-soft-panel-candidate-20260929` | r1 → r2 | 1叶层；sentence |
| 句内青色重点词 · 细描边候选 / `style-caption-inline-fine-candidate-20260929` | r1 → r2 | 1叶层；sentence |
| 句内青色重点词字幕 · 待评审 / `style-caption-inline-cyan-candidate-20260929` | r1 → r2 | 1叶层；sentence |
| 候选 · 清晰逐词字幕 / `style-caption-compact-candidate-20260929` | r3 → r4 | 1叶层；sentence |
| 清晰讲述 · 逐词字幕 / `style-pilot-20260923-caption` | r3 → r4 | 1叶层；sentence |
| 候选 · 精细刻度时钟 / `style-clock-detail-candidate-20260929` | r1 → r2 | 21叶层；keyword |
| 时间提示 · 指针轻转 / `style-study-20260929-clock` | r3 → r4 | 11叶层；keyword |
| 完成提示 · 勾选成形 / `style-study-20260929-completion` | r4 → r5 | 7叶层；keyword |
| 候选 · 青色双笔触花字 / `style-cyan-accent-candidate-20260929` | r1 → r2 | 5叶层；keyword |
| 候选 · 青色弹字半透明底板 / `style-cyan-translucent-candidate-20260929` | r2 → r3 | 1叶层；keyword |
| 口播强调 · 青色弹字 / `style-study-20260928-cyan-impact` | r2 → r3 | 1叶层；keyword |
| 参考实测 · 青色强调字 / `live-cyan-caption-20260919` | r2 → r3 | 1叶层；literal |
| 圈选提示 · 双圈强调 / `style-study-20260928-rings` | r2 → r3 | 4叶层；keyword |
| 方向提示 · 箭头轻推 / `style-study-20260928-arrow` | r2 → r3 | 6叶层；keyword |
| 小小庆祝 · 彩纸散开 / `style-study-20260928-celebrate` | r2 → r3 | 7叶层；keyword |
| 居家学习 · 插画浮入 / `style-study-20260928-learning` | r1 → r2 | 1叶层；keyword |
| 信息提示 · 青色侧标 / `style-study-20260928-signal` | r3 → r4 | 2叶层；keyword |
| 重点批注 · 珊瑚侧标 / `style-pilot-20260923-marker` | r5 → r6 | 3叶层；keyword |
| 观点引用 · 双引号 / `style-study-20260928-quotation` | r5 → r6 | 3叶层；keyword / literal |
| 温暖批注 · 文字边缘星光 / `style-study-20260928-measured-sparkle` | r3 → r4 | 3叶层；keyword |
| 灵动强调 · 星光弹字 / `style-pilot-20260923-sparkle-follow` | r5 → r6 | 2叶层；keyword |
| 轻量讲述 · 宋体重点 / `style-study-20260924-serif` | r3 → r4 | 1叶层；sentence |
| 入场强调 · 消散重影 / `style-study-20260924-echo` | r4 → r5 | 3叶层；keyword |
| 阅读强调 · 奶油底签 / `style-pilot-20260923-adaptive` | r7 → r8 | 1叶层；keyword |
| 综艺强调 · 双层花字 / `style-pilot-20260923-offset` | r8 → r9 | 2叶层；keyword |
| 验收 · 双层花字 / `dynamic-905625bd-59aa-4338-9c11-6e6cc8e95660` | r2 → r3 | 2叶层；literal |

## 可审阅证据

根目录：`/Users/zhengwei/Downloads/template-guides-published-20261007`。

- `confirmed-guide-plan.json`：40份经修正的正式指南文本；与更早guide-drafts.json区分。
- 每个asset目录：`before.json`、`inspect-before.json`、`inspect-proposed.json`、`save-request.json`、`save-receipt.json`、`after.json`、`inspect-after.json`及`verification.json`。
- `publication-verification.json`：起始库前后对照，40条精确变更及63条未动定义；原有归档状态完全一致。
- `library-before.json`、`library-after.json`和`reviews-after.json`：原生读回快照。
- `refine-and-publish.py`：确认文本、CAS、幂等保存及投影差异的可追溯执行脚本；重跑已保存项只核对，不重复增版。
- `verify-publication.py`：重新核对保存计划、API当前值、起始库及每款投影证据；只读，不写库。

当前仍未完成的是新revision对应的应用质量验收、真正新背景及其他模块闭环。指南保存证明Agent能读到各款使用规则，不证明最终效果已达到90分。
