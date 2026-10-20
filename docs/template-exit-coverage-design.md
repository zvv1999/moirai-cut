# 动效退场采样约束：设计与实现

2026-10-08。本文保留最初设计推导；Rust、工作台、MCP、历史恢复和真实双成片回归均已完成，本地服务已部署。缺省行为与旧评审保持。[部署及实片证据](exit-sampling-contract-20261008.md)确认失败0/0帧和返修1/4帧，且增加约束前后解码像素/PCM一致。

## 已确认的缺口

- `model.rs::MotionTiming`仅表达进入/退出的比例区间及固定秒数；`Timing.endAnchor`决定事件结束边界。两者都不表示“允许直接切出”还是“必须在输出中看到退出及之后的帧”。
- `motion_timing.rs::resolve`在实例过短时同比缩短进入/退出；最后关键帧放在实例duration。关键帧存在不证明采样器会采到它。
- `scene-exporter.ts`使用round(TICKS×fps.denominator/fps.numerator)得到帧步长，再floor(duration/step)得到完整帧数；最后实际输出时间为(frameCount−1)×step。
- `production_text_measurements.rs::validate`已严格校验framesObserved等于上述预期值、记录场景/本地时钟、活跃区间和连续采样次数；它不携带退场要求，不能据此认证退出。
- `production.rs`校验文件尺寸、时长、SHA、全解码及音轨；`production_quality.rs`的流时长容差不能证明末尾动效完成。
- `events.rs::diagnose_readability`根据最终实例时长提示minDisplay不足；它没有帧量化后的退场/退出后覆盖检查。

已知真实反例：12.3454s原音频、30fps、370帧，末帧12.300s；效果退场起点12.3054s，编译末关键帧opacity=0仍不能使输出包含退场。返修把有语义依据的重点事件改为10.12–12.2s，实际编码帧才覆盖淡出与后续空帧。旧失败完整保留。

## 建议的最小契约

优先在已有 `MotionTiming` 增加可选 `coverage`，共享于独立元素和组的动效时序，避免把要求绑定到字幕：

```json
{
  "enterEnd": 0.2,
  "exitStart": 0.9,
  "enterSeconds": 0.09,
  "exitSeconds": 0.04,
  "coverage": {
    "minExitFrames": 1,
    "minPostFrames": 1
  }
}
```

缺省表示**没有额外采样要求，允许结束切出**，不改变旧模板/旧评审。显式coverage表示作者需要检查；两个计数均整数0–120，不能同时为0。`minExitFrames>0`要求exitSeconds>0。此字段只约束采样机会，不保证每帧视觉变化、元素已透明或退出曲线好看。

为什么放在MotionTiming：已有独立元素和组都使用此对象，有明确exitStart/exitSeconds；如果只有任意关键帧且无MotionTiming，无法可靠推断作者把哪段称作退出，不猜测。未声明MotionTiming的自定义运动第一阶段明确“不适用”，不假称覆盖全部自定义动效。未来支持独立验证区间应另行设计。

模板默认是风格意图。本次Application不隐式关闭它；Agent选择更早的语义事件、调整合法保持/位置或换模板来满足要求。若需要本次覆盖，必须后续补齐显式Application覆盖、编辑UI和历史往返，不能仅后端暗改。

## 原生计算与输出

1. Rust在最终生命周期、父组时钟和所有clip边界确定后计算，使用与导出一致的整数tick步长。不能使用未裁切前的理论事件时长。
2. 退出开始使用已resolve的时序；有效区间取元素、祖先组、选中场景和导出范围交集。
3. `exitFrames`统计实际帧时间处于退出开始（含）至有效结束（不含）的机会数；`postFrames`统计有效结束（含）之后、导出结束（不含）的帧数。退出被父组先截断时记录`ancestor_clip`，不能把父组提前消失当作子层完整退出。
4. 对明确coverage要求，输出expected/observed的结构化结果：实例/元素ID、组路径、退出开始、有效结束、输出最后帧时间、两种计数、状态及原因。编译阶段叫`predicted_frame_sampling`，不能标成已读取实际MP4的视觉证据。
5. 生产入库阶段以探测的实际视频帧数/帧率核对预计采样；不匹配是证据不足或技术失败，不用声明的framesObserved替代实际容器/解码事实。CFR实际帧率明确时可核算，VFR需实际帧PTS，不以平均fps冒充。
6. 首阶段建议作为显式作者约束的诊断（warning），预览仍允许生成以供返修；质量评审若要求无阻断，必须显式记录未满足项。不要自动扣审美分、设置listened或aestheticQualityVerified。

`postFrames>=1`只表示实例有效区间结束之后有帧，不能证明其画面为空：其他层可能继续存在，循环/遮罩可能影响可见性。因此字段命名和UI应使用“退场区间采样/结束后帧”，不要使用“已彻底消失”。

## 接入范围及验收

实现应一次完成：Rust schema/校验/投影、元素与组编辑往返、试映session、Application历史保存恢复、MCP schema说明，以及Web对原生诊断的显示；不在UI复制采样算法。默认缺省必须保持所有现有定义投影与行为。

必要测试包含：允许cut且片尾有文字不告警；显式coverage但退出起点晚于末帧告警；退出有采样但没有post帧分别报告；非整数fps和tick量化；退出点恰好落帧边界；父组提前截断与正常组退出；实例中途退场；零退出时长；历史缺省往返不引入新字段；恢复/编辑不丢coverage。真实回归用已保留青色失败与返修两份文件，不重新给旧文件打分。

这是一项采样契约补齐，不是当前20款缺少的连续观片/原声试听的替代品。

## 实际编码PTS反例/正例回归

已用ffprobe解码并读取两份已保留MP4的全部视频帧时间戳，文件SHA与生产证据一致，实际帧数与measurement一致。两片均370帧、末PTS12.300s。旧片退出区间12.3054–12.3454s没有任何编码帧、结束后也无帧；返修退出区间12.16–12.2s有12.166667s一帧，结束后12.2/12.233333/12.266667/12.3共4帧。不是用编译期fps推导替代文件观测。

完整证据：[exit-pts-audit.json](/Users/zhengwei/Downloads/cyan-generalization-20261008/direct-overlay/exit-pts-audit.json)。`minExitFrames=1/minPostFrames=1`是用于验证提案的回溯示例，不是旧模板已有字段；未据此修改旧评审或生产状态。该对照能证明提案区分已知问题与修复，仍不能替代视觉退场和原声试听。

## 字段传递审查：实现时必须一起处理的入口

已读当前组件及原生实现。普通编辑使用对象展开或完整Definition，新增可选字段有自然保留路径；但不能只在struct上加字段后就宣布闭环：

| 入口 | 当前行为 | 新增coverage后的要求 |
| --- | --- | --- |
| `element-motion.tsx`数值调整 | 展开原motionTiming再改秒数/比例 | 保留coverage；共享编辑控件提供允许切出/显式覆盖要求 |
| 同组件切换relative模式 | 将整个motionTiming置null | 明确同时取消采样要求；不能显示仍启用 |
| `element_edit.rs::apply_envelope` | 重新构造四字段MotionTiming并替换 | 应继承原coverage，或支持显式清除；不能用户只换入口动作就静默丢要求 |
| `dynamic_asset_edit.rs::Operation::Envelope` | 调用apply_envelope后拷回timing | 跟随上面继承语义并加回归 |
| `Operation::GroupFade` | 保留enterSeconds但删除重建Motion treatment | 应从同目标旧managed treatment继承coverage；exitSeconds=null删除效果时一起清除 |
| `composition.tsx`通用Motion treatment | 数字编辑展开timing，模式切换重建/清除 | 与元素相同的显式模式语义；循环与fixed phases现已互斥 |
| `dynamic-assets.tsx`直接保存 | motionTimings映射完整对象，读写Definition | 类型同步；草稿比较会包含新增字段；补选中/修改/保存回读 |
| MCP envelope/group_fade描述 | 仅介绍固定秒数与短事件压缩 | 补继承/清除语义，仍从原生schema读取，不写另一套业务算法 |

当前不存在coverage字段，因此上述是**新功能接入风险清单**，不是宣称现有字段已经丢失的bug。正式实现必须保持当前模板revision和历史可还原；改变默认行为须另版本、另证据。


## Rust最小契约已实现并部署

实现文件 `rust/crates/footage/src/templates/exit_sampling.rs`。默认coverage省略时不增加节点metadata、不执行额外probe、不要求旧工程补fps。固定时序的新字段由原生schema生成；验证仅限制0–120整数、不能双0、要求退出帧时exitSeconds必须正值。分组与元素使用同一MotionTiming；重复应用envelope和managed group_fade继承coverage，明确删除时序或fade时清除。已有历史记录仍按缺省允许cut。

预测在最终文档/父组时钟及裁切边界上运行，返回：

```json
{"exitSampling":{"basis":"predicted_frame_sampling","samplingEvidence":"not_measured","status":"not_requested | passed | warning","records":[]}}
```

每条record含elementId、templateElementId、templateInstanceId、groupPath、source、exitStartTicks、effectiveStartTicks、effectiveEndTicks、lastFrameTicks、exitFrames、postFrames、required、findings。`exit_sampling:` warning附`{basis,record}`，不阻断预览。可能findings为`insufficient_exit_frames`、`insufficient_post_frames`、`ancestor_or_export_clip`、`no_active_interval`。独立运动和treatment元数据以`params["template.exitCoverage"]`的JSON字符串保存，dedup可以重算诊断，不依靠旧warning。执行与预测共享`resolved_phase_seconds`压缩公式。

动态示例、Application预览、真实sample预览均透传exitSampling；published preview保存冻结fixture.compilation的同一预测，避免当前UI参数冒充出片时参数。

### 实際MP4帧证据独立保存

仅有显式coverage的生产项在常规技术校验后额外调用ffprobe `show_frames`，读取每帧`best_effort_timestamp_time`。不从平均fps推断；使用实际PTS转换为工程ticks，严格要求非负递增且有帧，按`max(exitStartTicks,effectiveStartTicks)`至有效结束的半开区间重计退出帧，另计结束后的帧。读取后再次核对文件SHA。

published preview另带`observedFrameSampling`，basis=`decoded_video_frame_pts`，status=`passed|warning|not_measured|not_requested`；成功记录outputSha256、timebase、framesObserved、lastFrameTicks及相同record格式（计数来自实际PTS），并保持pixelDisappearanceVerified=false/listened=false。读取失败为not_measured和reason，不用预测值冒充实际数据，不因可选证据失败拒绝预览。实际时间戳通过也不证明画面透明或动效好看。

### 已执行验证

11项Rust专项（含真实ffmpeg生成MP4、ffprobe读取及工具缺失反例）全部通过；覆盖默认cut、已知失败/修复数值、组时钟/裁切、帧边界/非整数fps、字段验证/缺省JSON、编译dedup、分组预览warning、envelope/fade继承、原生history存储恢复、实际PTS不继承预测结论。MCP相关14项测试通过。真实probe测试：1秒30fps合成视频实际30帧、末tick116000，所选退出区间1帧、结束后3帧；不存在probe时not_measured，无coverage时不调用probe。

后续主任务已统一部署并完成两份真实生产验证，详见部署证据。未发布模板新revision；全库评分、最终视听状态保持不变。

### 长视频统计与发布缓存补查

实际PTS窗口计数已改为在一次验证过的递增数组上二分查找，由逐实例扫描全部帧改为每实例两次O(log帧数)边界查找。新增有效起点裁切、反向空区间、clip原因保留和缺少结束后帧用例；专项现为12项全部通过（含真实probe）。`minExitFrames>0/minPostFrames=0`仅承诺退出区间有指定数量采样，不保证到达退场终点；要结束后帧须显式要求minPostFrames。

发布存储及幂等缓存已读审：首次发布把预测和观测随整个previews持久化；published重试与事务并发分支返回原entry，不丢观测；read/item旧测量注解和音频reaudit也不会删除观测。旧published重试不追补新证据，缺失观测继续保持未测。未改审美或试听字段。
