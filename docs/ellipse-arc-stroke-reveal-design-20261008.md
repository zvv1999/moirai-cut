# 椭圆弧线与描边显现：最小设计与能力审查

状态：2026-10-08。以下保留最小设计及依据；**Rust 模型、原子编辑、编译、执行校验和 MCP 契约已实现并通过测试**。Web renderer/UI 由主线程并行接入，真实 MP4 弧线验收尚待本轮部署，不将代码通过等同于效果通过。

## 为什么需要

双圈文字候选 r1 与视觉草稿 A/B/C/D 已走实际输入、原生元素生产与 MP4 检查。C 改善了文字对比和主副圈层次，但两条完整椭圆仍靠缩放、旋转和透明度出现；两行短英文看起来接近圆形徽章。A/B 增粗后过重，D 缩小圈后挤字。继续调整固定比例不能产生「画一笔圈出重点」的动作。

需要新增的是可编辑图形几何与独立描边进度：圈可以有开口，沿路径依次出现，仍能跟随实际文字框变化。该能力应当服务任何符合条件的椭圆标记，不绑定双圈模板、台词、关键字、位置或固定秒数。

实际设计证据：`/Users/zhengwei/Downloads/rings-visual-design-20261008/`。`draft-d-rejected.json` 保留 D 的拒绝原因，`compare-c-d.jpg` 比较相同输入和 Application。D 的中文长两行内沿归一化 Q 约 0.998，虽未越线，却没有可接受的留白。

## 现有能力及缺口

| 环节 | 已有事实 | 需要补充 |
| --- | --- | --- |
| 原生椭圆 | `apps/web/src/graphics/definitions/ellipse.ts` 仅有填充、描边、线宽和描边对齐；`Path2D.ellipse` 绘制整圈 | 静态起始角、弧度范围和描边进度 |
| 路径描边 | `graphics/stroke.ts` 的 inside/outside 通过闭合区域裁切/合成；没有 lineCap 参数 | 开放路径必须有明确端点语义，不能沿用区域裁切 |
| 模板动效 | `MotionProperty::Reveal` 存在，但 `compiler.rs` 拒绝执行；动态资产也拒绝 | 新增含义明确的 `stroke_reveal`；不把旧文字 Reveal 冒充可用能力 |
| 模板几何 | Element 的表现类型区分 ellipse；Style 保存颜色、线宽、字体等 | 几何参数独立于颜色、文字和空间关系 |
| 依附尺寸 | `SpatialRelation.sizeBinding` 已从实际原生文字框生成椭圆宽高，支持独立缩放和旋转 | 原样复用，不加按输入/字数的分支 |
| 编辑器 | 通用 graphic 参数可进入 `ElementParamsTab`；数值参数支持关键帧 | 确认新参数出现、能修改、撤销和重载；动效面板展示正确能力 |
| 执行检查 | Rust preflight 通过实际 compile 返回可执行性 | 明确拒绝未支持的形状、填充、组级使用及非法值 |

当前椭圆先在 512 × 512 源画布绘制，再按布局做非等比缩放。横纵描边粗细会随之变化。弧线和 reveal **不会自动修复非等比描边问题**；先保留这一已有语义并真实评审，若需要等宽笔触，应另设清晰的描边空间契约。

## 最小模型边界

建议在 Element 新增可选 `ellipseArc` 几何对象（名称可在实施前统一）：

```json
{
  "ellipseArc": {
    "startDegrees": -35,
    "sweepDegrees": 325,
    "cap": "round"
  },
  "motions": [
    {
      "property": "stroke_reveal",
      "keys": [
        { "time": 0, "value": 0, "easing": "ease_out" },
        { "time": 0.2, "value": 1, "easing": "linear" },
        { "time": 1, "value": 1, "easing": "linear" }
      ]
    }
  ]
}
```

这把几何放在元素上，把颜色/粗细继续留在 Style，把时间曲线放在 Motion，把位置与随字变化继续留在 SpatialRelation/Application。不同颜色可以共用同一几何和动作，换文字不改几何定义。不要给双圈创建专用业务类型。

Rust 编译为通用 native graphic 参数：`arcStart`、`arcSweep`、`strokeCap`、`strokeReveal`；**动画通道为 `params.strokeReveal`**，遵循现有 graphic 通道命名，不另开裸名别名。完整椭圆没有显式几何时等价于 `arcStart=0, arcSweep=360, strokeReveal=1, strokeCap=butt`。旧无新字段/新动画的椭圆不新增这些参数，继续走既有整圈分支。`stroke_reveal` 独立于 `opacity`，二者可组合；不改变文字透明度，也不改变所在组的透明度。

最小版本的执行范围：

- `ellipseArc` 只允许 `representation=ellipse`、`outline=true`，不支持扇形填充或弦闭合。部分弧是开放描边；没有隐式连回中心的直线。
- 起始角有限且限定 `[-360, 360]`，扫过角为 `(0, 360]`，正向为屏幕坐标顺时针。第一版不承诺负扫过角和多圈路径。
- 描边显现值限定 `[0, 1]`。非法输入在 Rust 校验阶段拒绝；渲染端只做防御性有限值处理，不默默改变模板意图。
- `stroke_reveal` 禁止 `overshoot`，允许 linear/ease_in/ease_out/ease_in_out，保证插值不越过进度范围。Motion treatment 的显现与元素已有进度相乘，两个有界进度的乘积仍在 `[0,1]`。
- `stroke_reveal` 只在有正线宽的 outline ellipse 上执行；其他图形、文字、媒体、声音和 group 级使用明确报错。能力扩展后再增支持集合。
- 模板编译出的弧线仅支持中心描边，端点为 round 或 butt。原生编辑器使用部分弧时应限制 inside/outside，并给出明确状态；不能通过 UI 产生无法解释的开口裁切。
- 入场时序继续由已有 `MotionTiming` 重新映射，真实 TTS/ASR 时间决定实例时长。不得把演示片的固定秒数写入模板。

## 渲染语义

实际终止角为 `start + sweep × strokeReveal`。`strokeReveal=0` 时不描边，避免圆端帽变成孤立小点。`0<strokeReveal<1` 时使用开放路径和指定端帽。达到完整 360° 时按整圈处理，避免首尾双端帽形成结节。角度跨 0° 要连贯，不按整数段重启。

颜色、线宽、旋转、opacity、scale、textAttachment/sizeBinding 的语义保持独立。主圈深边和金墨可作为两个原生叶层共享同样的弧线起点、扫角和 reveal 曲线；副圈可以错开起点与 reveal 入场。图层依然可选中编辑，无需 SVG 栅格化或截图回填。

部分弧的像素范围可以小于完整椭圆。安全避让第一版继续采用整圈外包络作为保守边界，不声称它是精确弧段 AABB。文字四角位于基础椭圆内沿只验证构图的预留空间，**不等于每一时刻文字都被未画完的弧线包围**。

## 拟改文件与责任

| 文件 | 拟改内容 |
| --- | --- |
| `rust/crates/footage/src/templates/model.rs` | 几何数据和 `StrokeReveal` 类型、schema、数值与组合校验 |
| `rust/crates/footage/src/templates/rhythm.rs` 及承载 PlacedElement 的定义 | 将几何原样传到实例；不重写音频时间 |
| `rust/crates/footage/src/templates/compiler.rs` | geometry → native params，stroke_reveal → strokeReveal；非法执行组合 fail closed |
| `rust/crates/footage/src/templates/composition.rs`、`dynamic_asset.rs` | 组合、保存、复用与组级拒绝，避免验证路径之间不一致 |
| 模板能力/schema 输出及 `apps/mcp/src/template-*.mjs` 相关测试 | AI 能发现受支持的属性/范围/限制；读回与写回不丢字段 |
| `apps/web/src/graphics/definitions/ellipse.ts` | 参数和共用原生 renderer；完整圈兼容分支与开口端帽绘制 |
| `apps/web/src/templates/types.ts`、`element-motion.tsx`、图层几何编辑区域 | UI 类型和字段、仅在受支持层级显示的描边动画选择 |
| `apps/web/src/params/registry.ts` 及属性注册相关测试 | 确认 generic graphic 参数可发现、关键帧化和恢复；必要时补注册 |
| Rust compiler/validation tests 与 renderer tests | 非法组合、默认兼容、首尾帧及真实 Application 覆盖 |

通用的模板几何、执行约束与编译逻辑在 Rust；Web 只维护输入控件与绘制。同一 `ellipse` renderer 供预览和导出使用，不写第二套模板计算。

## 验证与验收

1. 保存/读回/AI schema：确认几何与 motion 原样往返，旧无字段定义仍有效；错误表现类型、负扫角、非有限值、超范围 reveal、group reveal、填充弧均拒绝。
2. 编译：检查通道 time ticks、Bezier handles、与 opacity/rotation/sizeBinding 并用；短事件按真实窗口压缩且满足已声明的 exit sampling 约束。
3. 原生 renderer：0/0.25/0.5/1 进度，跨零起始角，完整圈端点，round/butt，横向/纵向拉伸，零/粗线宽。pixel evidence 要能区分「只有部分路径」与「整圈透明度淡入」。
4. 编辑器闭环：选中任一原生圈，修改起始角/扫角/端帽/reveal key，画面更新；undo/redo 和项目重载后保持。AI 经同一属性/编译契约生成相同结果。受限浏览器验收未完成时记录未验，不能由单元测试替代。
5. 产品生产 API：C 的四个真实 Application（Deborah/John/June/中文声音）使用完全相同的输入词时间再生产；至少包含英文单词/两行、中文 3–10 字/两行、1280×720 与 720×720。另设一个动态尺寸/旋转/子组局部测试检查组合语义，不当作新增真实素材覆盖。
6. 对最终保存版本逐帧核对：源输入 SHA 与 word timing 不变；native graphic 和真实 text parent 保留；字框测量来自输出 MP4 对应 renderer；实际金像素出现顺序符合弧线进度；整圈保守包络没有裁切或侵入保护区；最后有效帧、淡出及后置空帧按真实编码时间核验。
7. 判断视觉：与完整圈 C 同输入并排，重点检查「画笔强调」是否成立、两行是否还像徽章、粗细是否适合 390px 显示和实拍背景。人工/Agent 逐帧视觉结论与实时视听结论分开记录。未试听时 `listened=false`，未最终审美接受时 `aestheticQualityVerified=false`；新增字段和测试通过不能自动得到 90 分。

实施时先做单个可编辑弧线的完整纵向链，再用双圈检验组合。June 空位过紧仍是当前 Application 的适配问题；弧线能力不能替代换位置、换行宽、换更简洁样式或 skip 的判断。

## 原生实现进度

新增 `rust/crates/footage/src/templates/ellipse_arc.rs` 集中保存几何类型、受支持组合、范围与 AI 能力说明。Element、PlacedElement 与事件实例传递显式几何。编译器只在 geometry/direct-motion/element-treatment 需要时输出新参数，元素与独立 treatment 均编译到 `params.strokeReveal`，后者按帧与已有进度相乘。模板 schema 与动态资产 schema、inspect 返回相同执行契约。

动态资产增加两项独立原子操作：`{kind:"outline",layerId,enabled}` 与 `{kind:"ellipse_arc",layerId,ellipseArc:对象|null}`。都只改请求字段再校验整个最终草稿，因此可以清除待保存的零线宽草稿上的弧线，但不会抹掉其他字段。若仍有不兼容 stroke_reveal 或无关坏参数，仍拒绝。组级 reveal 在动态资产的普通容器展开之前被拒绝，防止展开成子元素后绕过 element-only 限制；模板 Composition 也独立校验。

测试覆盖默认整圈兼容、固定 180ms 入场映射、独立 opacity/scale、弧线真实文字父 ID、sizeBinding/rotation 组合、treatment 乘法与缺省参数、非法值/表现/组目标、原子清除修复与无关坏值拒绝、保存/捕获/复制及 schema 发现。原生模板全回归为 316 passed、2 ignored；MCP 动态资产 transport 4 passed。日志保存在 `/Users/zhengwei/Downloads/rings-visual-design-20261008/ellipse-arc-native-tests.log`。后续正式输出仍需独立的像素、动效和视听评审。
