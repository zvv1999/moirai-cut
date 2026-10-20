# 阅读侧标 r4：文字底板、左依附与原画面叠加验证

2026-10-08。冻结 `style-study-20260928-signal` revision 4，3个精确Application、3份正常生产成片全部published。内部应用评分 **89 / 88 / 89**，系列最低 **88**；回读current=true、evidenceCurrent=true。**未达到90分，未连续播放/试听，最终审美false。** 本轮没有新增视觉方向，没有修改原样式、主账本、参考工程或服务实现。

入口：[成片与全部事件帧](/Users/zhengwei/Downloads/signal-generalization-20261008/review.html)。

## 保持通用模板，把内容适配放在本次应用

此样式为两叶层：浅白 `#F4FCFF` 左对齐原生text，其文字底板是 `#14313F`；青色 `#58E3D0` rectangle以 `referenceBounds=text_box`、`placement=left`、`followMotion=true` 依附。每次词触发有100ms轻上移/透明度入场和60ms退出。标题绑定keyword，不承担整段正文。

Agent只在输入快照里选完整短语、句内重点、自然布局范围，在Application里设置位置/行宽/整体大小/保持请求。没有把演员名、词下标、台词或时间写进模板。三个输入原始字节SHA与库记录相同，生产words与库内测得词完全一致，不延长声音或编造对齐时间。

| 样例 | 当前应用 | 输入及限制 |
| --- | --- | --- |
| Deborah | 1280×720；scale .98，center (.22,.20)，headline宽 .32，保持请求1.8s | CDC浅墙植物房，原7s视频；原完整画面左侧空位叠加，3词/2词/单个较长英文词 |
| John | 1280×720；scale .90，center (.88,.19)，headline宽 .22，保持1.6s | NASA紫色几何演播室，原14s视频；保护NASA标识、脸与手势，右上留白叠加；单词及两词 |
| 中文 | 720×720；scale1，center (.52,.5)，headline宽 .8，保持1.6s | 已入库“每天读一点”原TTS，10.475283s，transcript r4；3/4/5/6/10字重点，黑底 |

Application均使用全画布placement及intents=[emphasis]。真人样例没有缩成窗口或新增独立黑带。保护区由Agent亲看各7个原片时刻后提供，属于人工近似矩形，不能声称是自动主体识别。CDC和NASA为两种真实布景；中文仅证明文字布局，不能充当第三种真人背景。全部源此前已用于别的验证，本轮是冻结r4后的新生产回归，不是未见语料泛化认证。

## 底板padding与侧标是否真跟实际文字

生产textMeasurements中的textBox包含启用的文字底板；layout.widthPx/heightPx表示文字排版块。逐事件核对 `(textBox.width-layout.widthPx)/2`、`(textBox.height-layout.heightPx)/2` 与拟合字号后的background.padding参数一致。左对齐时textBox.left为负padding，实际字形原点仍在0。

| 应用 | 实际padding X/Y（源px） | 侧标宽×高（源px） | 侧标右缘→底板左缘间距（源px） |
| --- | --- | --- | --- |
| Deborah | 23.52 / 13.72 | 8.4672×84.672 | 11.2896 |
| John | 21.60 / 12.60 | 7.776×77.76 | 10.3680 |
| 中文 | 24 / 14 | 8.64×86.4 | 11.52 |

原生编译每个侧标都带textAttachment，精确引用同一事件的headline元素ID，锚点[0,.5]。实测textBox相对原生textLayoutBox产生的位移用于实际文字边界校正；侧标垂直居中、随入场上移，不跑到字间。**侧标高度是固定设计尺寸，不会自动撑满两行底板**；从单行到两行时底板高度随文字变化，青条保持长度，只改变相对中线位置。

每事件另提一张原尺寸稳定帧，在预测位置附近识别蓝板、青条颜色连通区域，再用行列支持度排除背景噪声。与实际布局推导的矩形比较，最大差 **2.4672源像素**，未超过4px抗锯齿/压缩容差。首次John检测把相邻深色背景线并入蓝板，改为最大连通区＋至少50%行列支持后定位正确；没有改变成片或放宽容差。这是已知位置/颜色的局部核对，不是通用目标检测或独立审美认证。

## 空间、时间与实际帧

| 样例 | 显示重点 | 实际事件 | 390px宽显示字号 / 行数 | 稳定段 / 本次预算 |
| --- | --- | --- | --- | --- |
| deborah | around the house | 1.46–2.96s | 23.29px / 2行 | 1.34s / 1.00s |
| deborah | my mom | 2.96–4.76s | 23.29px / 1行 | 1.64s / 0.75s |
| deborah | calculator | 5.10–6.90s | 23.29px / 1行 | 1.64s / 1.00s |
| john | home planet | 4.46–6.06s | 21.39px / 2行 | 1.44s / 0.90s |
| john | best places | 8.22–9.44s | 21.39px / 2行 | 1.06s / 0.90s |
| john | Earth | 9.44–11.04s | 21.39px / 1行 | 1.44s / 0.70s |
| chinese | 一次读完 | 0.74–2.34s | 42.25px / 1行 | 1.44s / 0.80s |
| chinese | 十分钟 | 3.42–5.02s | 42.25px / 1行 | 1.44s / 0.70s |
| chinese | 感兴趣的段落 | 5.08–6.68s | 42.25px / 1行 | 1.44s / 1.15s |
| chinese | 写下一句话 | 7.04–8.48s | 42.25px / 1行 | 1.28s / 1.00s |
| chinese | 记住真正打动你的地方 | 8.48–10.28s | 42.25px / 2行 | 1.64s / 1.50s |

英文实际字号为76.44px（Deborah）、70.2px（John），中文78px；全部无宽/高/行数溢出，没有为长句继续缩字。自然两行包括around / the house、home / planet、best / places、记住真正打动 / 你的地方。模板声明PingFang SC 700，但fontIdentityVerified=false，未独立确认实际fallback字体来源。

保持请求并不保证实际保持：Deborah首事件因下一词2.96s开始截成1.5s，稳定1.34s；John的best places被Earth9.44s截成1.22s，稳定1.06s；中文“写下一句话”在8.48s结束，稳定1.28s。逐词预算来自本次内容判断，不能把通过结果提升成统一字速标准。最后中文事件用原句完整动作8.48–10.28s，在媒体末编码帧10.4333s之前完成退场。

已查看所有11事件的连续帧局部联系表及每事件8张全幅阶段图，共592张连续帧、88个阶段条目；Deborah170、John151、中文271张。前后相邻事件的局部裁剪可能只显示下一较大文字的一部分，以全幅图确认没有裁切。没有将联系表当作连续实时播放或听感验收。

所有11事件的两层opacity关键帧、开始/结束一致，退出期及结束后均有真实编码帧；未见侧条单独滞留或前后文字重叠。蓝板与侧标联合运动范围包括10.8–12px入场位移，未越画布或人工保护区。三份readingCheck、音频技术检查、全文件解码通过；listened=false、audio.perceptualQualityVerified=false。

## 生产证据与恢复

所有fixture保留textMeasurementContractVersion=1；测量version1、producer=production-scene-exporter、status=sampled、droppedRecords=0。textMeasurement的source元素及时间与实际text匹配，outputSha256等于真实MP4 SHA。对应独立工程scenes与冻结fixture一致，text与graphic保持原生可编辑；本轮没有新增面板选中、拖动、撤销测试。

系列ID：`style-review-series-2c753da257bb10f2b86441e8ae9134155383dadc3bd4afbe10b770c64d72427a`。

原生definitionHash：`90cd0470b640bce67eb5b0f9086ebfabd379192ad2dca91d704e56bc9d39c92d`。

| 样例 | batch（均item0/fixture0） | MP4 SHA256 |
| --- | --- | --- |
| deborah | `production-9fa5afcba6d2af20a201a12f05629ba8` | `675bb175667c53f3bfd36e4947d0750484ebf8a20c9f0f0c7221c3b40577f593` |
| john | `production-743d7b5a92fb4e9af87f5d4a904ef6d2` | `9c03864137893d26c36384cf12a4777e81477236b282b462fa40c593619a05f9` |
| chinese | `production-e6536069e2ac8ff3a4437b2e474cc43b` | `acc054c4e462a1d52227026d868f8d3a6e157385351811d1a4dc3d1d49fa3fa5` |

三个context为signal-generalization-deborah-20261008、signal-generalization-john-20261008、signal-generalization-chinese-20261008。各有基线→当前适配两条历史，共6条，回读全部restorable=true，未执行恢复。基线为默认摆放，未渲染/评分；不能假装是失败成片。

完整证据目录：`/Users/zhengwei/Downloads/signal-generalization-20261008/`。verification.json包含3成片测量，*-verification保存逐事件矩形/像素边界/稳定时长及退场，history-verification保存6条历史；review-series-request/receipt/readback保存正式系列。review.html全部57个本地引用存在，未做浏览器页面验收。

## 尚未通过项与下一步

内部88分支持这些精确应用的回归通过，不支持全库任意位置90分。右上真人标签的边缘留白、基础矩形与背景的融合仍可比较更好方案；中文黑底缺少复杂真人画面证据。需要补更长英文从句、更复杂中文背景、不同画幅以及实时视听验收。改变坐标/宽度后应重新检查padding、依附、实际字号和保护区，不能继承本次分数。未测试开放无底板变体，也不将其增加为新方向。
