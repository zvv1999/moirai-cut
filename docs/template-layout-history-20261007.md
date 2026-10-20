# 试映布局与应用历史闭环（2026-10-07）

本次补齐工作台对原生合法布局的编辑与恢复。Web 只保存表单、URL 和导航状态；画布约束、区域适配、独立变换、插入组合、避让候选及历史校验仍由 Rust 执行。没有修改正式样式或参考工程，也没有重启服务。

## 已完成

- 输出画布支持自定宽度、高度和 FPS，合法性由原生接口判断。
- 主样式与叠加样式都能同时保留局部适配区域和独立 `transform`。旧实现会在独立变换开启时把区域替换成全画面，现已修正。
- 叠加样式新增“原始画布 · 不适配”，对应原生 `placement:null`。保留原始坐标，要求画布宽、高、FPS 一致，绝不自动转成完整画布适配。切换此模式明确取消独立变换和行宽设置，相关控件禁用；文字依附仍独立保留。
- 捕获应用、原生预览、试映链接、会话记忆、历史恢复与恢复后再次保存采用同一布局值。恢复时依据原生 application/extras，忽略不可靠的 UI 布局提示。
- 原生避让接口接收真实画布与局部区域；保护区的范围标识包含完整画布、区域、输入、构图和叠加组合。
- 新增独立 `ApplicationTextInputs` 组件，读取当前样式版本 `Definition.inputs`，主样式与每个叠加实例可分别设置文字或恢复默认；投影、避让、URL、会话、历史和复用组合完整携带输入。文字长度及空值约束由 Rust 校验。
- 恢复原生可选字段时规范化 `null`，防止把 `captionWidth=null`、`intents=null` 写进 URL 导致重载失败。

实现入口：`apps/web/src/templates/effect-trial.tsx`、`trial-layout.ts`、`trial-session.ts`、`trial-history-capability.ts`，路由 `apps/web/src/app/templates/effects/[id]/try/page.tsx`。

## 验证证据

证据目录：`/Users/zhengwei/Downloads/layout-roundtrip-ui-20261007/`。

- `verification.json`、`verify.mjs`：真实 Chrome UI 与真实原生 API，无历史/投影接口 mock。
- 自定义场景：1000×800 / 48 FPS，主样式和叠加样式均为局部区域 + 独立变换。UI 修改字段、保存、调整其他字段、恢复、再次保存后，原生 `projectionHash` 精确一致，同一路径生成的完整原生模板结构也精确一致。恢复前未保存状态另存为备份，再次保存指向该备份。
- 严格场景：960×540 / 24 FPS，叠加 `placement:null`。改成 30 FPS 后得到原生 `canvas must match template` 错误；恢复 24 FPS 可继续操作。与 full 区域互换后恢复、再次保存，仍为 `null`，原生投影哈希及同路径完整结构一致。
- URL 重载和会话记忆保留自定义画布、FPS、主/叠加区域、独立变换及严格模式。
- `inspect.mjs`：原生避让请求保留实际局部区域，改变自定义 FPS 后旧保护区失效。
- 已查看 `custom-primary-layout-ui.png`、`custom-extra-layout-ui.png`、`strict-layout-ui.png`，画布能渲染，控件没有遮挡。QA 图形只用于字段与投影验证，未作连续观片、试听或美学评分。
- `bun run typecheck:web` 通过；布局、会话、恢复能力、素材绑定加文字输入形状检查共 18 个回归测试、89 个断言通过。

跨两个接口分步投影会增加一次 JSON 浮点传输；与 history 内部投影比较时最大差异为 `5.551115123125783e-17`。这一比较使用 1e-12 数值容差，并单独记录；恢复前后原生 `projectionHash` 和同路径投影使用精确比较，没有用容差掩盖应用参数变化。

隔离样式 `qa-layout-roundtrip-20261007` 已归档；复用了本地 QA 配音输入 `input-1dfb2b69f1ba1e8bde8426a43d641540`。未导出新成片，本轮不需要额外渲染证明布局序列化。

## 应用文字变量验证

证据目录：`/Users/zhengwei/Downloads/application-inputs-ui-20261007/`，含 `verification.json`、可重跑 `verify.mjs` 和已查看的 `extra-text-input-ui.png`。

- 读取真实 Definition.inputs 默认值；主样式与叠加各填独立文字，真实原生 sample-preview 编译轨道包含对应文案。
- 保存→修改未保存文案→恢复时，备份保留两组未保存文字；恢复后的再次保存保留全部 inputs，并且原生 projectionHash 精确一致。
- URL、会话与刷新保留两组文案；清空输入得到原生约束错误，改回合法文案即可继续。
- 主样式恢复默认后 inputs 为 `{}`，叠加文字仍然保留。
- 仅创建隔离样式 `qa-application-text-inputs-20261007`，并已归档；正式来源样式定义前后一致。为验证真实文字传递，QA 把该文字层绑定设为 literal，未修改库中原花字。

已移除 inputs 的历史恢复门槛。该项是“本次应用参数”，不替代声音关键词/字幕标注，也不会修改样式默认版本。

## 后续内容闭环

原先列出的译文、共享与按设计素材绑定、声音/画面事件以及无转写输入已在本轮后续阶段补齐。字段编辑、原生校验、预览/生产、JSON/Session、应用历史恢复均已验证；具体边界和证据见 `docs/template-content-history-20261007.md`。不再保留这些字段的 UI 恢复 gate。
