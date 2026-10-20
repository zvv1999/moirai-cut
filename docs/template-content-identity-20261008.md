# 试映内容跨投影恢复

## 已修复的触发场景

在试映页为当前设计设置替换素材或显式禁用后，返回编辑样式，再打开新版本试映。应用投影 ID 包含样式版本与应用参数，因此新页面的 `effect-trial-*` ID 会变化。原先的内容快照只保存旧 ID 下的 `designResourceBindings`，没有标记它属于哪个来源投影。页面直接提交旧键到 `/samples/validate`，Rust 会正确拒绝 `resource override references unknown design`，整份自动恢复或 JSON 导入因此失败。

组件持续挂载时已有旧→新投影键迁移；本次补齐重新进入页面的路径。

## 实现边界

- `TrialContentSnapshot` 新增可选的 `sourceTemplateId` 浏览器导航元数据，自动暂存、手动暂存和 JSON 导出均记录当前投影 ID。它不属于 Rust `Sample`，不会混入生产请求。
- 内容恢复在原生校验之前，仅把明确的来源设计键迁移到当前投影 ID，复用已有 `moveTrialDesignBindings`。辅助函数支持原始绑定数组，保留重复项给 Rust 校验。
- 共用绑定、显式禁用、字幕与语义标注、声音/画面事件不改变。无关设计键继续传入原生校验，不能通过删除错误字段使恢复成功。
- 若来源键和目标键同时存在，拒绝自动合并。辅助函数不修改原快照；组件仍在所有校验成功后才提交恢复内容。
- 没有来源元数据的旧快照不猜测设计对应关系：原来兼容的继续可用，设计 ID 已失效的仍由原生校验拒绝。
- 应用历史恢复包含原生权威投影，仍使用原有准确恢复路径；不根据 UI 元数据改写历史记录。

Rust 的业务校验、素材解析和优先关系没有转移到 Web。

## 验证

2026-10-08：

- `trial-content-snapshot` 新增 5 项回归；与素材绑定、历史恢复、导航记忆测试合计 **21 项通过**。
- Web `bun run typecheck` 通过。
- 使用本机原有 `qa-binding-disabled-20261007` 和已有输入，只调用 `/dynamic-assets/application` 与 `/samples/validate`，未生产媒体或改库。
- 旧投影键向新投影校验：HTTP 400，`resource override references unknown design`。
- 来源键迁移后：HTTP 200，`validated: true`；共享绑定、显式 `enabled:false` 与原快照内容分别核对保留。
- 无关设计、重复设计素材槽两个负向用例仍为 HTTP 400。
- 回放脚本与完整原生结果位于 `/Users/zhengwei/Downloads/trial-content-identity-20261008/validate.ts` 和同目录 `native-readback.json`。

本轮未执行浏览器点击或连续播放，不将上述接口与代码验证计作视觉验收。
