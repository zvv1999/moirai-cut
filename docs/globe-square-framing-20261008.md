# 地球 r4 方形构图返修

2026-10-08。冻结 `style-study-20260929-globe` revision 4 的十四层定义，完成两份同源方形实际生产。当前推荐系列 **90 / 89 / 89，最低 89**；尚未达到 90 分目标，全部 `listened=false`、`aestheticQualityVerified=false`。旧黑底 84、模糊背景 87 和新切手候选 89 均保留，没有删除失败提高分数。

## 应用与真实返修

| 版本 | 参数与结果 | 批次 | 分数 |
|---|---|---|---:|
| 旧黑底 | 大面积空黑区，造型更新后仍割裂 | `production-c6898e08a838e367791f48b290ecb4d0` | 84 |
| 旧模糊分区 | 完整16:9居中，模糊上下背景重复人像 | `production-b2948eedd18c1f6b4c453a077c58c70d` | 87 |
| 单画面候选 | full_bleed、focalPoint(.66,.5)，消除分区/字标，但新增手部侧裁 | `production-dd73f3a5ca120107aa3120a1369476c6` | 89，失败历史 |
| 当前推荐 | 焦点改为(.61,.5)，恢复手势侧缘，左侧残缺标识重新入画 | `production-0e487f6a6ed78a0c0c71f854890a6602` | 89 |

两次新 Application 相同：720×720、30fps，全画布单幅 source_video、`blurredBackground=false`，地球 `scale=.36`、`center=(.80,.24)`，原1.2秒事件保持。第二次只改变 Sample 的焦点；r4定义、原声音、所有对齐词、语义选择及字幕边界均不变。图标实际171.072px，390px展示宽92.664px，球面/细线清楚；未把位置、人物保护区、词下标写回样式。

第一版在独立复核中发现切手。取原片8.8–9.8秒连续31帧，按实际PTS对照，确认原片完整可见的左指尖/掌部在约9.03–9.5秒被 `.66` 的左边界x727.2新裁去。手工保护矩形建议通过不能证明视频裁切安全，因此否决90；追加失败检查历史，保留89。

第二版焦点 `.61` 左边界x631.2。实际成片相同31帧下半幅未见新增横向切手，原片底部自然截断仍在。人物较居中，右上地球与脸间有空隙。但Goddard尾部字样从左边缘进入并被裁，完整标识与部分左肩仍未保留；源横向视野只有56.25%，不适用于必须保留背景身份标识和整个环境的情形。保留构图22、动效23、素材19、适配16、编辑性9，总89，不以披露限制代替修复。

这些都是同一个John输入、同一NASA布景的应用返修，不能当成新增独立输入/背景验证。两个原横屏评分90/89及原有阻断逐字沿用。

## 验证与边界

- 两份新MP4均published、完整解码420帧；输出SHA=previewSHA=textMeasurements.outputSha256。marker1、sampled、droppedRecords0；没有文字，records为空不作为文字测量通过。
- 源文件SHA、当前transcript与编译words逐字段一致；Sample除新增/改变focalPoint外与旧方形逐字段相同。两份音频解码PCM与旧r4方形一致，未进行感知试听。
- 原生Application回投影与生产模板一致，只允许逐项存档的11处1ULP JSON浮点传输差异；没有改动成片模板掩盖不可重建行为。
- 每事件十四个ellipse叶、独立复合组。事件4.46–5.66s、9.28–10.48s与旧版相同；经线0.20秒稳定、1.14秒起退、稳定0.94秒，组末透明。实际退场中间PTS帧分别1、2；查看两事件全部局部联系页与退后帧，未见残余线条。未连续实时播放。
- 当前工程scenes/settings与冻结编译一致。单画面只保留一个source video元素，无blur effect；编译源scale/shift与focalPoint几何匹配，第二版positionX=-140.8。
- 5条追加Application历史均`restorable=true`，沿旧方形context写入，未执行恢复。`sourceFilesVerified=false`是原生历史状态；源SHA另由核验脚本检查，不篡改此字段。

观看范围在证据目录`visual-review-log.json`；包括源裁图、源31帧手部边界、两版稳定帧/第二事件阶段/两事件连续局部图/半秒全片抽帧、第二版31帧真实手势。不是检查所有全分辨率帧、连续播放或试听。保护矩形由Agent人工给出，native advice只做几何检查，不是图像识别或像素碰撞证明。

## 保存结果

当前推荐原生系列 `style-review-series-e28ac2a10fe3ade32a1388aa50940f0001a3af49de3246f8cca9a87192e54fc7`，90/89/89，保存后回读current=true/evidenceCurrent=true。旧全历史84系列与新单幅失败89系列仍保留；native `current` 表示定义revision仍有效，不表示该历史系列是当前推荐版本。

当前方形工程 `tpl-preview-0a7c0dc29e3fc47d10185805508ebe64-0-0`；当前历史head `application-92d54e6fba616b1ca48ed3b673c178d7fccf5eb15df8399d157a39907648cdc3`。

仍缺明亮复杂独立正例、未参与调参新输入、中文地球语义、字幕叠加与完整视听。源裁切仍需由Agent根据个案人物/动作/标识权衡，不能复制固定焦点当作通用安全规则。

证据入口：`/Users/zhengwei/Downloads/globe-square-framing-20261008/review.html`。未改主账本，未重启服务，未改r4定义或可移植seed；两份新增生产均已完成，无在途导出。
