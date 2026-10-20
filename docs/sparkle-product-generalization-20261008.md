# 星光 r8 · 真实产品背景应用

冻结 `style-pilot-20260923-sparkle-follow` r8。本轮只选择真实语义和调整 Application，不改主辅星几何、颜色、尺寸绑定或动效定义；旧中文黑底 88 分仍保留。

## 输入、语义与时机

完整产品原片 `input-ce4a2882274fefc252000f062bd936b8`，36.3 秒、1080×1920、原 ASR r1 共200词。选词147..149（末端不含）“软萌”，原声时间26.84–27.22秒，位于147..155“软萌毛绒大小刚好”语义内（结束28.22）。原ASR把毛绒写成茅容，本次不选这些词、不更改原词。

“软萌”是正面外观评价，适合轻星光，不复用note的情绪陪伴或echo的语音对话。该源及邻近画面此前作为候选观察过，不能称全局盲测。画面已烧录“软萌毛绒大小刚好”，新增花字是额外情绪强调，存在信息重复；不是补上缺失字幕。

以全解码 `select n808..811` 核对源与输出：n809=26.966667仍为人物镜头，n810=27.000000首次产品特写。事件27.00开始时alpha0，27.033首显，28.22结束，不挤进下一“随便放办公室包里都能带”语义。最初用小数 `-ss` 得出的26.9667切镜判断不准确，已更正Sample evidence并重出片，错误元数据批次保留。

## 单次应用与验证

Application为720×1280，scale0.75，center(0.60,0.105)，textWidths.headline0.7，minDisplaySeconds1.22。落在上方橙色墙面，避开动态手部、产品眼睛/毛绒细节与下方烧录字幕。

正式批次 `production-448c48901c63fec0cc6cc028bf7a3e60` 已标准生产发布。原生headline曲线稳定起点为事件+0.12，淡出起点end−0.07，因此准确稳定窗口27.12–28.15共1.03秒，满足2字≥0.8秒预算。原生测量31稳定帧、37活跃帧全覆盖，字体34.125px@390，单行、无溢出，geometry/timing均passed。技术指标不等于审美通过。

完整输出解码、源SHA与原词/ASR未变、输出与测量SHA匹配、droppedRecords0、可编辑工程scenes/settings回读一致。元数据修正前批次 `production-b272f8574a2407a147f4d0899b5300dc` 与正式版全片解码RGB/PCM分别完全一致，不声称输出PCM与原始编码源相同。

实际看过七阶段摘要及事件周围40帧（26.966667–28.266667）：文字和暖/白星清楚，未遮手、产品或原字幕，28.233后无残留。暖墙上装饰与可爱产品相符，重复强调是否增益仍需独立评审；不凭技术通过凑90。

证据目录 `/Users/zhengwei/Downloads/sparkle-product-generalization-20261008/`：`event-contact.png`、`contact-1.jpg`至`contact-4.jpg`、`cut-exact-contact.jpg`、`diagnostic.json`、`verification.json`、`cut-metadata-identity.json`。旧元数据版本在`before-cut-metadata-correction/`。

Root完成独立审查后已写入正式评审与应用历史，详情见下节。不声称全片逐帧观看、连续实时播放、原声试听或最终审美通过，主账本未修改。

## 独立评审与历史登记

Root独立看event-contact及contact1/4，给新产品例89（构图24/动效23/素材18/适配14/编辑10）。重复烧录文字产生竞争/冗余是实际适配缺口，未因技术门禁通过或新增真人背景而凑90。

原90/90/88三case逐字段保留，追加第4case89。新系列 `style-review-series-130af0334854be0fc4d173f52de6d7d972040d61b5f5f099843aefe85d34cba4`，回读current=true、evidenceCurrent=true，最低88。旧中文88与旧系列保留。正式历史 `application-a9a6c9b106adabeb0dd38c07c3a815b919359db0e9bcf902cf2bb05f4ee33117`，原生GET回读restorable=true。请求、回执及formal-consistency.json保留。listened=false、aestheticQualityVerified=false，无最终通过声明。
