# 方向箭头 r3：真实目标应用

2026-10-08。冻结 `style-study-20260928-arrow` r3，完成3个正向输入、4份正向Application（含一次返修）和1个无目标负例。三个正向input ID来自**两个母片**：NASA Alex和用户75秒视频的两个裁片。方向复用通过新 `rotationDegrees`，未修改模板定义，未将方向变体计为新模板。

当前内部系列最低 **82/100**，未整体达到90。所有 `listened=false`、`aestheticQualityVerified=false`。证据目录 `/Users/zhengwei/Downloads/arrow-generalization-20261008/`，`review.html` 提供真实成片、参数、帧和历史入口。

| case | 真实目标与调度 | 应用 scale / center / 角度 | 稳定时间 | 内部分数 |
| --- | --- | --- | --- | --- |
| alex-sun | 左上太阳；原ASR `towards the sun` 词24–27，7.56–8.34s，本次保持至8.46s，早于下一句8.70s | .50 / (.13,.744) / −90° | .567s | 90 |
| domain | 用户原18–22s裁片，“全域推广”既有烧录词块；人工视觉事件.60–1.25s | .38 / (.22,.26) / −90° | .333s | 82，失败保留 |
| creator | 用户原44–48s裁片，“大达人”既有烧录词块；人工视觉事件.95–2.10s | .40 / (.905,.145) / 180° | .867s | 86，偏细初案 |
| creator-refined | 同creator内容/时段，仅加大并左移，保留原片/词/声 | .48 / (.897,.145) / 180° | .867s | 89，有所改善但未到90 |
| skip-moving | NASA John画面人物与手势移动，话语无对应静止指向对象，全keyword=null | 无实际箭头 | 不适用 | 不评分 |

稳定时间按既有180ms入场、100ms退出，再向内取30fps帧边界。图形识别0.5s是本次人工提出的预算，**不是通用阈值，也不是文字readingCheck的原生测量**。纯图形模板没有文字，所有成片测量是有效 `sampled/records=[]`；不凭空造文字测量以通过门禁。

## 目标来源与保护区

Alex先查7.55、7.75、8.10、8.34s原帧，再定位太阳、人物及手势。箭头置于太阳下方左侧面板，尖端留在太阳外缘下方，不盖核心；上方向与口播“towards the sun”一致。原图示、背景、人物完整保留。原片中的太阳影像有内部活动，但目标区域固定；没有跟踪任务。

两个中文目标复用已经导入并原生ASR的真实4秒裁片：`input-c8f365981baef0baa024b6018104a7ae`、`input-dfe786dad0092a784306eb41adbd4139`。事件来自画面观察，未将视觉字块假称为ASR选词。中文烧录标题有局部字形摆动，目标位置稳定；本轮只用保守区域和经过检查的时间窗，不声称文字像素完全静止或自动追踪。Domain指向“全”字下侧，Creator从右侧指向整块“大达人”；不复制既有文字。

所有case的 `protected-regions.json` 记录需要避开的目标正文、人物、麦克风及下方字幕。原生placement advice保持角度并检查旋转后authored AABB，全部选中预期位置。该检查不覆盖真实旋转字形/阴影/动画轨迹，仍看实际成片。实际图像显示指向关系成立，未观察到箭头覆盖脸部或目标核心。

## 失败与返修

Domain在原片中已经有两处同义文字，第三处小箭头带来的信息收益很低；稳定.333s又短，不能为达分延长至1.267s已经替换成“算法”的新画面。当前推荐跳过箭头，保留生产失败供Agent判断适用性。

Creator的.40初案方向正确但小屏笔画偏细。.48返修改善辨识，右侧留白约16px，尚属于很紧的边缘摆放；用89分保留限制。返修未修改保存模板，原词和事件一致，两成片解码PCM SHA相同。没有将同源返修计成新内容或新模板。

John负例正常生产零箭头，保留主体与手势。它只证明显式不标关键词时不触发，不证明自动识别对象，也不作为90分装饰成功案例。

## 原生生产与证据

| case | batchId |
| --- | --- |
| alex-sun | `production-d52c9f997b484168bc956510a12eb35c` |
| domain | `production-54b7d0b9973150a35af39a6fb4484ce0` |
| creator | `production-91e8f7e7b92baa30e758086d264d5575` |
| creator-refined | `production-c22142f24296c231d94dc1b0c6bf1d76` |
| skip-moving | `production-8a56475a2e46e51e20e0f8575c320b3e` |

全部正常production author→worker→published；MP4真实SHA=preview SHA=measurement outputSha，marker1、sampled、dropped0、全文件解码与原生音频技术检查通过，源SHA与原词数组逐字段核对。正例每份6个可编辑叶与1个外旋转容器，负例0叶；原片在旋转容器外。五份当前工程scenes/settings与各冻结生产文档相同。

四个上下文均保存基线→对象方向及生产证据的原生history，creator沿同head追加尺寸返修；`history-verification.json` 保存最终回读。历史不改变项目，不冒称已经操作Web恢复。

已查看每个正例的稳定全帧、前/入/稳/退/后代表帧、指定30fps联系页和John负例多时点。`visual-review-log.json`列出实际查看文件；全部提取帧不等于全部看过。未连续实时观片、未试听、未真机验证，内部评分不代表最终视听通过。Native系列 `style-review-series-6628a57d6c32f6e5e7af8abdc66b47547a2c10c3ab480159b278cb9d65d86913`，`current=true`、`evidenceCurrent=true`，回读在`review-series-readback.json`。
