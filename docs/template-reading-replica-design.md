# 阅读主体与视觉副本契约

2026-10-08。已实现 Rust 模型、编辑操作、生产证据诊断及 MCP 接口。Web 同时开放模板 Composition 与动态素材图层的关系编辑、生产结果诊断。部署后的真实 Echo 回归另记；本文件不授予视觉评分或验收。

## 为什么单独建模

`role=decoration` 只能说明用途，不能证明图层没有独有信息；`binding=keyword` 也不能证明两个实际实例来自同一个词。组、空间依附和相同文字都不足以转移阅读职责。显式关系仅表达某文字是另一主层的同内容视觉副本，不改变内容生成、排版、动画或时间调度。

```json
{
  "readingReplicas": [
    {"elementId": "outline-layer", "primaryId": "main-text"},
    {"elementId": "color-echo-layer", "primaryId": "main-text"}
  ]
}
```

字段位于 `Composition`，以及动态素材 `Definition`。默认省略。原有模板保持每个文字独立承担阅读要求，旧 `placementAdvice` 的覆盖与预算语义完全不变，不静默迁移 Echo r5 或改分。

原生静态校验要求：

- 两端存在且为文字，每个副本只有一个主体，无自指、环或副本链。
- 副本显式 `role=decoration`，主体不能是 decoration。
- binding 相同；literal 绑定的最终字面配置相同。
- 静态关系本身不授予阅读豁免。

动态素材编辑操作是 `reading_replica {layerId, primaryId:string|null}`。主体为空只移除关系，不改角色；修改角色、内容或绑定导致关系无效时由原生拒绝。复制子树重映射内部关系，复制单个副本保留其原主体引用；删除任一端清理关系。捕获、投影、插入命名空间及历史版本保存均保留该关系。普通模板的独立元素复制沿用现有“独立元素不隐含继承关系”规则，不自动产生豁免。

## 冻结生产证据诊断

`POST /templates/production/{batchId}/items/{itemIndex}/reading-diagnostic`

Web 前缀为 `/api/footage`。原生 `template_schema.productionReadingDiagnostic` 是权威请求 schema；MCP 工具为 `diagnose_template_production_reading`。接口只读，不写分数、历史、模板或生产状态。

```json
{
  "fixtureId": 0,
  "outputSha256": "生产预览记录的完整SHA256",
  "viewportWidthPx": 390,
  "minFontSizePx": 18,
  "maxLines": 2,
  "budgets": [
    {
      "elementId": "实际成片文字实例ID",
      "stableStartSeconds": 2.4,
      "stableSeconds": 1.4,
      "requiredStableSeconds": 1.2
    }
  ]
}
```

`fixtureId` 是 fixture 的整数 index。预算以实际 `source.elementId` 为键，不是模板图层名。`stableStartSeconds` 是成片场景绝对秒数；区间是 `[start, start+stableSeconds)`。稳定区间及所需预算均为调用方观察，不是机器视觉证明；不能用总可见时长冒充稳定期。省略稳定起点时保持 partial。

先用空 `budgets` 请求取得 `primaryInstances`，再填写观察值。目录提供 `elementId/templateElementId/templateInstanceId/content/source/startSeconds/endSeconds/availableSeconds/timingStatus/budget`；这些可见范围不自动填作稳定时间。

诊断只接受已发布 item，读取它自己的冻结 template、fixture、编译文档、编排计划和保存的实际文字测量。检查 fixture index、预览 SHA、measurement SHA，以及测量来源、组路径、时钟和帧号。诊断前后重新计算文件 SHA。旧文件缺少测量契约时返回错误，不编造测量，不从当前最新版模板补关系。

## 配对与检查边界

1. 从编译实例 ID、模板元素 ID 与冻结 `scheduleDecisions` 找到唯一 selected 事件，核对实际事件及非空 sourceId。未知事件不豁免。
2. 副本只配对同一实际事件、严格相同 compiled content 且可见时间重叠的唯一主体。不同事件即使文字相同也不能合并。
3. 两端均需真实测量，测量行文必须与 compiled content 相容。只允许排版换行/空白折叠差异；主体与副本的 compiled content 仍逐字节相等。附带 secondary 文本的实例暂不授予豁免。
4. 主体稳定区间不得超过祖先组和导出范围裁切后的区间；要求该区间内每个导出帧有测量，且证据明确声明 `geometryCoverage: "constant_record_pose_v1"`、`droppedRecords=0`。缺预算、缺测量、仅保留首姿态的旧记录、容量丢失、时长不足或字号/排版失败均不授予副本豁免。
5. 字号按实际测量与完整祖先线性变换的最小奇异值计算，再换算到请求的显示宽度。主体使用稳定期样本，避免把入场缩放误当稳定期；副本仍检查所有记录的最小字号、行数和溢出，不豁免字号。
6. 副本**仅免除独立停留预算**。保留所有布局和变换后画布边界检查。边界报告是采样文字框检查，不包括笔画、滤镜阴影、受保护主体或画面内烘焙字幕。越界返回 warning，不能据此断言视觉失败或通过。
7. 遮挡、视觉竞争和保护区检查仍是 unverified。不能仅凭关系宣称可读、美观、听检或连续观看已完成。

`geometryCheck` 与 `timingCheck` 各自返回 `passed/failed/partial/not_requested`；副本停留可通过但字号或溢出仍可失败。没有总质量通过状态。

`geometryCheck.records` 含 `measuredMinFontSizePx/maxLineCount/overflowing/recordCount/sampledBoundaryStatus/stableIntervalMeasured/stableIntervalFramesCovered/observedStableFrames/expectedStableFrames/activeIntervalMeasured/observedActiveFrames/expectedActiveFrames/partialReasons/fontCheck`。`fontCheck` 为 `caller_stable_interval` 或 `replica_sampled_frames`。

`geometryEvidence` 返回证据声明 `coverage`、`completeRecordPoses`、`droppedRecords` 以及 `partialReasons`。全局原因是 `legacy_first_pose_only` 或 `dropped_records`；逐实例另可有 `missing_stable_interval`、`incomplete_stable_frames`、`incomplete_active_frames`。理由由原生诊断决定，UI 只映射显示。

新冻结 fixture 写入 `textMeasurementGeometryCoverage: "constant_record_pose_v1"`，提交缺失 marker 的旧记录会被原生拒绝。旧 fixture 未声明几何契约时仍可加载历史记录，但不把首帧变换当成整段变换：字号稳定期无法认证、无停留豁免、未发现越界时 `sampledBoundaryStatus=unverified`。已记录的明确排版溢出仍是 failed，首姿态的明确越界仍是 warning。新证据只合并完整姿态不变的连续帧；任何 `droppedRecords>0` 都使几何与停留证据不足，不因总观察帧数正确而通过。

副本仅委托停留，完整几何检查仍要求其全部活跃导出帧被记录。主字完整而副本缺帧时可保持停留豁免，但副本几何与边界只能 partial。marker 是生产者声明，不是认证；`producerAuthenticated/independentlyVerified` 均 false，不证明字体文件、像素或审美。

`replicaIdentityCheck.records` 提供实例与主体、对应事件、配对状态及 `independentTimingExempt/primaryTimingPassed`。无法配对是 unverified，整体 partial；没有适用副本实例为 not_requested。

`visualCheck.status/occlusionCheck/competitionCheck` 始终 unverified，`aestheticQualityVerified/listened` 始终 false。`timingEvidence=caller_supplied` 明确事实边界。无可见文字时顶层 status 为 not_requested；否则只是 diagnosed，不表示验收通过。

## 验证

原生反例测试包括：主字字号不足、缺预算/起点/测量、内容不同、未知与不同事件、同文不重叠、多个可配主体、文件或 fixture/SHA 不匹配、稳定期超出裁切范围、稳定帧覆盖缺失、副本小字号/溢出/越界。另有关系校验、复制/删除/解除关系、namespace 插入、捕获及历史版本保存测试。MCP 回归确认请求身份与调用方观察原样传递、原生错误不吞、不会添加视觉通过标记。

新增证据回归包括：旧首姿态记录降级、新 fixture 拒绝降级/未知 marker、主体稳定期叶节点缩小、祖先组缩小和旋转、副本活跃帧不完整、容量丢失但总帧数看似完整。入场小字在稳定期之前仍允许；历史测量与评分不回写。

实际成片回归、人工视觉检查和是否达到 90 分须独立记录；结构测试不替代这些验收。
