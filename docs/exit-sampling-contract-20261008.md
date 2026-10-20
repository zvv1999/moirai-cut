# 显式退场采样：部署与真实成片回归

2026-10-08。本地服务已部署，`/api/footage/state`与实时schema回读通过。新增契约覆盖模板元素、独立组动效、工作台、MCP、历史保存恢复、真实生产与证据展示。完整设计见[契约文档](template-exit-coverage-design.md)。

## 使用语义

`MotionTiming.coverage = { minExitFrames, minPostFrames }` 为可选作者要求。两个整数范围0–120、不可同时0；要求退出帧时exitSeconds须大于0。缺省允许直接切出。计数只表示退出区间和实例结束后的采样机会，不保证像素变透明、退场自然或声画效果优秀。

Rust在最终实例/父组/输出边界确定后生成 `exitSampling`，basis为 `predicted_frame_sampling`，明确 `samplingEvidence=not_measured`。它采用导出整数tick网格；共享已解析阶段时长，避免与动效执行压缩算法不一致。父组/导出提前截断单独告警；不猜任意自定义关键帧的退出意图。

有显式要求的实际成片额外用ffprobe读取每帧 `best_effort_timestamp_time`，重新统计有效区间，返回独立 `observedFrameSampling`，basis为 `decoded_video_frame_pts`。结果绑定当前MP4 SHA，扫描后再次核对SHA；不以平均fps替代实际PTS。缺工具/异常时间戳明确not_measured。正常文件按递增PTS二分查找窗口，避免长视频×多实例全量重复扫描。采样不足产生warning而不阻断试映，不自动写审美分或试听标记。

## 编辑及展示闭环

- 元素与composition motion treatment均可开关约束、分别编辑两个帧数；动态素材组的既有淡出可编辑同一对象。
- 改秒数或使用原生envelope/group_fade保留coverage；切换相对模式或明确删除组淡出清除相应约束。
- 动态素材组回写先合并未保存的完整definition，保留其它草稿字段。原生应用历史中的definition快照保存/恢复约束。
- 即时预览显示预测；生产面板分别展示预测与实际帧证据，SHA不匹配时提示过期。旧产物不追补“已测量”。发布重试、读取、音频复审保留已存观测。
- 独立审查修复了旧预览身份只检查模板的缺口。模板/素材类型、sample、duration、示例文本/重点/出现次数/语义/同排范围共同标识请求；输入一变立即隐藏旧画面、测量和诊断，过期回包不能为新输入所用。

UI只读写参数和显示原生结果，不计算事件/退出采样或复制业务规则。

## 真实同源反例与正例

使用已保存青色r3两份历史manifest，仅给草稿增加coverage(1,1)，通过标准生产重新输出；模板库r3保持。两份均为370帧，末帧12.300s：

| 文件 | 最后事件退出区间 | 预测退出/后续帧 | 实际PTS退出/后续帧 | 结果 |
| --- | --- | --- | --- | --- |
| 旧失败 | 12.3054–12.3454s | 0 / 0 | 0 / 0 | warning，仍可预览返修 |
| 已有返修 | 12.1600–12.2000s | 1 / 4 | 1 / 4 | 采样数量满足 |

旧失败批次 `production-9437de76d7503505b963bbe453142a38`；返修批次 `production-4746f70df04362193ec612978a507a16`。实际结果另外独立ffprobe核对一致。每份的解码RGB画面及48kHz双声道PCM哈希与对应旧MP4相同，证实增加约束不改变原渲染/声音。原ASR词、marker1测量与输出SHA、完整解码、可编辑工程与冻结scene/settings一致。重复author返回同批次，observed字段严格不变。

[完整验证JSON](/Users/zhengwei/Downloads/exit-sampling-contract-20261008/verification.json) · [视频和证据对照](/Users/zhengwei/Downloads/exit-sampling-contract-20261008/review.html)。

## 验证范围

实现阶段Rust完整lib回归312项通过；之后PTS二分优化及额外边界用例的12项采样专项通过（含独立运行真实ffmpeg/ffprobe集成测试）。MCP相关14项通过；前端请求身份、退场控件/证据、现有测量证据10项60断言及完整TypeScript通过。另有先前trial导航回归通过。独立读审检查了组草稿、继承/清除、冻结证据与缓存路径。

本轮没有完成浏览器实际点击验收或感知试听。真实生产回归验证的是契约及编码帧覆盖，不新增输入泛化证据，不改变任何样式评分，`listened=false`、`aestheticQualityVerified=false`。并未将用户参考工程用作测试输出。
