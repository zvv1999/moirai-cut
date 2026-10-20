# 本地独立背景盘点 · 2026-10-08

**结论：找到5个背景不同的条件候选，严格可直接用于新输入验收的数量为0。** 没有同时满足“未用于调参、干净原片、授权可确认、已有逐词时序”的3–5份真人源。不能把下面候选写成已通过的盲测输入。

只读核查本地素材库（1份source、47个模板输入）、非试映工程媒体、546份生产输入、54份已下载开拍参考。查看54张实际视频概览帧及28张候选阶段帧；封面与实际人物不同，判断以视频帧为准。现有NAS配置路径不存在。没有下载、上传、ASR生成、工程编辑或评分。

| 条件候选 | 规格 | 背景及适用性 | 时序 / 使用边界 |
| --- | --- | --- | --- |
| [车内女性：经济独立/创业讨论](/Users/zhengwei/Downloads/kaipai-materials-2026-09-16/videos/08-吸睛绿.mp4) | 810×1080 / 16.167s / 30fps | 车内/绿窗/白椅；经济独立、创业话题，不能等同增长事实 | 无逐词时序；烧录字幕；再使用授权未确认 |
| [户外住宅庭院男性：购房经验](/Users/zhengwei/Downloads/kaipai-materials-2026-09-16/videos/25-撕纸红.mp4) | 810×1080 / 19.867s / 30fps | 户外庭院/树篱/楼房；经验讲解及清单，含原画中画 | 无逐词时序；烧录字幕；再使用授权未确认 |
| [花砖桌前女性：水杯讲解](/Users/zhengwei/Downloads/kaipai-materials-2026-09-16/videos/38-黑黄框框（支持繁中）.mp4) | 810×1080 / 20.712s / 30fps | 花砖/白桌/手持水杯；产品解释、保护被指物 | 无逐词时序；烧录字幕；再使用授权未确认 |
| [门店女性：美发店介绍](/Users/zhengwei/Downloads/kaipai-materials-2026-09-16/videos/46-元气红.mp4) | 1080×1440 / 10.960s / 30fps | 店门/红金装饰/玻璃；商业介绍，近景与半身切换 | 无逐词时序；烧录字幕；再使用授权未确认 |
| [素材库商业原片：沙发互动](/Users/zhengwei/.moirai-cut/footage/sources/47e7803d-a1b6-4ef1-9b9f-50c5c4471d18/original) | 1080×1920 / 36.300s / 30fps | 沙发/绿毯；17.6–18.5s见人物，19.4s已切产品 | 无逐词时序；烧录字幕；再使用授权未确认 |

四份开拍候选都没有在当前生产输入中发现SHA/绝对路径/文件名命中，但原先已作为样式参考被查看，**不能保证全局未参与调参**。8与21是同一车内原片变体，38与51是同一花砖水杯原片变体，只按一个母片/布景计。素材库商业片有既存 `glm-5.3-flash` 镜头分析，无ASR；旧镜头文字与实时时段存在不一致，不能拿描述生成词时序。

前四份的来源是已存 `kaipai-materials-2026-09-16/catalog.json` 与其中的预览URL，license均为 `unverified`。商业片有本地素材库血缘，未发现许可声明。用户原片的直接叠加授权可确认，但它已经参与过本轮系列调参，因此没有充作新候选。

现有纯音频TTS、同CDC/NASA布景的不同人物/切片/画幅、7份产品手部近景和已有模板导出均未算新真人背景。此轮没有找到可确认的真人“增长已经发生”或“任务已经完成”正例；经济话题、价格促销和建议清单不能强行挂庆祝/完成标签。

**使用顺序建议：** 有新授权干净口播时先建立实测词时序并冻结为留出输入；当前五份只能按需做“保留原片字幕的叠加共存”压力测试。不得凭这些资料补评分或增加最终通过款数。

完整SHA、绝对源路径、来源、语义范围、未验证事项与抽帧时间见 [inventory.json](/Users/zhengwei/Downloads/independent-source-inventory-20261008/inventory.json)。代表帧：
- [车内女性：经济独立/创业讨论](/Users/zhengwei/Downloads/independent-source-inventory-20261008/candidate-08-contact.jpg)
- [户外住宅庭院男性：购房经验](/Users/zhengwei/Downloads/independent-source-inventory-20261008/candidate-25-contact.jpg)
- [花砖桌前女性：水杯讲解](/Users/zhengwei/Downloads/independent-source-inventory-20261008/candidate-38-contact.jpg)
- [门店女性：美发店介绍](/Users/zhengwei/Downloads/independent-source-inventory-20261008/candidate-46-contact.jpg)
- [素材库商业原片：沙发互动](/Users/zhengwei/Downloads/independent-source-inventory-20261008/commercial-sofa-contact.jpg)

## 后续输入准备（2026-10-08）

现有居家产品源已完成本地真实ASR，得到200个时间词。原片和烧录字幕保持，未远程上传；它可以继续做冻结样式的独立背景共存测试，但不自动满足干净原片或全局未见留出条件。详情见[本地输入准备](independent-sofa-input-20261008.md)。本页上文是只读盘点时点记录。
