# 真人完成语义检索与两份母片本地转写

2026-10-08。先只读20个现有video输入，18份有词转写，逐份阅读完整文本，包含Sudha262.396秒494词完整源和用户75.23秒全片。已有短片中的建议、潜在影响、未来愿望和产品夸赞不作为完成正例。

随后经任务授权，对本地已存、已有Publicdomain来源信息的Deborah和John完整母片执行原生本地ASR。没有下载新视频、没有上传音频到外部服务、没有修改原片或原始转写。新增记录如下：

|原片|原生input|时长/词数|来源完整性|
|---|---|---|---|
|Deborah · existing local public-domain CDC full source|`input-422934139a6c23fbce1947bb3099e017` r1|266.707秒 / 455词|`422934139a6c23fbce1947bb3099e017d16a8b7d4e1af3c678fdc84955407403`|
|John · existing local public-domain NASA full source|`input-8cb6f9c0172452badd06521277389cf3` r1|398.408秒 / 770词|`8cb6f9c0172452badd06521277389cf3534a0e2b11b349909d346a2f509d8711`|

两份转写均由原生faster-whisper执行并成功回读，原始words/rawWords/segments、engine/version/modelhash/warnings保留。未听校，不将ASR当成经感知校准的事实认证。

Deborah真实原句“I put in my application”，words269..274（end-exclusive）、145.45–146.93秒，是具体过去提交动作；后接“and the rest is history and I absolutely love it.”至149.83秒。Agent与根审查上下文及画面后，仅将它解释为**申请提交这个动作已经做过**，不声称录用、审批通过、毕业或整个职业目标已完成。completion r5的显式事件147.00–148.20秒在application词结束之后，避开约146.3秒景别变化。完整生产应用单独记录。

Deborah的“our goal was to graduate as an engineer”没有明说毕业已发生，未强判正例。Sudha“I never...thought I would be able to be a physician in public service”连同已担任该工作的上下文可供celebrate考虑职业成就，但未当成任务完成。John398.408秒全片主要为地球观测、灾害、水循环和未来准备；“50多年观测”是持续记录，“planning a flower garden”是计划，未取得严格完成正例。两母片完整阅读之后不再扩ASR，不能把检索不到的具体毕业/获学位/训练完成陈述编出来。

候选时窗源画面、完整JSON转写、来源/输入/任务回执与SHA见[检索目录](/Users/zhengwei/Downloads/completion-real-source-search-20261008)。新增本地转写是可复用的数据成果，既有访谈布景和人物不算新背景或未见盲测。该检索本身不授予任何模板审美分数。
