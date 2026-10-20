# 行动清单 r5：通用圆角轮廓与逐勾确认

`style-study-20260929-checklist-headline` 已从 r4 通过 CAS 保存为 r5。改动来自当前中文三词长与导师原 Application 的同输入 AB：原图标的硬方框、大顶栏和极细双横线在小尺寸下偏向办公 UI；唯一候选将它改为直立圆角板、短金色夹扣、单主线与三个勾的分层确认。没有改文案、源词时间或个案摆放，没有增加第二候选。旧 r4 最低87、旧最低82和r3最低79系列及失败证据保留。

## 保存的通用规则

- 奶油纸、靛蓝厚轮廓、短金色夹扣、三行薄荷勾选符号，直立放在测得的文字框上方。
- 字体、文字区域、颜色及原正文入场保持；正文120ms稳定，三个勾依次在60/120/180ms完整显示，root整体60ms退出。
- 正文阅读从120ms后计，完整图标识别从最后勾180ms成形后另计，二者均扣除退出。图标另声明至少0.6s稳定识别预算；短事件不足不压缩关键帧，应调整本次Sample事件、Application展示保持或跳过。
- 三行只是清单图标，不表示模型识别出了三个真实任务。输入仍必须有明确可执行内容，一般论述负例不强行添加清单。

图形圆角没有借用文字背景字段。当前原生模板未暴露 rectangle 的 cornerRadius，本次用矩形与椭圆复合，46个叶子全部可编辑（原21个）。板身、轮廓、纸面、夹扣和第N勾均有中文语义描述及稳定ID；未为描述新增分组或transform。所有不透明拼块在root统一合成后淡出，阶段帧未发现接缝。叶子较多是明确的编辑复杂度限制，不把“可以逐个选中”视作已达到最佳编辑体验。

## 保存版正式验证

四个当前 Application 仅 `assetRevision:4→5`。所有模板均由原生 `/dynamic-assets/application` 投影，再以正常 `production/author` 导出，共7预览（6个有强调，1个无强调负例）。没有手改投影或编译输出。

| 应用 | 正式批次 | 成片 | 结果 |
| --- | --- | --- | --- |
| 中文短/中/长 | `production-a2544e1f05c89432ee0c80b5339d45b4` | 3 | geometry/timing passed；整片decoded RGB、PCM与已审候选相同 |
| 导师真人正负例 | `production-15f3456aa171b8863bb8bd363873894a` | 2 | 正例passed；负例0强调/0文字记录；两片RGB与PCM等同候选 |
| Sudha真人 | `production-2e504ca4ef7909ec8319831765fcf5f0` | 1 | 两事件原显示边界保持，独立阶段帧检查与双预算passed |
| 竖屏计划 | `production-0f41b3f859cd6466eb334e5dcd7f48bc` | 1 | 三事件passed；末事件12.96s结束，12.9667/13.0s退出后帧存在且无残留 |

正文稳定时长/原预算：中文 `.72/.6、.74/.6、2.06/1.0` 秒，导师 `1.92/1.4`，Sudha `2.02/1.7、1.27/1.2`，计划 `1.44/.7、1.18/.7、1.18/.6`。均未放宽。

按实际解码PTS，完整图标首帧到最后全不透明帧跨度：中文 `.633333/.666666/2.0` 秒，导师 `1.833333`，Sudha `1.933333/1.2`，计划 `1.366667/1.1/1.1`，分别满足另声明的0.6秒识别预算。原生六根勾笔关键帧核对为60/120/180ms，没有把正文120ms替代图标成形时间。

七片完整解码、文件SHA、实际PTS、`constant_record_pose_v1`零记录丢弃、几何阅读、源图/原声编译参数及44100Hz双声道PCM均核对。全部PCM与各自r4输出相同；这不等于原始压缩音轨字节相同或已经感知试听。保存版中文和导师与候选逐RGB相同；Sudha和计划全部入场、稳定、退出、退出后及真正末帧独立查看。计划黑底留白偏多，真人语义和背景覆盖未扩大，正文字幕轨未补加，限制继续保留。

## 初始化与交付边界

`scripts/templates/seeds/checklist-headline.json` 已同步保存r5（仅revision归零），Rust inspect往返一致。既有初始化器focused测试4/4通过；真实初始化只执行1次GET，返回当前r5，未重写资产。实际seed和保存定义逐字段相同，没有全库同步。

正式四案由根代理复核后单独评分：中文89、导师89、Sudha89、计划88，最低88，未达到90。前三项分项为构图22/动效23/素材19/适配16/编辑性9，计划构图21，其余相同。相对r4动作+1、素材+1，编辑性因46叶联动成本-1；构图/适配原限制未消除。连续播放、感知试听、最终审美验收均未完成，`meetsInternalThreshold/listened/aestheticQualityVerified=false`。用户参考工程没有修改。

正式系列 `style-review-series-c3bfb1ee7517f30c12d0177033f7fdd2a568717eea18e34ec5cd05633d37154a` 已保存并回读，`current/evidenceCurrent=true`，覆盖四个精确r5 Application和全部7预览。旧r4/r3评审记录及分数仍保留，因revision升级不再标当前；不把候选AB或新导出当作新增背景。

四条原有context沿各自head追加了真实r5 Application与完整Sample，只有样式revision改变：

| 应用 | r5历史记录 |
| --- | --- |
| square | `application-b2b6fd3c838b7db09d75d203147fa45bc262e37a157ce0e342296128d07bf96c` |
| mentor | `application-77a4dccf4ec4d4d23145a6ef707a012b8c1ba43af2bb30661b114c9249100555` |
| sudha | `application-143066fcb08b02ab5631695f68bc6631d41e48e04fb47281d193d2320c61590d` |
| planning | `application-22fb968c4a91b74e48a6ea69576ba6a7f8fed3e9a373eea8a6efc5cddc1301c5` |

中文square的旧context最近head实际为r3，r4已有正式成片但未追加该context，因此这条原生changes准确记录3→5；其余三条为4→5。本轮视觉对比仍是当前r4 Application到r5，未伪造缺失的r4历史节点。原生回读补齐空数组/null等默认字段，完整有效标注没有变化。

四条只读回执均为`assetsCurrent/inputsCurrent/projectionCurrent/restorable=true`且`issues=[]`。没有执行restore，原生状态仍`qualityVerified/sourceFilesVerified=false`；独立媒体核验不冒充该接口的原生sourceFiles标记。

证据：`/Users/zhengwei/Downloads/checklist-design-r5-candidate-20261008` 保存唯一候选与AB；`/Users/zhengwei/Downloads/checklist-r5-formal-20261008/review.html` 包含保存版七片和阶段帧，`verification.json` 为实际检查明细，`initializer-tests.txt` / `initializer-get-only.json` / `seed-sync.json` 为初始化证据。前序见 [r4视觉事件记录](checklist-visual-events-20261008.md)。
