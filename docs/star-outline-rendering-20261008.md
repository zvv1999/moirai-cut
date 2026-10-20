# Star居中描边源框修复

2026-10-08。模板Star复用了既有星形renderer，但默认miter连接会把尖角向源框外延伸，`strokeWidth / 2`内缩不足以保护尖角。以512源为例，四角/depth18/描边8的未裁切绘制范围为`[-24,-24,534,535]`，430个有alpha的像素落在源框外；默认五角/depth45/描边7也有20个框外像素。实际512纹理会裁掉这些像素。

修复仅在 `graphics/definitions/star.ts`：center描边局部使用round连接，并以半线宽加0.5源像素内缩；后者覆盖切线极值的抗锯齿边缘。通过save/restore恢复调用方的线连接与线宽状态。没有修改矩形、椭圆或共享stroke函数；inside/outside继续使用既有对齐算法。模板几何仍独立于颜色、外观和动效，没有降低outline能力声明。

针对性Canvas验证：

- 使用768画布承载平移后的512源，检查未被源纹理裁切的真实绘制。3/4/5/12角、depth1/18/45/99与线宽1/7/8/30/64共80组合，源框外alpha全部为零，绘制非空。
- inside/outside在同一边界内外的像素位置保持各自语义；center不会泄漏lineJoin/lineWidth状态。
- 直接读取Git HEAD中的原始star renderer作纯内存逐像素对照：48个零描边填充组合完全一致；64个inside/outside描边组合完全一致。
- `bun test src/graphics/__tests__/star-template.test.ts`：4通过、0失败、342断言。

这些是renderer像素检查，不是成片审美评分。独立可编辑outline生产验证由根任务协调；本修改没有保存素材定义、操作项目或重启服务。
