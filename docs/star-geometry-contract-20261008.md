# 可编辑星形几何契约

为星光素材补齐通用原生星形。业务验证、投影与编译在 Rust；Web 复用 `star` graphic 渲染器和参数面板。初期r6保持不变进行草稿试验；现已保存同族r7并重新生产/评审三份精确应用，r6历史保留。

## 模型与执行

`Element.features.representation = "star"`，可选 `starGeometry: {points, depth}`。角数为 3–12 整数；depth 为 1–99 的有限数，表示内半径占外半径百分比。省略几何时默认 5/45，与现有 Web renderer 一致；四角尖星使用显式 `{points:4,depth:18}`，没有 sparkle 特例。

编译到可编辑 `graphic`、`definitionId:"star"`、`params.points/depth`。颜色、填充/仅描边、图层、旋转、缩放、透明度及文字框依附独立组合。模板几何字段是静态声明，不新增模板级几何动画。源路径内接于源图形较短轴，非方形源框不会自动将路径填满两轴；后续元素变换遵循既有渲染行为。边界仍采用保守源框，不能据此声称感知遮挡通过。

星形转媒体不属于本次新增能力，保持原有矩形/椭圆转换入口，原生同样拒绝星形转换。

非 star 元素携带 starGeometry 被拒绝；star 不能携带 ellipseArc 或 stroke_reveal。无此字段的旧矩形/椭圆保持旧编译。图形不消费媒体资源，不能冒称图片可拆矢量。

## 编辑与发现

`dynamic_asset_schema.starGeometryCapabilities`、模板 capabilities 与 inspect 公开同一能力。MCP 使用现有透传接口；原子操作 `{kind:"star_geometry",layerId,starGeometry:{points,depth}|null}`，null 清除显式几何、恢复默认。操作先仅修改目标字段，再验证完整结果，允许修复当前不兼容草稿但不能跳过其他错误。新增元素、保存、捕获、复制、投影及 Application 继续沿现有契约保留字段。

模板工作台和独立素材工作台均可添加星形，外观显示角数/内半径，可清除错误字段；无命名样式也可编辑几何，不伪造颜色样式。颜色与动效沿既有面板。布局缩略图是静态示意；实际 EffectPreview/导出复用 graphic renderer。

## 验证与尚未证明

定向 Rust 覆盖默认/四角编译、非法数值/目标、修复不丢草稿、独立运动、保存/捕获/复制、outline、schema及文本依附。Web 覆盖编辑往返、默认/无效状态、真实 Canvas 四角尖点与透明角落、描边透明中心和五角默认一致；MCP 覆盖原样透传与原生错误。

初次统一部署时，两处 schema 已回读到星形契约，当时完整 Rust 库测试350通过、4忽略。此为历史结果。

最新合并代码验证由根Agent执行并回报：Rust 351通过、4忽略；Web 32通过、500断言；TypeScript检查通过；MCP定向5通过。新增star默认布局已在代码中修为居中、像素等宽高（边长为画布短边的20%），横/竖/方画幅回归覆盖；用户仍可独立拉伸。该默认值只影响新增元素，不改已保存定义。随后根Agent完成根级新增接口的三画幅真实API回归：720×720、1280×720、720×1280均为144×144像素且居中，未保存正式素材；证据 `/Users/zhengwei/Downloads/star-default-region-20261008/verification.json` 已回读。非等比父组下的新增仍发现再拉伸边界，正在单独修复，不能将根级通过泛化为所有嵌套容器通过。

测试不替代实际成片审美、连续观片或原声试听；r7真实生产和新评分见下节。

## 首次部署与历史草稿链路回归

统一部署后，经当前 schema 确认默认 5/45；真实 API 完成捕获草稿→改六角→清除→恢复四角，运动及未保存名称保持。角数 2、非整数 4.5、depth100 均被原生拒绝。未保存测试资产到正式库。

`/Users/zhengwei/Downloads/sparkle-drafts-20261008/star/` 包含两个四角设计 × Liz/中文两个原输入的四份 published MP4、七阶段代表帧、精确编译文档与可编辑工程校验、完整姿态诊断及原声PCM比较。每案四个独立可编辑star图层（主/次×背层/亮芯），points4、depth18/22，文字依附指向实际父实例。五条完整姿态记录零丢失，390px观看宽度下文字最小18.4275/36.4px，18px门槛及调用方稳定预算通过。

全部原词、语义事件及PCM保持。实际暖色亮芯阈值像素范围：Liz约16–17px，中文约34–36px；它排除白次星及紫背层，不称完整图标分割或感知清晰度保证。亲看代表帧时尖星优于椭圆十字，但小屏次星辨识与黑底主次比例仍需设计复核。此阶段正式星光r6尚未修改，四份草稿没有独立评分，未连续观片、未试听。随后选择duet进入以下正式r7流程；不沿用草稿为当前正式应用的审片证据。

### 中心描边实际导出回归

2026-10-08 使用正常 production/author 生成两份独立可编辑 outline 技术样例（不保存星光族正式定义）：`production-060850eabeb87a10d3344c8559fb5e5c` 的 item 0 为 4 角 / depth 18 / stroke 8，item 1 为 5 角 / depth 45 / stroke 7。两项均 published，输出 MP4 哈希与记录一致，保存工程 scenes 与编译文档逐项一致。已解码并查看稳定帧及尖角局部；尖角完整。白色描边阈值 `min(R,G,B)>100` 在人工选定局部内未超出 120×120 元素矩形；该阈值不是透明边缘分割，也不单独证明未裁切，需结合 padded-source Canvas 回归与实际图像检查。

证据目录：`/Users/zhengwei/Downloads/sparkle-drafts-20261008/outline/`。保留 manifest、两份 item、verification、MP4、原始 settled 帧与 zoom。item 0 SHA-256 `e8fb10ebe61c4f25c6a96234a6d93a87a6a420a00322010db02f2366d85b2dae`；item 1 `8581b14f1d643df5c4cd211c4afd580d6007df81d64ca874d781e758f2590ca1`。未连续观片、未试听，不是审美验收。

## 当前正式r7与证据范围

`style-pilot-20260923-sparkle-follow`已保存r7，保留四个独立star及字号相对规则，无case输入/绝对词时间。三份精确Application全部重新生产、原词/语义/字幕/事件逐字段比较一致、PCM一致；完整输入比较仍为false，因为其中template字段不同。可复核字段值、旧/新JSON指针和摘要见 `r7/source-invariants.json`，唯一变化字段为template，不能声称全输入一致。

正式Application按新族整体边界居中，RGB与后置换图草稿不同。根Agent与实施Agent分别重看正式三份七阶段实帧后登记新series `style-review-series-9f3929c7689979ba73d6516cb97bf5a3990180e08e68a7a44f31d7444b8dd769`：Liz89、mentor89、中文87，current/evidenceCurrent均true；三条新历史当前且可恢复。最低87，未达到90分验收，listened/aestheticQualityVerified=false。英文是同一人物同布景，中文黑底TTS；浅墙小白辅星仍偏细，未证明复杂背景泛化。

证据目录 `/Users/zhengwei/Downloads/sparkle-drafts-20261008/r7/`；具体批次、Application返修及seed见 `docs/sparkle-generalization-20261008.md`。便携 `scripts/templates/seeds/sparkle-follow.json` 除revision归零外精确匹配当前r7，并通过原生inspect往返。

## 新增星形的容器比例闭环

2026-10-08：新增星形默认以所在坐标容器的实际像素短边20%构成正方框，并在该容器居中；根级以画布为容器，分组新增递归计入所有祖先区域，因此横屏、竖屏和单层/嵌套非等比分组不会在新增时压扁星形。后续宽高与组变换仍可有意拉伸；正方默认不是强制比例约束。其他基本表现的新建区域保持原行为。

真实草稿API先复现：单层父组115.2×57.6px、嵌套51.84×40.32px，原默认都非方。修复后11项Star专项回归通过，全库 **353通过、4忽略、0失败**；在所有代理生产和本地ASR完成、队列空闲后统一构建并更新服务。相同原请求重送得到57.6×57.6px与40.32×40.32px，既有图层逐值不变。根级720²/1280×720/720×1280均为居中144×144px。只使用草稿API，没有保存测试资产或修改原项目，没有新增浏览器点击验收。

证据：[根级三画幅](/Users/zhengwei/Downloads/star-default-region-20261008/verification.json)、[父组复现与修复](/Users/zhengwei/Downloads/star-parent-square-20261008/verification.json)。运行服务已包含这两个默认行为修复。
