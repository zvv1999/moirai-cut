# 完成勾选 r5：Deborah真实提交动作验证

2026-10-08。新增真人明确已执行动作的正例，冻结 `style-study-20260929-completion` r5，定义、通用动效、原视频和原ASR未改。本案阶段90分；新四案系列最低仍86，不覆盖旧三案缺口，不宣称完成最终目标。

## 原句和语义边界

完整本地母片通过原生本地ASR得到 `input-422934139a6c23fbce1947bb3099e017` r1，266.707秒、455词。原母片来自已存Publicdomain CDC/NIOSH资料，未新下载或上传；转写过程和另一份John母片数据见[真人完成语义检索](completion-real-source-search-20261008.md)。

原话 **“I put in my application”**，words269..274（end-exclusive）、145.45–146.93秒。其后是“and the rest is history and I absolutely love it.”至149.83秒。Agent阅读完整上下文并检查画面，根确认只将它解释为**申请提交这个动作已经做过**，不能表示录取、批准、毕业或整个职业目标已经完成。

显式事件147.00–148.20秒在application词结束之后，避开约146.3秒的景别变化，位于完整语义words269..284（145.45–149.83）之内。只有这一个事件，其余母片内容不加完成勾。事件文字 `application submitted` 是Agent的状态标注，模板本身只有图形，不新增显示文字；不是自动识别完成语义。

## Application与事前目标

保留1280×720完整画幅，scale0.40，中心(.18,.22)，左上空墙放约218.88px圆章（约66.69px@390）。人物、脸/头发、制服标识和两侧植物为人工保护区。源native30000/1001fps的146.716–148.485共54连续帧已实际查看，没有把源帧冒称30fps。事前声明完整勾形稳定至少0.7秒，必须短/长笔、3个圆帽和圆底都形成，不能拿没有文字溢出替代图形检查。

使用两份独立正常生产批次：同一输入不能在单个批次重复作为Sample，原生预检拒绝后改为正例/无触发控制两批。没有重复生成正例，也没有修改原输入或声音。

|用途|批次|正式输出SHA-256|
|---|---|---|
|真人提交完成正例|`production-e20c537cd48822fbf3c6fc44484239d6`|`ce06ba4d5da58a985fab8e577601565b9ec580f068e06415be2d5a1ad4592a0e`|
|同Application无触发技术控制|`production-c4acf935f49db3d585a4e3c944d32c81`|`9250f416ee3cf03b290e664071f3f63a9e71733e742004aa50171f116af746af`|

两批均published、previewOnly，各8001帧，实际MP4哈希与textMeasurements.outputSha256相同，droppedRecords=0，完整解码通过。纯图形模板没有文字层，`textMeasurements.records=[]`正确保留，不能由空记录断言图形/语义/审美通过。

## 完整图形成形与实际图像

实际编译独立组有halo、disc、check-short、check-long、cap-start、cap-joint、cap-end共7个图形叶层；先短笔、后长笔、末端圆帽形成。180ms后全部到最终状态，147.18–148.14完整稳定0.96秒，实际29帧，达到0.7秒事前预算。事件共36活跃帧。148.1667帧确实组半透明，148.20已退净。

根Agent与实施Agent分别查看146.70–148.50全部55连续输出帧，另看1280×720入口/短笔/长笔形成/完整/稳定/退出/退出后及390稳定图。左上空墙中的圆章清楚，与人物有明显间隔，不盖脸、头发、制服标识或植物；白勾圆帽与接缝完整。实际图像手工留余量外包络x112–349、y41–278px，与人工人物保护区水平至少99px、左植物保护区垂直38.8px。该外包络为逐帧观察，不冒称自动图形测量/遮挡检测。

源455词与时序、显式事件（原生默认captionIndex:null除外）严格相同，两独立工程scenes/settings严格等于编译；图库r5定义严格未变。模板投影到JSON往返有每份10处小数变化，最大2.78e-17，全部保存，非数字字段严格一致，未声称JSON字节相等。

## 声音、历史和阶段评分

相同原始输入、相同Application的无触发控制已验证完整音频图除生成身份外完全相同。两份导出完整44100Hz双声道PCM（无下混/重采样）的SHA-256均为 `7a5919912fb596d2eb5325137448b6a38c8b6cee462bb8f1b645c7421f5d8c75`。原母片PCM与重编码输出不相同，`sourcePcmIdentical=false`保留。技术相等不代表已试听，控制片不计第二份审美case。

应用历史context `completion-deborah-20261008` 保存三阶段：

- 未生产方案基线：`application-65bd1626c25800bbd08e509f72a28e20277c4d9c1a0b1d487c32fc0c5615fba0`。
- 源帧/语义/空间适配证据：`application-8a4650413053724a7b853fa04951197ee12a95f70dd3765e8ec57aa9f8b664d6`。
- 正式导出、图形、PCM与根图像评审：`application-c80f3d2921fd842e2a64198e35fda77c8e0845deb04edec0124ca586236d90d7`。

基线已经保存本次Application/Sample，后两阶段是补充证据，参数没有改变；没有制造返修或失败记录。三份记录均restorable、projectionCurrent；qualityVerified=false，sourceFilesVerified=false，未改写质量门槛。

根确认本案阶段90：构图24、动效22、素材18、适配16、编辑10。原三案88/87/86的Application、分数和全部证据精确保留，新增四案系列 `style-review-series-8b06d02dfc4728723803b9d2074446c919a88e60f613b7694a95dc6586053162`，得分88/87/86/90，最低86，current/evidenceCurrent=true。旧系列 `style-review-series-182e00230138c517a1c1ef9222984ad23c24c4a4fabc5a25f7a70f1802da7905` 精确保留。`meetsInternalThreshold=false`、`listened=false`、`aestheticQualityVerified=false`。

范围限制：未观看整片审美、未实时连续播放、未感知试听，未新增编辑器UI点击/拖拽测试；原ASR低置信度与模型估计时间警告未静默删改。Deborah人物和CDC/NIOSH布景已经用于别的模板，本案增加真实已提交动作内容，不算新背景或未见盲测。只证明一处人工选窗内的完成提示，不代表自动状态识别或任何申请已获批。

[完整对照页](/Users/zhengwei/Downloads/completion-deborah-r5-20261008/review.html) · [验证结果](/Users/zhengwei/Downloads/completion-deborah-r5-20261008/verification.json) · [形成/稳定依据](/Users/zhengwei/Downloads/completion-deborah-r5-20261008/formation-check.json) · [根图像评审范围](/Users/zhengwei/Downloads/completion-deborah-r5-20261008/visual-review-log.json) · [音频对照](/Users/zhengwei/Downloads/completion-deborah-r5-20261008/audio-control-verification.json) · [系列回读](/Users/zhengwei/Downloads/completion-deborah-r5-20261008/review-series-readback.json)。正例可编辑工程：`tpl-preview-cb54e6562035e971c72ec7db03b4d0f4-0-0`。
