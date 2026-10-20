# 清晰字幕 r4：三输入当前版本验证

2026-10-07开始，2026-10-08追加当前小屏字号返修。冻结 `style-pilot-20260923-caption` revision 4；**最新系列89/90/90，最低89，未最终通过**。早先87与88保留历史。未修改模板或参考工程；最新证据见末节。

## 输入与应用

| 输入 | 词数 / 字幕单元 | 生产批次 | 分数 |
|---|---:|---|---:|
| Deborah 浅墙真人 | 26 / 4 | `production-3cdd9b750739a275006f6ff30f166981` | 87 |
| Alex 太阳图与深色服装 | 37 / 5 | `production-a4870ed881198cc7cdef4f9a6c75dd4a` | 89 |
| 中文合作原音，黑底 | 39 / 4 | `production-e72ef81bbc8a703e1bf856b5f80c2e36` | 90 |

均为独立 `previewOnly` 批次，实际导出成功；三源已存在本地库，没有外发视频。两个真人保持原视频完整比例，放入 `[.1,0,.8,.8]` 区域，字幕在下方独立黑底区；scale .8、captionWidth .90、中心 .5/.896。中文在黑底中央，scale 1、captionWidth .78。没有套用花字最短保持，也没有拉长词或音轨。

首次字幕中心Y=.89与受保护原画面有极小重合，placement-advice拒绝；保留 `deborah/placement-rejected.json`，中心改 .896后才生产。不缩小保护区以绕过检查。

## 验证了什么

- 编译输入 `words` 与保存转写逐字段完全相同，覆盖102词、13句，没有漏词或改写。
- 每句 `text.wordTimings` 的 UTF-16 范围对应原词；绝对开始、结束 ticks 与源词时间一致；每个词的活动高亮关键帧范围及开始时间一致。
- 每句独立可编辑文字层，生产图严格匹配冻结r4的精确Application（只归一生产ID）；回读定义未变。
- 三成片SHA与服务记录一致，服务全解码及音频覆盖验证通过。未将技术音频检查称为试听。
- 每句取开始前、开始、进入、.14秒后、稳定中点、最后帧和可用结束后帧，共91张；查看全部联系图及390px宽缩图。没有所见裁字、首尾整句淡出或压住原手势/太阳图示。
- Deborah末句结束6.98秒，而片长7秒，没有可靠退出后视频帧；已明确标记 `input-tail-no-post-frame`，不谎称观察到退出后状态。

## 分数和未完成项

跨输入系列 `style-review-series-655b748d27c476b67e063678875fd5f0f1a905c00c9a5fbc688ccdd52e2338b4`，最低87。回读 `current=true`、`evidenceCurrent=true`；三例全部保留阻断项，内部阈值未通过，`listened=false`、`aestheticQualityVerified=false`。中文90分也不等于最终验收。

英文显式字幕单元超出继承的字符数、读速预算，部分Alex长句超时；这些原生警告保留，不通过放宽模板规则消除。小屏静帧可辨不能证明快句随原声阅读充分，尤其Deborah短句和片尾。实际浏览器字号/排版测量在当前浏览器访问限制下尚未完成，不把编译字号或截图像素冒充实际fontSize。

这里是“独立字幕阅读区”的应用证据，不是任意真人画面直接叠字通过；边框和缩小的原视频牺牲部分沉浸感。后续应评估语义一致的字幕分段、实际字号/稳定时长门禁、播放速度下的阅读与原声试听。所有调整继续限定在本次应用，不把单句时间或人物坐标回写模板。

证据目录：`/Users/zhengwei/Downloads/caption-generalization-20261007/`。`check.py`可重复核对词时间/图层/哈希；`review-series-request.json`保留分项依据与阻断。查看[本地成片对照](/Users/zhengwei/Downloads/caption-generalization-20261007/review.html)。

## Measurement-backed application refinement · 2026-10-08

在新增正式 renderer 测量后，只对本次 Application 做了一轮返修。真人画面区域由 `.1,0,.8,.8` 缩至 `.13,0,.74,.74`，字幕中心由 `.896` 上移至 `.85`；Deborah 后段和 Alex 语义相邻单元合并，未改 ASR 词时间、活动词范围或冻结 r4 模板。Deborah v1 的字幕宽度 `.84` 使长句实际字号降至 45.12px，随后 v2 改 `.92`，正式导出实际字号回升至 49.45px，两行无溢出；Alex v1 四层实际均 51.2px，最长两行。中文原测量案保持为控制组。

返修后的复评 series 为 `style-review-series-e0cdf81368a9b049f936312d4638642323312aa0d2513c21d7ec5cb034406daa`，读回 `current=true`、`evidenceCurrent=true`，诚实最低分 88。原生 `reading_speed_exceeds_limit`、`caption_exceeds_character_budget` 仍保留；没有把字号测量当作试听或审美通过，`listened=false`、`aestheticQualityVerified=false`。如需达到更高分，应在原声播放中验证阅读并继续按语义分段，不能放宽模板阈值。

## 完整姿态与手机字号返修 · 2026-10-08

进一步按390px观看宽度核对发现，之前Deborah长句49.45源像素仅约15.07显示像素，Alex的51.2源像素仅15.6显示像素。旧测量还只保留首帧姿态，不能认证整段几何。当前试验保持r4定义、原声、原词时间、语义段和关键词范围，只改变Application及Deborah的字幕显示单元。

英文采用1280×960画布，上方原1280×720图像完整等大展示，下方25%为阅读区；不再把原画缩至74%并加左右黑框。该选择改变输出画幅，不能宣称仍是16:9。字幕Application scale=.95、width=.94，参数属于这两次应用，未固化为模板通用默认或人物坐标。

| 当前应用/对照 | 批次 | 完整姿态记录/丢失 | 390px观看字号 | 几何/稳定预算 | 评分 |
| --- | --- | --- | --- | --- | --- |
| Deborah整句失败对照 | `production-9ff7809cfd881780beed4ab67d46818e` | 11/0 | 24.7、15.33px | failed/failed | 不登记新分数 |
| Deborah分句版 | `production-5c7324adabdd558104d58b92f1b5c912` | 16/0 | 23.43–24.7px | passed/failed | 89 |
| Alex完整画面 | `production-fa9770f65b4b8eda44967b9f5f748a0d` | 22/0 | 四句均24.7px | passed/failed | 90 |
| 中文同外观回归 | `production-bc06382cdf1eac9ad2e93de79d55b5dd` | 22/0 | 19.5px | passed/passed | 90 |

整句仅增大区域，后段仍会缩到15.33px。按原有分句将显示范围9..26拆为9..20与20..26后，所有26词恰好覆盖一次；语义段仍为9..26，说明语义组织和屏幕显示单元可以独立调整。`layoutPhrases`、关键词与ASR时间保持，不新增台词特例或删除词。Alex原37词和所有sample字段原样；中文39词原样。

三份当前成片都有 `constant_record_pose_v1`，当前SHA与生产附件相同；工程scenes/settings与冻结编译一致。全部全片解码，三个音轨与各自旧版PCM相同；中文解码RGB也相同。根查看了Deborah三版同时间画面、Alex全部4句阶段图和中文全部4句阶段图。独立复核覆盖英文UTF-16词范围、逐词活动色时刻、画面零裁切及字幕框不进入源画面。不是连续播放或感知试听。

诊断使用原10字符/秒预算，未为英文调高阈值。Deborah末句只有1.1秒，且6.98秒结束/7秒片长没有字幕后置帧；英文读速/字符预算仍是阻断。语音间隙中的字幕空白对应源时序，没有暗中延长字幕。中文黑底控制和数值90也不证明真人复杂背景质量。

当前系列 `style-review-series-b43df395273d53b1fa5a36a25ed004a2214ef8185f7707a1038bdddd21afabfa` 回读 `current=true/evidenceCurrent=true`、最低89；内部阈值、试听和最终审美均false。六条应用历史保留Deborah旧案→整句失败→分句修复、Alex旧案→放大以及中文回归，均回读可恢复。早先87/88系列和本次整句失败保持。

证据及可播放对照：[review.html](/Users/zhengwei/Downloads/caption-reading-scale-20261008/review.html)。这轮改善实际字号与画面占比，没有新增独立背景，也没有完成20款目标。
