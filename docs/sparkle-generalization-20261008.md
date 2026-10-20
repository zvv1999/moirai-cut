# 星光弹字 r8：辅星造型改善与当前精确应用

当前 `style-pilot-20260923-sparkle-follow` r8 采用C规则：白色辅星为字号0.80倍、4角depth30，紫色衬底同depth并额外增加字号0.09倍；主暖星仍为字号1.25倍/depth18。文字、主星、独立运动及源调度保持，中心通过通用相对关系补偿，无case坐标或台词。只加厚衬底的B方案收益不足且像暗十字，保留失败候选而不晋升。

正式r8按三个原Application（仅assetRevision更新）重新投影和生产。组合边界变化造成相对C微左移：390px下Liz约0.783px、mentor约0.794px、中文约1.547px；**RGB与C不相同**，PCM一致。根Agent与实施Agent均重新查看正式三张七阶段实际图，确认白核辨识改善、主暖星仍主导、未见新增压字/遮挡后才记录当前新评分；不继承候选评分。

| 当前r8应用 | 生产批次 | 新评分 |
| --- | --- | --- |
| Liz 热爱工作 | production-043a027ca190c5347cb55a0ae6a0269d | 90 |
| Mentor 积极影响 | production-ebff3180c116b8aa078e996aa40ebc59 | 90 |
| 中文轻巧 | production-7b138bfa4ab3250cd37846996e0948c9 | 88 |

系列 `style-review-series-e2378712c34182947a57c74e1d5c7cb6f34073a0b67d464a312e166f2bf1b875` 回读current/evidenceCurrent=true，最低88。两英文评分23/22/19/16/10，中文22/22/19/15/10；仅造型素材维度由18提升19，有实际白核面积/形体辨识依据，不预设所有限制已解除。英文同人物浅墙与中文黑底覆盖限制仍在，中文留白及主辅星较突出仍扣分。listened/aestheticQualityVerified=false，两个90分单案不等于系列或最终视听验收通过。

三份完整pose零丢，原字号/阅读预算geometry/timing通过，words/semanticUnits/captionSpans/events与PCM保持，保存工程scenes匹配；三个当前历史均assetsCurrent/inputsCurrent/projectionCurrent/restorable=true。`scripts/templates/seeds/sparkle-follow.json` 与r8除revision归零外精确一致，原生inspect往返通过；指南已同步0.80/depth30，清理旧0.63/depth22当前规则。

当前证据：`/Users/zhengwei/Downloads/sparkle-contrast-r7-20261008/formal-r8/`，review.html、三份 `*-r8.mp4`/`*-r8-contact.png`、批次/测量/诊断、decoded-identity、series/history/final-consistency。正式文件与图中标签已改r8，避免同加衬底B候选混淆；父目录B与candidate-c目录及旧r7全部保留。下方是原历史过程，不代表当前规则或评分。

## r7 历史：通用原生星光与精确应用验证


以下为历史r7定义 `style-pilot-20260923-sparkle-follow` r7：暖白文字与四个独立 native star 叶层（暖黄主星、白色辅星及各自深紫衬底）。4角几何的主星 depth18、辅星 depth22；主/辅大小按字号 1.25 / 0.63 倍定义，衬底增加0.09倍。按实际文字框依附，主次独立旋转/透明度/回弹，保持源事件时间。通用定义无人物、输入ID或绝对词时间；应用比例、位置、行宽与语义选择独立保存。旧图片版本保留在r6历史，不增加模板方向数。

| 正式 r7 应用 | 390px下真实字号 | 完整pose记录/丢失 | 实际成片 | 新评估 |
| --- | --- | --- | --- | --- |
| Liz 热爱工作 | 18.4275px双行 | 5 / 0 | production-27f3d129d8582ab450aced21f6137d1b | 89 |
| Mentor 积极影响 | 18.6834px单行 | 4 / 0 | production-82b1f3922a1865dbf99112f75e6c2889 | 89 |
| 中文前部轻巧 | 36.4px单行 | 5 / 0 | production-ae9c1bbc315604fbe2b794d262076ccf | 87 |

三份精确Application均重新生产，原生18px字号、完整活跃/稳定帧覆盖、阅读预算检查通过。保存工程 scenes 与编译文档一致，原 words、semanticUnits、captionSpans 和 plan.events 逐项相同；PCM保持。正式Application基于新视觉族整体边界居中，因此与先在r6应用上换图的草稿整体水平位置不同，**RGB不一致**；差异、失败比对和正式新帧完整保留，不能继承草稿审片。根Agent与实施Agent分别重看正式r7三份七阶段实际解码图后，才登记此次新评估。

当时系列 `style-review-series-9f3929c7689979ba73d6516cb97bf5a3990180e08e68a7a44f31d7444b8dd769`：最低87，current/evidenceCurrent均true；89/89/87重新评估，不继承r6分数。三条新应用历史回读 assetsCurrent/inputsCurrent/projectionCurrent/restorable 均true。未连续观片或试听，listened/aestheticQualityVerified始终false，**没有达到90分验收**。浅墙小白辅星仍偏细；英文两处仍同一个人/布景，中文仍是黑底TTS，不能称为新增复杂背景覆盖。

Mentor 原应用scale .68导致17.40375px字号不足，失败保留；仅在本次Application增为.73。文字阅读区间按自身.12秒入场/.07秒退出取1.41秒，不误把独立星光.2秒入场作为正文运动。修复候选ffprobe实际PTS核对48活跃帧、43稳定帧（12.1–13.5s），与恒定姿态记录一致，required1.3s未降低。正式r7同样完整覆盖；诊断不是自动阅读理解或审美认证。

证据：`/Users/zhengwei/Downloads/sparkle-drafts-20261008/r7/`（review.html、三MP4/七阶段图、manifest、当前Definition、诊断、source-invariants、pixel-comparison、application-centering-difference、series和history回读）；草稿/修复失败保留在相邻star目录，椭圆初稿也保留。便携种子 `scripts/templates/seeds/sparkle-follow.json` 与r7除revision归零外逐项一致，native inspect roundtrip通过；usageGuide与定义同步。模型/UI/MCP和outline真实导出证据见 `docs/star-geometry-contract-20261008.md`。

## r6 历史证据（保留，不代表当前版本）


冻结 `style-pilot-20260923-sparkle-follow` r6。它是淡紫文字与透明星光图片两个叶层，图片按实测文字框右边缘依附；位图可替换，不称可拆矢量或自动生成。所有位置、大小、行宽、保持与语义选择都只在 Application/样例内调整。

| 默认应用 | 测量与语义 | 实际成片 | 评分 |
| --- | --- | --- | --- |
| Liz 热爱工作 | absolutely / love my job，60.48px双行，1.61秒稳定窗 | production-5a4069369b2267e03e1815ec6cb732d2 | 88 |
| Mentor 积极影响 | huge impact，57.12px单行，1.41秒稳定窗 | production-863cc6404dbcd17d3405878a75393502 | 87 |
| 中文前部重点 | 轻巧，67.2px单行，1.11秒稳定窗 | production-03fefb4aa8d248c80666de3a6568c182 | 85 |

两个英文输入是同一Liz同一访谈布景的不同片段；不能称为跨人物/独立新背景。中文为本地TTS黑底，不提供真实产品画面的保护验证。默认系列最低85，仍有小尺寸星光偏细、背景覆盖不足、黑底留白大与未连续视听等阻断。

## 失败与返修

中文首次在尾句“多了一点乐趣”触发，1.6秒请求受到输入尾部截断，最后实帧仍在淡出，没有完整退出后帧。原始批次、字幕/星光实例、截图和应用保存在 `chinese-tail-rejected/`；替换版同类失败也保留。最终按规则跳过尾部可选装饰，改在前面“轻巧”触发，保持1.3秒，原声音和ASR时间不改。这次修正有实际post帧，无残留。

金色星素材替换使用库内Lucide原图 `visual-12a7c035ca89c69d1303040b30207b9c3c5e799dd8d477131bf79a88868979ae`，正式批次 `production-d4a1294eab80531ceace229229391066`。实际文字排版、依附关系与音轨保持，但金色笔画在黑底比默认双色描边更暗，未选为默认方案。替换检查不作为第四种输入或第二款风格。应用历史不允许同一记录重复inputId，因此默认与替换采用独立context/批次；首次400错误记录保留。

## 已验证的证据范围

四份当前成片全部marker1、真实MP4 SHA与测量/预览SHA相等、完整解码、原词不变、可编辑工程回读通过。文字测量source/track/groupPath/local时钟逐条对照编译文档；星光`textAttachment.parent`指向该次真实文字实例，时间与文字一致。默认/替换PNG从各自工程实际媒体文件核对asset SHA及许可，透明通道有0/255且角点透明，没有靠截图伪造资源。中文默认/替换导出PCM相等，不等同已试听。

按当前全部正例的实际字号、行数、稳定窗提交原生readingCheck，并提供从真实帧人工界定的人头/手保护区；四应用返回clear/passed。这是调用方证据与静态区域校验，仍不证明自动检测或动态全程不遮挡。

人工查看默认15张与替换5张390px导出阶段帧：一/二行文字右边缘星光跟随正确，未压字、未遮人物脸手；前部中文退出后无残留。英文图标手机尺寸偏细，替换金星较暗。没有连续播放或原声试听，不置最终审美通过。

证据、可播放页面及脚本：`/Users/zhengwei/Downloads/sparkle-generalization-20261008/`。原生baseline→证据/返修application history、当前系列回执与失败版均保留。`verify.py`为技术核对，`reading.py`为显式人工预算，`review.py`不是自动美学评分器。

## r7后的辅星对比候选（未晋升）

新增 `/Users/zhengwei/Downloads/sparkle-contrast-r7-20261008/` A/B：保持现有三个精确Application、白核0.63×字号、原词/事件/PCM与所有其他图层，仅把辅星深紫衬底额外尺寸0.09提高为0.16×字号，并以半宽补偿保持中心。三个候选批次为 Liz `production-ff8ee49b3ce77081e3ae6da277bf30c3`、mentor `production-ba033834edbd920d8548bc336c0722fd`、中文 `production-23a4f1bc7bb185b559b1646efeed75dc`，全部published，原阅读预算及完整姿态geometry/timing通过。

查看390px实际七阶段帧后，浅墙辅星外缘略增强，但改善较小；最近邻放大的局部显示B深色尖端更明显，并未增大白核。黑底中文原本可辨，额外衬底没有明显帮助。尚不能据此证明质感显著改善或解决小屏辨识缺陷，因此实施Agent建议暂不晋升，保留候选供根Agent独立复核。未保存新版本或评分，正式r7与seed/guide不变，listened/aestheticQualityVerified=false。

后续只增加一个造型C候选：辅星白核0.63→0.80×字号、白核与衬底depth22→30，衬底extra回0.09，中心/主星/字体/动作与现有Application保持。证据在上述目录 `candidate-c/`。三案实际批次为 Liz `production-acc99adcfc92ce6eb66d85be3decfa88`、mentor `production-fa84d923ba15be6a3c7638a623c3736d`、中文 `production-6a34797e7c4a8d1965bc2b9fea216502`，原词/事件/PCM与阅读预算保持，技术检查通过。实施Agent查看三案七阶段后认为白色形体更易辨，改善强于只加衬底，但中文辅星也更突出；尚待根Agent独立定夺，未升级正式r7或评分，不预设达到90。
