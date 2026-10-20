# 最短显示时长规则闭环（2026-10-07）

## 目标

让“最短显示”成为独立的可组合调度策略。它约束短关键词或字幕的可读停留时间，不改变声音、事件或视频总时长；用户可以在模板默认、单图层和本次应用（主样式/叠加样式）分别设置，未设置时保留继承关系。

## 工作台入口

- `min-display-rule.tsx` 提供统一控件：可选覆盖、0.1–3 秒输入、恢复继承，以及对视频结尾、后续事件和显示时长上限的说明。
- 效果工作台“应用规则”下提供样式默认和当前图层独立值。
- 试映“看效果与布局”下提供主样式和每个叠加样式的独立值。叠加样式的值和位置、画布、文字输入、资源绑定分别建模。
- URL、sessionStorage、复制试映链接、应用历史快照均区分缺失和显式数值；取消覆盖会删除字段，不会写入默认值。

## 原生关系

Web 只编辑和携带字段，调度由 Rust 负责。解析优先级为：

`Element.minDisplaySeconds` > `Application/Insert.minDisplaySeconds` > `Definition.minDisplaySeconds` > `visualRhythm.minDisplaySeconds`。

插入时只把来源策略投影到来源叶子图层，不修改宿主模板的全局 `visualRhythm`。捕获历史时保留叶子层策略。值由 Rust 校验为 0.1–3 秒；实际事件调度仍受下一事件、结束规则、视频结尾和 `maxSeconds` 约束。

## 真实验证

证据目录：`/Users/zhengwei/Downloads/min-display-ui-20261007/`，包含 `verify.mjs`、`verification.json`、`projected-template.json`、`native-plan.json`、`definition-rules-ui.png` 和 `extra-rule-ui.png`。

- Definition 默认 `.7` 与当前图层 `.4` 可分别保存；清除后两个字段都被省略，原生默认没有被 materialize。
- 主样式应用 `.1` 与严格原始画布叠加样式 `.9` 独立投影；来源图层显式 `.4` 优先；宿主 `visualRhythm` 仍为 `.1`。
- 应用历史备份、恢复和恢复后再次保存精确保留显式 `.1/.9`、缺失值、严格 `placement:null`、原生 `projectionHash` 与 parent 链。
- URL、sessionStorage 与刷新恢复两个应用覆盖；只清除主样式时恢复 Definition 继承，叠加覆盖继续存在。
- 输入 `4` 秒被 Rust 原生拒绝，普通控件改回合法值后预览恢复；页面无错误。
- 隔离 QA 样式 `qa-min-display-20261007`、`qa-min-display-20261007-v2`、`qa-min-display-20261007-v3` 均已归档；正式源样式没有改动。

## 支持边界

已验证字段的编辑、投影、历史与导航保真。没有在本轮把最短显示规则实现为 UI 侧的第二套时间调度器，也没有声称连续观片、试听或视觉质量自动评分；事件的真实时机仍以 Rust 计划为准。
