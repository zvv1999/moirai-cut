# 单次样式应用旋转

2026-10-08。`Application.transform.rotationDegrees` 和 `Insert.transform.rotationDegrees` 可选，取值 −180 至 180，正值顺时针。省略保持旧请求序列化、投影和历史行为；显式 0 不添加旋转结构。显式 0 是新的请求参数，因此应用 fingerprint 仍能区分它与省略。

## 执行边界

Rust 在等比适配、位置/大小和文字行宽处理后，记录静态 `composition.rigidTransforms`。每项由 `id`、完整视觉 `elementIds`、画布归一化 `pivotX/pivotY`、`rotationDegrees` 组成。它只表示静态整组旋转，不代表新的任意滤镜/转场契约。

编译保留已有组、组内运动、组透明度和局部元素。待组与转场生成完成后，将本次应用的全部视觉轨道放入透明容器；原片和音轨在此范围外。容器绕画布中心工作的底层约定，用像素空间补偿 `p − R(p)` 转成绕应用中心旋转，横竖画幅不会把圆周变成椭圆。子轨道起止时间与动画不改，外层 `timeOrigin = startTime`，保持嵌套时钟。

文字依附的布局/运动仍由原关系机制处理；其最终 `groupPath` 在新增旋转容器完成后生成，保证渲染器能找到同一个文字父实例。插入多样式时，对旋转 ID 与成员 ID 同样添加实例前缀，避免旋转宿主文字或其他样式。

明确拒绝跨旋转边界的依附、拆开既有 composite group、混合外部元素的同一视觉轨道，以及穿插外部轨道的视觉范围。不能把单次应用旋转 capture 成保存样式，服务明确报错并建议保存 application history，避免悄悄丢角度。可旋转的样式内部结构与适用组合仍需实际导出检查。

## 位置建议

候选位置保留 `rotationDegrees`，围绕候选应用中心在输出像素空间旋转原始视觉区域四角，再转回归一化 AABB，最后加保护区 padding。返回 `basis=rotated_authored_visual_regions`。它是原始区域的静态包围盒，不测字形、阴影、运动超调或运动中的主体；不是最终视觉验收。

## 编辑与复用

工作台主样式和叠加样式都有旋转角度控件；九宫格移动保留角度。URL、返回工作台的 session、application history 保存/恢复及评审“用这个布局试自己的声音”均带回精确角度。Rust schema 为权威验证；Web 的 `trial-transform.ts` 只处理参数读写，不计算几何。

MCP 的应用、插入和位置建议请求继续直接透传原生契约；描述同步方向、中心、范围与拒绝条件。

## 验证

- Rust `cargo test -p moirai-footage --lib templates:: --no-default-features`：280 通过、1 忽略、0 失败。新增回归覆盖省略/0、非法角度、横竖画幅 ±90°、像素旋转中心、原组平移/透明度与子动画保留、嵌套时间原点、文字依附最终路径、插入成员隔离、跨边界拒绝、旋转保护区与历史恢复。
- Web 参数/session/history/review 17 通过；MCP transport 2 通过。
- `bun run typecheck:web` 通过。首次使用绝对 Bun 路径启动但子脚本找不到 PATH 中的 Bun，修正 PATH 后完成验证。
- 真实三朝向批次 `production-404e3ffd5318e915ef11fc473f42c3ba` 已完成，0/+90/−90 都正常 published。下节记录真实证据；不将单元测试或采样帧描述为完整视听通过。

## 三朝向箭头实际导出

证据页：`/Users/zhengwei/Downloads/application-rotation-20261008/review.html`，完整核对 `verification.json`，实际看过的帧记录 `visual-review-log.json`。

同一冻结箭头 `style-study-20260928-arrow` r3、同一个导师口播输入、同样1280×720画幅和4.94–5.89秒原关键词，只改变 Application 旋转角度：

| 朝向 | 角度 | 独立可编辑工程 |
| --- | --- | --- |
| 右 | 0° | `tpl-preview-a61570f07913fc2ab4dc58bf68f29ae1-0-0` |
| 下 | +90° | `tpl-preview-a61570f07913fc2ab4dc58bf68f29ae1-1-0` |
| 上 | −90° | `tpl-preview-a61570f07913fc2ab4dc58bf68f29ae1-2-0` |

三份MP4与原生测量输出SHA一致，全文件解码通过，原词文本和时间未变，当前工程scenes/settings与各冻结编译文档相同。每份都有6个可编辑箭头叶元素；0°没有新增容器，±90°只有一个外容器，子时钟偏移仍为0。排除独立工程生成的UUID、生产来源标记之后，六个叶的参数/动画和原片参数完全相同；每份原片sourceElementId另外核对为自己的工程来源，未把身份差异当内容变化。

三份音轨解码PCM SHA完全相同；这只证明三个方向输出之间音频相同，不证明已试听。三份都无新文字，测量是有效的sampled空集合，非缺失测量。

实际查看三个全幅稳定帧，以及每个方向的前、入、稳、退、后共15个采样帧联系页。朝向正确，六个部件仍连接，原片画面保持一致；采样可见入退场透明度，没有据此声称完整连续观片。另一个Agent独立查看三张稳定帧得到相同方向结论。

这只是**一个同源输入的技术对照**，不能计成三个独立内容泛化案例，未提交审美评分；`listened=false`、`aestheticQualityVerified=false`。箭头仍须由Agent根据真实目标和方向语义选择角度，服务不自动识别指向对象。

### 独立嵌套文字实片回归

便签 r9 的 Alex 应用完成 +8° 实际导出：`production-cec6db9a43cd8d137abfe7356a028330`。复用原输入、词时间、语义/字幕标注及冻结定义。原 1280×960 下部25%阅读区无法容纳旋转 authored AABB，首次方案被原生位置建议拒绝；改为1280×1080，原片仍为完整1280×720，Application scale 从 .6 调整为 .533333333333 以抵消 contain 变化。较大字体中间候选独立保留，不冒充等字号比较。

正式marker1附件含6条文字布局记录：一行67.2px、两行65.391px、一行67.2px（各含文字/阴影），与未旋转基线实际字号、行数、排版一致；limits的浮点误差以1e-9核对。每条记录的双层groupPath、源track/element ID及scene/local时钟均与保存的可编辑编译文档匹配。实际MP4 SHA、测量SHA和预览SHA一致，完整解码、原词时间、原视频像素比例及导出PCM一致性通过。

人工查看三事件共15张前/入场/稳定/退场/退出后帧（390px显示宽度）：文字、纸卡、阴影、胶带一同旋转，无明显分离；稳定卡片未覆盖脸、手或太阳图示，退出后无残留。本次是已知输入的技术回归，增加120px黑色阅读区，不替代新输入泛化、连续观片或原声试听，不提高模板质量分数。证据与可播放页面：`/Users/zhengwei/Downloads/application-rotation-text-20261008/`。
