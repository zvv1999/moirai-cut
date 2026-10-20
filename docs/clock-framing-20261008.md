# 时钟 r6：方形构图返修

2026-10-08。当前系列横屏91、竖屏90、方形90，数值最低90。当前系列 `style-review-series-842ddc8747f8db146350755a876945a34877a3ac99439a27f14232d3218c7e34`。未连续播放、未感知试听，最终验收仍未完成。

## 改动边界

模板 r6、28个原生可编辑部件、.25方形应用尺寸、135ms入场/45ms组淡出及4.9–5.9s“good time”事件保持。仅本次Application去掉模糊重复人像、将时钟放到右上(.86,.14)，Sample选择1280×720原片的右侧720方形（x=560..1280，focalX=.71875）。左肩与部分背景被裁切，脸和关键手势在已检查帧中保留；不宣称完整源画面被保留。

| 取景焦点 | 结果 |
| --- | --- |
| .58 | 3/4秒手势裁切，失败保留 |
| .64 | 片尾更大的右手仍裁切，失败保留 |
| .68 | 0.5秒抽样未充分暴露问题；10.5–11.8秒逐帧补查发现11.1秒手指裁切，失败保留 |
| .71875 | 保留右侧原画面边界；57张整段/动效帧加40张密集手势帧检查通过，当前90 |

当前批次 `production-40da229e5c227afbe7ff22cb895fa120`，可编辑样例 `tpl-preview-a6ac5c887ea6745df870611b27d7c86a-0-0`；SHA `754691ceda9d9f3bea5fcd86a782d24165b754bfc6464e7ac38c821888467283`。四批次均已生成真实MP4。28部件的参数/关键帧与旧大档比较除平移外相同，工程scene/settings与冻结编译一致；原ASR词/时间、完整解码和marker1已查，文字测量records为空（图标无文字），没有把空记录称文字可读性通过。四版与旧同源音频解码PCM相同；不能据此宣称听感好。八条应用历史完整回读且可恢复。

## 分数与泛化限制

方形为 composition23 + motion23 + assets18 + adaptation17 + editability9 = 90。主体单画面和关键手势改善支撑构图升分；独立输入覆盖分没有提高。旧小尺寸86、模糊大档89和前三次裁切失败均保留。当前系列复用此前已检查的7份横屏、3份竖屏，新增这一份方形推荐应用，共11份；方形仍为原Sudha源，不计作新输入。

本轮只做逐帧/阶段图审查，没有真实浏览器交互、连续播放或感知试听，`listened=false`、`aestheticQualityVerified=false`。仍需新真人方形正例和最终视听。

[四轮视频对照](/Users/zhengwei/Downloads/clock-framing-20261008/review.html) · [当前评分](/Users/zhengwei/Downloads/clock-framing-20261008/review-series-readback.json) · [原生/音轨验证](/Users/zhengwei/Downloads/clock-framing-20261008/right-boundary/verification.json) · [密集手势图](/Users/zhengwei/Downloads/clock-framing-20261008/right-boundary/hand-motion.jpg) · [八条历史](/Users/zhengwei/Downloads/clock-framing-20261008/history-readback.json)

## 独立视觉复查

另一审查Agent另取实际MP4的3.0/5.4/11.1秒全帧、2.7–3.4667秒24帧连续左手运动。未发现否决当前方形90的明确新增遮挡或几何失败：右侧指尖保留，底部手部截断源片已有；左掌/指尖保留，披露的左肩裁切仍在。时钟近正圆、双针共轴且不遮脸。左侧身体靠边、背景树叶繁复仍是视觉余量。本项不新增分数或最终标记。

[独立左手运动检查](/Users/zhengwei/Downloads/clock-framing-20261008/independent-review/left-motion.jpg) · [11.1秒](/Users/zhengwei/Downloads/clock-framing-20261008/independent-review/frame-11.1.png)
