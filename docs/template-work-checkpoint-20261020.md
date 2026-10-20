# 模板工作检查点 · 2026-10-20

本次将工作区积累的模板系统代码、素材、开发脚本和文档整理到独立分支
`codex/template-workbench-20261020`。起点为本地 `main` 的 `0037bfe8`
（`release: Moirai Cut v0.5.0`）；没有合入远端后续提交。
这是源码检查点，当前静态检查尚未全部通过。

## 提交组织

| 分组 | 主要路径 | 内容 |
| --- | --- | --- |
| Rust 核心 | `rust/crates/footage/`、`Cargo.lock` | 原生模板模型、编译、内容与音频分析、资源绑定、生产与评审 |
| 工作台与执行接入 | `apps/web/`、`apps/mcp/`、`rust/crates/gpu/`、`scripts/build-wasm.mjs`、`package.json` | 可视化编辑、试映、属性面板、渲染、MCP 和本地 WASM 构建 |
| 素材与开发工具 | `assets/template-artwork/`、`scripts/templates/`、`.agents/skills/moirai-cut-template-production/`、`.gitignore`、`.gitattributes` | 插画分层、样式种子、历史生产/测量脚本与缓存排除 |
| 文档 | `docs/` | 模型审计、实现说明、历史验证、格式调研与本检查点 |

## 当前能力与责任边界

### 原生模型与编排

- 语义角色、表现形式和媒体用途分别建模；动效、滤镜等效果通过目标关系组合。
- 转场表达前后对象关系；分组、依附、相对定位、文字尺寸关联与几何规则分别表达。
- 语义段落、字幕显示单元、时间对齐词与排版短语各有身份，统一事件提供调度输入。
- 资源槽、需求、资产和实际绑定分离；候选评价与执行能力校验由 Rust 提供。
- 声音、TTS、转写、韵律及参考画面分析有原生服务入口；模型/工具适配器随源码保存。

`dynamic_asset::Definition` 表示可复用样式；`Application` / `Sample` 保存一次应用的
输入、适配和标注。历史命名 `Template` 表示更宽的可编译编排文档，可以包含场景专属信息，
不能把“能够保存”当作“已经可复用”。详情见
[数据结构审计](template-data-model-audit-20261009.md)与[模板本体](template-ontology.md)。

### 工作台、编辑器与 AI

- `/templates` 提供样式/素材工作台，相关路由承载组合、生产和试用。
- 工作台支持图层、文字、重点词、形状、关系、资源、样式与动效的编辑和试映。
- 编辑器属性面板接入新文字与几何字段；复制元素保留对应关系并重新映射身份。
- 渲染与导出包含文字测量、依附定位、组合透明度、视频帧选择及原生音频处理接入。
- MCP 提供模板素材、创作、编排、参考分析与测量传输入口，复用 Rust 语义校验。
- 应用历史区分设计与本次内容；保护区、阅读和运动证据绑定明确的输入和应用身份。

相关入口：[工作台说明](template-workbench.md)、[生产说明](template-production.md)、
[参考分析](reference-analysis.md)、[应用历史](template-application-history.md)。

### 素材与脚本

插画分层与来源/许可保存在 `assets/template-artwork/learning-room-v1/` 和 `v2/`。
两者属于同一设计族，不能按独立模板重复计数。

种子使用已保存设计优先的初始化流程；仅在缺失时创建。历史样片和测量脚本保留原路径，
通过新增的[脚本索引](../scripts/templates/README.md)区分用途与写入影响。
本机项目、素材库数据库、视频和验收产物不因提交源码而自动纳入仓库。

## 本次验证

以下为本次实际执行结果；此前文档中的浏览器、成片与听感结果仍是对应日期的历史证据。

| 检查 | 结果 |
| --- | --- |
| `bun test` | 1121 通过，0 失败；231 个文件，4152 次断言 |
| `bun run test:mcp` | 108 通过，0 失败 |
| `bun run typecheck:web` | 通过，包含路由类型生成与完整 TypeScript 检查 |
| `cargo test --locked -p moirai-footage --all-targets` | 402 通过，0 失败，7 忽略；这些集成验证需显式配置 FFmpeg、素材或 NAS 夹具 |
| `cargo fmt --all --check` | 通过；本次统一了新增 Rust 文件格式 |
| `bun run lint:web` | 未通过：49 errors、16 warnings |
| `cargo clippy --locked -p moirai-footage --all-targets -- -D warnings` | 未通过：lib 报 34 项，lib test 报 48 项，两者存在重叠 |
| `bun run build:web` | 通过，包含本地 Rust WASM 编译和 Next.js 生产构建 |
| `bun run release:check` | 通过，2399 个导出文件通过仓库敏感路径与高置信度密钥模式检查 |
| `git diff --cached --check` | 通过；导入插画 SVG 按 `.gitattributes` 保留源字节，单独核对哈希 |
| 插画完整性 | 暂存区 26 个源图、部件 SVG/PNG 的已有哈希与 `parts.json` 相符 |

本次命令日志与机器回执保存在本机临时目录
`/tmp/moirai-template-branch-20261020/`，不属于持久交付文件。
未重新执行真实素材的浏览器交互、AI 模型连通性、Linux Docker 或完整成片视听验收。

## 后续工作

### 静态检查

Web lint 主要集中于新增模板界面与测试：

- 测试夹具的显式 `any` 类型。
- `workbench.tsx`、`dynamic-assets.tsx`、`production-speech.tsx`、`placement-advisor.tsx`
  与 `sample-content.tsx` 中的 React ref 使用方式。
- 媒体字幕、焦点和非交互元素事件等可访问性问题。
- Effect 依赖与图片组件提示；一处多余的 lint 屏蔽。

Rust Clippy 涉及可合并分支、冗余类型转换、临时 `Vec` / clone、布尔表达式，以及
较大枚举、参数数量和方法命名等问题。修复时需要保留序列化与执行行为，不能仅关闭规则。

### 发布与产品验收

- 清理上述静态检查问题后再进行完整 CI。现有测试通过不等价于分支已经可合并发布。
- `scripts/build-wasm.mjs` 要求安装与 `Cargo.lock` 匹配的 `wasm-bindgen-cli`；
  干净环境与 CI 的 wasm-pack 安装流程仍需对照验证。
- 核对干净环境下的素材初始化、服务启动、工作台试映与完整导出流程。
- 重新采集当前设计版本的视听验收。历史的
  [样式验收快照](template-style-acceptance-current.md)记录于 2026-10-08，
  当时 20/20 有评审、0/20 完成最终视听验收；本次没有刷新这些数量或分数。
- 将高频历史脚本逐步参数化；不直接批量执行包含本机夹具或写库行为的实验脚本。

### 文件协议

[`.mot` 草案](mot-format-v1-proposal.md)和[标准调研](mot-format-standards-research-20261015.md)
已保存；`.mot` 读写、素材依赖打包与工作台导入导出入口尚未实现。
Lottie、Rive、OTIO 等是调研与适配候选，没有在这次提交中新增对应运行时。
当前可用的数据入口仍是原生模型与 JSON。
