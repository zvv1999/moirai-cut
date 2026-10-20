# 方向箭头 r4：通用造型与整体透明度

在原 `style-study-20260928-arrow` 上保存 r4，没有增加模板族。原 r3 的实际小屏帧暴露出两个通用问题：细线轮廓在暖亮背景上分量不足，180ms 入场与 100ms 退出占据短事件较多时间。本轮改良通用造型与动作，既有输入的坐标、比例、事件与保护区保持。

## 改良规则

六个可编辑叶子构成粗杆、圆尾和实心三角头的深衬／暖黄双层图形。分别使用已有 rectangle、ellipse、`starGeometry={points:3,depth:50}`；后者的内顶点位于三角形边上，形成实心三角头。没有外部贴图或新的执行原语。

720px 设计画布上，局部推进从 −8px 到 0，80ms 完成，不越过最终尖端；稳定段不抖动，70ms 整体退出。应用的 `rotationDegrees` 旋转完整组件及局部运动，输入级目标、位置和显示时段不写进定义。

第一稿发现部件各自半透明时，杆与三角头、圆尾的搭接处会露出接缝。第二稿使用已有隔离合成组：六叶先形成完整图像，再对组施加 opacity。真实入场／稳定／退场像素对照确认接缝消除。该规则适用于其他由多个不透明部件组成、需要整体淡入淡出的素材。

## 正式应用回验

三个正例与一个无目标负例均重新用保存 r4 的原生 Application 投影生产。只有 `assetRevision` 从 3 改为 4；原位置、比例、方向、保持、Sample、ASR 词与词时间、原声、源画和保护区完整保留。

| 应用 | 五项：构图 / 动效 / 素材 / 适配 / 可编辑性 | 分数 | 实际结果 |
| --- | --- | --- | --- |
| Alex 太阳 | 23 / 22 / 19 / 18 / 9 | 91 | 原 .50 比例向上指向太阳外缘；稳定 .700s，真实退场 2 帧 |
| Creator 花字 | 22 / 22 / 19 / 18 / 9 | 90 | 原 .40 比例的轮廓已更清楚，未依赖旧 .48 放大返修；稳定 .966667s，退场 2 帧 |
| Domain 花字 | 20 / 19 / 19 / 17 / 9 | 84，失败 | 稳定 .466667s 仍短；原片已有上下两处同义大字，新增指向收益低 |
| John 无目标 | 不评分 | 负例 | 实际 0 个箭头叶，单独保存历史，不算成功语义覆盖 |

Domain 保留两个阻断，建议跳过。`.5s` 是原先这些箭头案例的人工图形识别提案，不是新通用阈值或原生文字 readingCheck；本轮没有延长目标窗口或原声来凑预算。素材更清楚不代表每个输入都适合叠加。

三正例 input ID 来自两份已知母片。额外 0°／+90° 使用相同 Alex 输入，仅验证右／下朝向的连接、局部推进与整体透明度；它们不再指向太阳，不计有效语义应用或新输入。实际目标应用另覆盖 −90° 向上和 180° 向左。

正式投影与草稿的叶子非区域视觉字段、样式及组执行参数相同，只有浮点舍入和新 authored bounds 的原生居中差异，局部位移最多 0.127923px。正式成片另行检查，没有手工移动个案坐标抵消差异，也没有继承草稿评分。

## 保存与证据

原生系列为 `style-review-series-80fec86c2e8f68747893417329e428858b1efc5bd417ca78f3be84abe0955ad2`，三案 **91 / 90 / 84，最低 84**。回读总体与逐案 `current/evidenceCurrent=true`；`meetsInternalThreshold/listened/aestheticQualityVerified=false`，未完成整体 90 或最终验收。旧 r3 最低 82 的系列及各失败、v1/v2 草稿全部保留；r3 因修订更新成为历史。

| 上下文 | r4 追加历史 |
| --- | --- |
| Alex | `application-993ec68635d9e826325aedb6a19813b019d2ec1535f472a4d43d7a24e0761dee` |
| Creator | `application-4c498d40f52fcba6e0ea142e996a4a7b4143bed061ab8586a0380f48dec98f2f` |
| Domain | `application-42a1e0aa7acb8a2121bfe3ebf354bc2664ca28e68df3633f215542971951fec6` |
| John | `application-f5ef93231fd0ee17ff7d7e76fdce8c20e679d814730b7530e875f7747cbff52a` |

四条历史回读均可恢复、资产／输入／投影当前且 `issues=[]`。没有执行恢复去改写原项目。原生只读历史的 `sourceFilesVerified=false` 不代替独立媒体文件核验。

所有新导出完成文件 SHA、完整解码、实际逐帧 PTS、原声 PCM、原词时间、源画编译图和生产工程回读核对。已实际查看各事件前／入／稳／退／后代表帧与负例；根代理另复核正式帧。纯图形的文本测量记录为空是预期，没有伪造文字测量。

本机证据根目录：`/Users/zhengwei/Downloads/arrow-solid-draft-20261008`。

- `review.html`：正式 r4 与旧 r3 的实际成片和同帧对照。
- `composite-fade-detail.png`：v1/v2 整体透明度的入／稳／退像素对照。
- `formal-r4/review-series-{request,receipt,readback}.json`：评审请求、保存和有效性回读。
- `formal-r4/projection-diff.json`：草稿与正式原生投影的数值差异。
- `formal-r4/<case>/verification.json`、`history-readback.json`：各输入的技术核验与历史状态。

## 同源初始化

`scripts/templates/seeds/arrow.json` 除初始 `revision=0` 外与保存 r4 逐字段相同，通过原生 inspect；usageGuide 完全一致。`author-native-attention-marks.mjs` 的箭头分支读取此 seed，已有箭头直接沿用当前保存版，避免重新运行旧脚本覆盖为细线造型。`draft-library-usage-guides.py` 的箭头指南也从相同 seed 读取，不再维护另一份旧造型说明。

本轮没有连续观片、感知试听、未见背景验证或新的真实 UI 编辑回归。编辑性维持 9 分；已知输入技术通过和个别案例达到 90，不代表整个模板族交付完成。

前序目标与失败见[箭头 r3 泛化记录](arrow-generalization-20261008.md)，应用方向模型见[应用旋转](template-application-rotation-20261008.md)。
