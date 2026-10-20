# 双圈强调 r3 对象绑定检查 · 2026-10-08

冻结 `style-study-20260928-rings` revision 3。定义是4个原生椭圆，主圈宽高比1.875，错位双圈及深边/黄墨，没有自动追踪。先审查用户完整75秒视频及NASA John，只有明确静止对象才配置圈；没有修改模板或Rust/UI。

## 输入与精确应用

原片前12秒的“全域推广”完整稳定时间很短，“小心思”逐字扩张，不能宣称圈会跟着字宽变化。“算法”高且贴上沿，椭圆容易裁边/触及脸部，跳过。后来选全长中顶部固定词块：

|案例|对象与视觉调度|最终批次|
|---|---|---|
|domain|原18–22秒裁片顶部“全域推广”；视觉事件0.60–1.25秒|production-ab5bff35547a959c401c924764fbfd0d|
|creator|原44–48秒裁片顶部“大达人”；视觉事件0.95–2.10秒|production-78846e041ac57310978c14572ff77cce|
|skip-moving|NASA John人物/手势移动，展板logo与当前话语不对应，不画圈|production-d4b706d8bae2192a14ad0e796ed904c5|

两裁片均从已授权本地原视频经FFmpeg裁出，走原生import和ASR，得到 `input-c8f365981baef0baa024b6018104a7ae` 与 `input-dfe786dad0092a784306eb41adbd4139`，没有减去时间后伪造词对齐。圈的时间来自人工查图确认的视觉对象事件，源words保持原样。没有重复生成烘焙文字。

初版scale1.3在进入缩放和字角处空间紧，应用v2等比放大到1.45，并微调中心；原模板r3冻结，初版item/manifest保留为 `*-v1-*.json`。逐事件390px图看见余量改善，但圈下缘仍贴近头发、上/侧缘偏挤，domain完整稳定窗仅约0.37秒，因此不能把技术通过当美术通过。

## 验证与边界

三预览published；marker1、实际文件SHA=preview SHA=measurement outputSha，全解码通过，源词数组逐字段相等。模板纯图形，测量records为空，不拿空文字记录证明圈的效果。每个真实事件检查进入、成形、稳定、淡出、消失后帧；圈在词块替换前消失，无观察到残留。负例检查编译图没有ring-main-edge，实际视频无圈。三应用都保存原生Application history基线和带生产证据的子检查点。

正例两片同一人物同一原片；负例只是跳过策略，不是圈的90分视觉胜利。没有连续播放/试听，listened=false、aestheticQualityVerified=false。

## 可编辑文字组合能力缺口

现有 `SpatialRelation` 的 `referenceBounds: text_box`、相对锚点、gap/offset和followMotion能让圈的中心依附实际文字边界/运动。但没有“子元素宽高随文字包围盒与padding自动调整”的字段，也没有按文本长宽比选圈形的契约。现版固定宽高的圈即便跟随中心，仍可能划过字角；不能称为自动包围任意长度的文字。本轮不盲目加case或新增尺寸逻辑，候选组合需先明确可执行尺寸约束。

证据目录 `/Users/zhengwei/Downloads/rings-generalization-20261008/` 包含完整源缩图、边界帧、输入/ASR、精确Application/视觉事件、生产与history、真实成片、逐事件图、review请求/回执。`verify.py`可重复文件、源词、图形出现数与抽帧验证。

当前系列 `style-review-series-cba4bf110dc855d7361f3351bf6be82653ebe37f0ff33c82d6e6e9583fef1de6`，分数 domain82 / creator84 / skip-moving79，系列最低79，current/evidenceCurrent均true。负例评分保守且明确不证明视觉质量；未达到90。
