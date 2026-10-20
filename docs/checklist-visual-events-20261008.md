# 行动清单 r4：用输入事件完成避让与阅读修复

本轮没有修改保存样式 `style-study-20260929-checklist-headline` r4。原声、原词时间、完整原画和人物保护范围均保留；仅由输入 Sample 的标注和 Application 参数表达具体视频的调整。

## 当前结果

原生四案系列 `style-review-series-5b9b72176df46304d68f9d61944151672ddc346d2647a181e0cbd3945040f95d` 已保存并回读，`current/evidenceCurrent=true`。四案共 7 个成片：6 个含强调，1 个预期不产生强调的负例控制。系列最低 **87**，`meetsInternalThreshold/listened/aestheticQualityVerified=false`，尚未达到 90 或最终验收。

| 精确 r4 应用 | 构图 / 动效 / 素材 / 适配 / 可编辑性 | 合计 | 本次结果 |
| --- | --- | --- | --- |
| 中文短、中、长重点 | 22 / 22 / 18 / 16 / 10 | 88 | 同一应用覆盖三词长，阅读、几何、退出检查通过 |
| 导师真人 | 22 / 22 / 18 / 16 / 10 | 88 | 用完整对象名词 `honors program` 做强调，保留原声完整行动指令 |
| Sudha 真人 | 22 / 22 / 18 / 16 / 10 | 88 | 问题卡消失后显示重点，末尾留有退出后帧 |
| 竖屏计划 | 21 / 22 / 18 / 16 / 10 | 87 | 只缩短本次保持，末事件正常退出；黑底留白仍偏多 |

旧 r4 最低 82 的系列 `style-review-series-32b5d6f0e7c6cf13600801d2dce4b597c0842282b5e55639eabd99133f800558`、r3 最低 79，以及各次失败成片均保留。改进后的评审不删除先前失败，不把同一输入的重导出视为新增泛化证据。

## 模型边界

样式保存文字、图标、相对几何和动效规则。输入 Sample 保存语义与显示事件。Application 保存本次画幅、位置、宽度、比例和保持覆盖。

Sudha 对应语义段的自动 `keyword` 指针置空，语义文本、词范围和意图保留；原关键词范围记录在前序历史与理由中。随后在 Sample 添加带来源证据的显式 `keyword` 事件，声明经过画面检查后的显示区间。事件文本来自原词，显示区间不冒充 ASR 对齐时间。当前实现不会按语义自动去重，因此不能同时保留相同重点的自动指针和显式事件。

- `Study really hard`：源词仍为 1.14–2.44s；显示 1.50–3.70s，避开原问题卡并先于下一句 3.74s 退出。
- `learn it now`：源词仍为 15.88–16.72s；显示 15.88–17.33s，使用原片已有尾部空间，未扩展素材或声音。
- 显式事件方案 D 的投影与保存 r4 的原生 Application 完全一致。整片解码 RGB 与早期定制编排 B 相同，但无需修改模板调度，能够原生保存、恢复和准确评审。

导师原 `get into the honors program` 有 27 个字符，预先要求 2.70s 稳定阅读，实际仅 1.52s，失败保留。修复只强调同一指令中的完整对象 `honors program`，源词仍在 0.90–1.58s，显示从该指令原始语义起点 0.00s 到 2.10s，先于下一条建议 2.12s。稳定阅读 1.92s 满足原先声明的 1.40s，完整动作仍由原声表达。负例输入未改，没有强调是正确控制，不计新增成功语义覆盖。

导师主应用保持比例 .8，稳定阅读字号 19.0125px，满足原 18px 预算。入场缩放瞬时的较小字号不构成失败。另留 .82 的稍大字对照，但未替换主系列；生产 brief 中曾误把入场字号写成 failure，已追加 `entrance-readability-scope-correction.json` 更正，原回执和阈值均未改。

竖屏计划只将本次 `minDisplaySeconds` 从 1.8 改为 1.2，Sample 完全不变。最后强调在 12.96s 结束，真实退场含 2 帧，之后 12.966667s、13.000000s 两帧均存在，末帧为空。13.054785s 原声音频没有延长。

## 验证与记录

所有新成片均带 `constant_record_pose_v1` 测量标记，零记录丢弃。核对了完整解码、文件 SHA、实际每帧 PTS、稳定阅读预算、几何、源图编译参数、原声 PCM、原词及原词时间；逐事件查看入场、稳定、退出、退出后和真正末帧。根代理另复核了 Sudha、导师 .8/.82 及 planning 尾部证据。

服务更新后，对 Sudha D 重新只读验证：只移除了已有显式 keyword 事件的两条错误 `content_missing_keyword` 警告，整个 plan 除 warnings 外完全相同；原正文阅读速度等真实警告保留。

三项应用已追加保存，最新只读状态均为 `assetsCurrent/inputsCurrent/projectionCurrent/restorable=true`、`issues=[]`：

| 应用 | 当前历史 ID |
| --- | --- |
| Sudha | `application-b6087604637cefd4829fe6f925b07de498ba7db591b59fadd229d4be80c5844f` |
| 导师 .8 | `application-be1c9156857df663c0cf9a07efdbbc77429a1d6c5bae69fdf913f31e43edaae0` |
| 竖屏计划 | `application-db09c0dbfbfcdb0368bffb7bdf797cf88978cf932c53fb9fb3f578e76f063171` |

这里报告的是原生可恢复状态，没有执行恢复来改写项目。原生历史只读响应仍为 `sourceFilesVerified=false`，不代替本轮独立媒体文件核验。

本机完整证据目录为 `/Users/zhengwei/Downloads/checklist-application-r4-20261008`：

- `review.html`：当前四案可播放成片、旧失败与独立候选。
- `review-series-request.json`、`review-series-receipt.json`、`review-series-readback.json`：精确分项、保存与有效性回读。
- `verification.json`、`series-verification.json`：成功和失败的实际检查数据。
- `adaptation.json`、各 `*-history-readback.json`：应用差异和历史状态。
- `new-service-diagnostic-regression.json`：诊断变更未改变执行结果的逐字段证据。

## 仍未关闭的质量项

本轮没有连续播放或感知试听，没有新增独立真人背景，没有加入完整正文字幕轨。完整转写和原声保留不等于画面已经显示正文字幕。

清单目前仍是基础办公图标，三个勾的入场近于静态符号；黑底输入留白偏多。候选 C 将勾选分为 60/120/180ms 的顺序确认，属于轻微节奏改善，尚未保存到通用库或纳入 r4 系列；三条装饰线不代表已识别三个实际行动。这些审美和覆盖限制不能由技术检查通过替代。

前序证据见[行动清单泛化记录](checklist-generalization-20261008.md)，通用边界见[模板泛化策略](template-generalization-policy.md)，历史协议见[单次应用历史与恢复](template-application-history.md)。
