# 圆角矩形契约与验证状态

2026-10-09 更新：契约、Rust 编译链、Web 渲染、工作台与 MCP 已实现并通过代码验证；当前清单 r5 仍使用正常生产并验证过的 46 个叶层。19 叶候选尚未进行正常生产对照，不能继承 r5 评分。以下保留设计缘由。

## 具体问题

此前 Rust 模板 Element 有星形几何与椭圆弧线字段，没有矩形圆角几何。Web rectangle 已有 cornerRadius 控件，但模板不能经同源契约保存、编译并交给 Agent 编辑。Style 的 backgroundCornerRadius 属于文字底板，整纹理裁切也不等价于矩形造型。

清单 r5 因此用矩形和椭圆拼接：三个圆角板层共 18 叶，夹扣三层与三条行线共 18 叶，正文、三个圆点和六个勾线共 10 叶。可以将前两组分别降为 3 与 6 叶，总计 19 叶。保留语义描述并不能消除修改形状时多片联动的编辑成本，本轮编辑性因此计 9/10。

## 必须一起解决的纵横比

GraphicNode 先在 512×512 源图绘制，再按编译器的独立 X/Y 比例变换。直接传 cornerRadius=50 会把圆拉成椭圆；短边半径胶囊则必须保留中段直边。例如清单 .100×.044 的夹扣不能用拉伸整圆替代。

实现采用可选 Element.rectangleGeometry，圆角值范围 0–50，定义为实际矩形短边百分比。Rust 负责合法目标、数值校验、事件实例与编译，并输出圆角及绘制所需纵横比。Web 只按该几何契约绘制，在当前正方形源中补偿 X/Y 半径，使正常区域缩放后得到圆角。缺省走旧路径，避免改变全部既有图形的源尺寸与 contain 行为。具体字段和输出以当前 schema 为准。

颜色、描边、运动、透明度与事件时机保持正交。独立 scale_x/y 的形变含义须明确；文字尺寸绑定改变纵横比时也必须测试，不能未经验证声称圆角自动正确。

## 实施与验收边界

1. 补齐 Rust model → validation → PlacedElement/events → compiler → dynamic asset 保存/捕获/复制/editLayers/清除 → schema/MCP 发现链。
2. 补齐 Web 类型、模板几何面板和 rectangle 绘制适配。组件只负责交互与渲染，校验及编译规则留在 Rust。
3. 测试缺省兼容、错误目标、非法值、方形/竖板/长胶囊、Application 缩放与旋转、尺寸绑定；检查变换后的半径、直边和填充/描边。
4. 用冻结四个 Application 正常生产 46 叶与 19 叶对照，独立检查抗锯齿、退场接缝、文字依附、三次勾选和编辑可理解性。形状理论等效不保证像素相同，不能继承 r5 分数。

现有参考实现：`rust/crates/footage/src/templates/model.rs`、`compiler.rs`、`rhythm.rs`、`events.rs`、`star_geometry.rs`、`dynamic_asset_edit.rs`、`api.rs`；`apps/web/src/graphics/definitions/rectangle.ts`、`services/renderer/nodes/graphic-node.ts`、`services/renderer/text-attachments.ts`、`templates/types.ts`、`templates/dynamic-assets.tsx`。

已实现 `Element.rectangleGeometry.cornerRadius`（0–50，实际短边百分比），显式编译 `rectangleAspectRatio` 并在源图绘制时补偿圆角。缺省保留旧渲染路径；独立 X/Y 动画继续表达形变。文字尺寸绑定会更新设计纵横比，依附失败时参数与变换一起回滚。面板使用完整草稿原生编辑并拒绝迟到的旧响应，支持清除不兼容字段。

Rust 完整库测试 363 通过、4 忽略；图形和依附相关 Web 测试 35 通过、586 断言。2026-10-09 再次确认 Rust 二进制构建及 Web 非增量 TypeScript 检查成功。针对 19 叶候选的生产、视频观感与独立评分仍待完成。此项纳入原目标的通用建模与编辑闭环，不增加独立模板款数。
