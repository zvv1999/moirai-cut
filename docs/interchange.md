# FCPXML 与剪映 / CapCut 工程互通

Moirai Cut 可以把一个已保存场景导出为 **FCPXML 1.10**，同时生成一份结构化的
互通报告。它的目标是把可交换的时间线结构交给 Final Cut Pro 等支持 FCPXML 的
非线性编辑器，并为部分提供 XML 入口的中国版剪映桌面端保留一条**实验性、单向**
交接路径。

这项能力不是剪映或 CapCut 私有工程格式的生成器，也不是无损双向 round-trip：

- 输出是单文件 `.fcpxml`，不是剪映草稿，也不是 CapCut 工程；
- 当前只支持从 Moirai Cut 导出，不支持把修改后的 FCPXML 再导回 Moirai Cut；
- XML 有效不代表目标软件能表达 Moirai Cut 的全部效果；
- 是否能在剪映中导入取决于具体桌面端发行渠道、系统、版本和灰度入口，Moirai Cut
  不承诺所有剪映版本都支持；
- 国际版 CapCut 官方帮助中心目前明确说明，不支持直接导入或导出第三方剪辑软件的
  工程文件。参见 [CapCut 官方说明](https://www.capcut.com/help/how-to-export-pro-project)。

Apple 官方将 FCPXML 定义为 Final Cut Pro 与第三方应用交换项目、片段和元数据的格式，
并提供“文件 > 导入 > XML”入口。参见
[Apple 的 FCPXML 使用说明](https://support.apple.com/zh-cn/guide/final-cut-pro/verdbd66ae/mac)。
Moirai Cut 当前输出的是 FCPXML 1.10 单文件 `.fcpxml`；Apple 自己导出 1.10 或更高版本
时可能使用 `.fcpxmld` 捆绑包，两者不要仅靠修改扩展名互相伪装。
生成文档使用标准 `library > event > project` 结构，并可按
[Apple FCPXML 1.10 DTD](https://developer.apple.com/documentation/professional-video-applications/document-type-definition)
校验；DTD 通过只能证明结构合法，不能替代目标软件的实际导入测试。

## 推荐工作流

1. 在 Moirai Cut 中完成当前场景的剪辑并等待保存。
2. 生成 FCPXML；生成动作绑定当前磁盘 `revision`，不会修改工程内容或增加 revision。
3. 同时下载 XML 和 `.interchange-report.json` 报告。
4. 先检查报告中的 `omitted` 和 `degraded` 项，再到目标软件导入。
5. 在目标软件中检查切点、源裁剪、层级、音频和素材重连；不要只以“导入成功”作为
   交接验收。
6. 如果生成期间工程又发生修改，服务会返回 `revision_conflict`，且不会发布 XML 或
   报告；重新读取工程并导出。

目标软件没有 XML 导入入口时，不要把 `.fcpxml` 改名后复制进剪映草稿目录。可以改用：

- 一个明确支持 FCPXML 的中间 NLE；
- 高质量 MP4/MOV 成片加原始素材的人工重建工作流；
- SRT/TXT 等目标软件明确支持的单项交换格式。

## 运行环境边界

FCPXML 生成属于 **本地或单机自托管能力**。它需要服务端同时访问工程目录、媒体文件和
原生 `moirai-interchange` 进程：

- 本地源码模式可通过 Cargo 运行当前 Rust 源码；
- 官方 Dockerfile 会在镜像中编译并携带固定路径的原生运行器；
- 纯浏览器 IndexedDB 工程、Cloudflare Workers 和其他没有持久宿主文件系统或子进程的
  Serverless 运行环境不支持这项能力；
- 单机进程内会把工程写入、删除和导出发布按 project ID 串行化。多 Node 副本若共享同一
  工程目录，部署方还必须提供跨进程锁；当前实现不宣称跨副本事务安全。

这与项目中依赖 `OPENCUT_PROJECTS_DIR`、FFmpeg 或本地 Agent 运行器的其他能力边界一致。
界面在工程没有已知文件 revision 时会拒绝生成；服务端找不到原生运行器时会返回明确的
`interchange_runtime_missing`，不会退回到浏览器内的未保存状态。

## 在编辑器中使用

1. 打开工程右上角的“导出”。
2. 进入“工程互通”。
3. 在 “FCPXML 1.10” 卡片中点击“生成 FCPXML”。
4. 生成完成后检查 revision 和逐项报告。
5. 分别点击“下载 XML”和“下载报告”。

编辑器会在需要时先刷新本地工程保存，再读取新的文件 revision。若工程尚未使用本地
文件存储，界面会拒绝生成 revision-bound FCPXML，而不会退回到不可靠的浏览器内状态。

## 通过 HTTP API 使用

先读取工程并取得准确的文件 revision：

```bash
curl http://127.0.0.1:3000/api/projects/PROJECT_ID
```

然后提交导出请求：

```bash
curl \
  -X POST \
  -H 'content-type: application/json' \
  -d '{
    "baseRevision": 7,
    "sceneId": "scene-main",
    "name": "review-handoff",
    "target": "jianying-desktop"
  }' \
  http://127.0.0.1:3000/api/interchange/PROJECT_ID/fcpxml
```

字段说明：

| 字段           | 必填 | 说明                                                                                        |
| -------------- | ---- | ------------------------------------------------------------------------------------------- |
| `baseRevision` | 是   | 从工程文件读到的非负整数 revision；过期值返回 HTTP 409。                                    |
| `sceneId`      | 否   | 指定场景；省略时选择当前场景或主场景。                                                      |
| `name`         | 否   | 输出文件名前缀；服务端会清理路径字符并限制长度。                                            |
| `target`       | 否   | 当前 UI/API 的剪映交接入口固定按 `jianying-desktop` 生成报告；它不改变 XML 的开放格式属性。 |

成功响应的 `data` 包含：

```json
{
	"projectId": "PROJECT_ID",
	"revision": 7,
	"currentRevision": 7,
	"stable": true,
	"name": "review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.fcpxml",
	"path": "/projects/PROJECT_ID/exports/review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.fcpxml",
	"downloadUrl": "/api/exports/PROJECT_ID/review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.fcpxml",
	"reportName": "review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.interchange-report.json",
	"reportPath": "/projects/PROJECT_ID/exports/review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.interchange-report.json",
	"reportDownloadUrl": "/api/exports/PROJECT_ID/review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.interchange-report.json",
	"report": {}
}
```

`path` 和内容指纹是示意值，实际响应返回本机绝对路径和真实 SHA-256 前缀。显式传入
`sceneId` 时，文件名包含清理后的场景 ID 及其 8 位摘要；省略时不含该场景后缀。所有
文件名都包含 revision 和 12 位内容指纹。文件写入：

```text
<OPENCUT_PROJECTS_DIR>/<projectId>/exports/
```

若收到 `revision_conflict`，重新读取工程、检查中间发生的修改，再用新 revision 重试；
不要盲目把响应中的 revision 填回并跳过检查。

## 通过 MCP 使用

MCP 提供 `export_fcpxml` 工具。推荐顺序：

1. `list_projects`
2. `read_project`
3. 从结果读取准确的 `projectId`、`revision` 和可选 `sceneId`
4. `export_fcpxml`
5. 检查返回的 `report.issues` 和 `report.relink`

示例参数：

```json
{
	"projectId": "PROJECT_ID",
	"baseRevision": 7,
	"sceneId": "scene-main",
	"name": "review-handoff"
}
```

MCP 工具走与 Web UI 相同的 API 和 Rust 适配器，不维护第二套时间线转换逻辑。它会在
revision 过期时失败，不会尝试合并一个已改变的工程。

## 输出文件与 sidecar 报告

一次成功导出产生共享同一不可变 stem 的 XML 和报告：

```text
review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.fcpxml
review-handoff-scene-main-759c5d82-r7-a1b2c3d4e5f6.interchange-report.json
```

同一请求产生完全相同的字节时会复用原文件对；内容发生变化时会发布带新指纹的新文件对，
不会覆盖旧交付物。报告先落盘，XML 最后作为完成标记发布；同名路径已被其他内容占用时返回
`artifact_conflict`，不会拼出一对新旧混合文件。

报告 schema 是 `moirai-cut.interchange-report.v1`，主要字段如下：

```json
{
	"schema": "moirai-cut.interchange-report.v1",
	"source": {
		"projectId": "PROJECT_ID",
		"projectName": "Demo",
		"revision": 7,
		"sceneId": "scene-main",
		"sceneName": "Main"
	},
	"adapter": {
		"format": "fcpxml",
		"version": "1.10",
		"target": "jianying-desktop"
	},
	"issues": [],
	"relink": {
		"assets": [
			{
				"id": "media-id",
				"name": "shot.mov",
				"path": "/absolute/path/to/media-id.mov",
				"uri": "file:///absolute/path/to/media-id.mov",
				"exists": true
			}
		]
	}
}
```

`issues` 的严重程度不是成功/失败状态，而是交接后的核对优先级：

| 严重程度   | 含义                                                                 |
| ---------- | -------------------------------------------------------------------- |
| `info`     | 已生成等价或规范化表示，但有值得记录的变化，例如重新计算 `trimEnd`。 |
| `degraded` | XML 中仍有可用表示，但部分语义被压平、替换或省略，需要人工复核。     |
| `omitted`  | 对象没有进入 XML，或因不可见、静音、越界等原因被明确排除。           |

`trackId` 和 `elementId` 会在可定位时指向 Moirai Cut 原对象。`relink.assets` 是素材
重连清单；XML 中使用本地 `file://` URI，因此把 XML 传到另一台电脑时通常需要重新链接
素材。

## 当前兼容矩阵

### 保留或直接表示

- 工程画布尺寸、精确有理数帧率和时间线总时长；
- 29.97/59.94 工程的 drop-frame timecode 标记；
- 主轨视频和图片的开始时间、时长、`trimStart` 与素材引用；
- 主轨空隙；
- 视频/图片叠加轨，以 connected clip 和 lane 表示；
- 本地独立音频轨，以负 lane 的 connected clip 表示；
- 素材自带音频的基础角色信息；
- 时间线书签，以 marker 表示；
- XML 特殊字符转义和本地素材 `file://` URI；
- 生成来源的工程、场景和 revision。

“已表示”只说明 Moirai Cut 已在 FCPXML 中写出对应结构。不同 NLE 仍可能采用不同的
磁性时间线、轨道和音频解释，导入后必须播放核对。

### 会降级或省略并写入报告

- 片段级书签会变成时间线 marker；
- 变速、关键帧动画、运动跟踪和防抖数据不进入当前 XML；
- 特效、蒙版和非默认的静态变换、外观或音频参数不进入当前 XML；
- 文字、贴纸、图形和效果元素等非媒体元素会省略；
- 隐藏轨道、隐藏元素和静音音频轨会省略；
- 没有本地媒体 ID 的素材库音频会省略；
- 位于序列范围外的连接元素或书签会省略；
- 超出记录源时长的片段会标记为降级；
- `trimEnd` 由源范围重新计算，并记为信息项。

### 会阻止导出

下列情况不会生成一个看似成功但不可用的 XML：

- `baseRevision` 与磁盘工程 revision 不一致；
- 工程、场景、帧率、画布或时间数据无效；
- 选中场景没有正时长内容；
- 主轨媒体片段互相重叠，无法构成 FCPXML storyline；
- 被引用素材不在 `media/index.json` 中，或对应文件不存在；
- 媒体 ID、扩展名或本地路径不能被安全序列化；
- XML 或进程响应序列化失败；
- 场景中存在转场；为避免把重叠起点误导出成硬切，先移除转场再导出；
- 场景中存在复合片段；为避免只保留容器的首个素材，先拆分复合片段再导出。

这些是导出错误，不会作为 `issues` 降级后继续。应先修复工程或素材，再重新生成。

## 剪映桌面端和 CapCut 的边界

“剪映”和“CapCut”不应被当作拥有完全相同入口的一组固定版本：

- 中国版剪映桌面端、国际版 CapCut Desktop、Web 和移动端的发行节奏与功能开关不同；
- 同名菜单可能随操作系统、地区、账号、版本或灰度发布出现、移动或消失；
- 部分剪映桌面端版本可能提供专业工作流或 XML 入口，这仍是实验性兼容目标；
- 如果当前安装的工程导入文件选择器不接受 FCPXML，或短工程实导失败，就视为该版本
  不支持，不要推断隐藏草稿格式可以替代；
- CapCut 官方当前给出的跨编辑器建议仍是导出成片，或携带原素材后在 CapCut 中重建，
  而不是直接转移第三方工程。

因此，Moirai Cut 不维护一个“从某个版本开始永远支持”的静态版本号承诺。发布或生产
交接前，应在目标机器的具体版本上用短工程试导，并保存目标软件版本、系统和报告文件。

### 已验证的剪映 11.1.0 路径

2026-08-14 在 macOS 中国版剪映专业版 11.1.0 上完成了本机短工程实导：从首页本地草稿
区域的“更多 > 导入工程”选择 Moirai Cut 生成的 `.fcpxml`，成功创建 5 秒、30 fps 的
可编辑草稿。样例核对了两段主轨及 1 秒空隙、两层重叠画面的遮挡顺序、独立音频和四个
本地素材引用。剪映首次读取素材时会请求目录权限；只授权报告 `relink.assets` 所在的素材
目录即可。

这项结果只证明该台 Mac 上这一份 11.1.0 安装可用，不代表国际版 CapCut、移动端、Web
或其他剪映版本拥有相同入口。实测还表明剪映转换器要求标准的 `library` 包装；Apple DTD
允许的顶层 `event` 文档在该版本中不会完成导入，因此生成器固定输出
`library > event > project`。

实际尝试时：

1. 先用一个只有一段视频和一段音频的短工程确认目标版本的文件选择器接受 FCPXML。
2. 选择 Moirai Cut 生成的 `.fcpxml`，不要选择 sidecar 报告。
3. 导入后立即核对时长、切点、源裁剪、画面层级和源音频状态。
4. 依据 `.interchange-report.json` 逐项重建已降级或省略的能力。
5. 若菜单不存在、文件选择器不接受 FCPXML 或解析失败，就把该安装视为不支持并停止，
   不要向剪映草稿目录写入任何文件。

## 为什么不直接写剪映草稿 JSON

直接生成或修改剪映/CapCut 草稿看起来更接近“一键打开”，但目前不是可靠的公共交换
协议：

1. 草稿结构没有面向第三方的稳定、官方兼容规范，字段和目录布局会随版本变化。
2. 不同发行渠道和较新版本可能使用不同的元数据文件、内部迁移或不透明/加密内容。
3. 一个能被解析的 JSON 不等于完整工程；素材索引、资源 ID、版本迁移、模板、云同步
   状态和应用内部数据库可能还需要一致。
4. 向用户真实草稿目录写入未经目标版本验证的数据，可能让项目无法打开、触发迁移，
   或覆盖现有作品。
5. 私有格式转换通常会静默丢失能力；FCPXML 加 sidecar report 可以把损失显式列出。

未来若增加原生草稿适配器，它应先识别确切版本和加密状态，只写入独立副本，生成备份与
迁移报告，并对未知格式默认拒绝；不能把逆向得到的某一版 JSON 当成永久 schema。

## 故障排查

### “工程尚未保存到本地文件”

运行 `bun run setup:local`，确认 Web 和 MCP 使用相同的文件工程配置，并等待自动保存
完成。`NEXT_PUBLIC_OPENCUT_PROJECT_FILES=1` 开启文件工程；`OPENCUT_PROJECTS_DIR`
必须指向 Web、API 和 MCP 共用的目录。

### `revision_conflict`

工程在你读取后被用户、Agent、另一窗口或自动保存更新。重新读取 `project.json`，确认
变化，再用最新 revision 发起新导出。不要关闭冲突检查。

### `artifact_conflict`

目标 XML 或报告路径已经存在，但内容与本次导出不一致。服务会保留已有文件并返回 HTTP
409。不要手工覆盖其中一个文件；检查 exports 目录是否被外部程序占用或修改，换一个
`name` 后重新生成，或在确认旧交付物已另行保存后再处理冲突文件。

### `project_not_found`、下载 404 或结果出现在错误目录

确认启动 Web 和 MCP 的进程都读取了同一个 `OPENCUT_PROJECTS_DIR`。改变环境变量后重启
对应进程。导出结果应位于该目录下的 `<projectId>/exports/`。

### `interchange_process_failed`、找不到 Cargo 或启动超时

本地源码开发默认通过 `cargo run` 使用当前源码；不会自动拾取可能已经过期的
`target/debug` 或 `target/release` 文件。安装 Rust 工具链后在仓库根目录运行：

```bash
bun run build:interchange
```

也可以通过 `MOIRAI_INTERCHANGE_BIN=/absolute/path/to/moirai-interchange` 指定二进制。
Web 进程需要对它有执行权限。

### `missing_media` 或素材无法重连

检查：

- `<projectId>/media/index.json` 中是否有对应 asset ID；
- `<projectId>/media/<assetId>.<ext>` 是否存在；
- 报告 `relink.assets` 的绝对路径是否仍有效；
- 将文件交给另一台电脑时，是否同时复制了原素材并在目标 NLE 中重新链接。

不要只修改 XML 里的扩展名来绕过缺失素材；扩展名和实际媒体编码必须一致。

### 目标软件拒绝 XML

1. 确认目标应用当前版本的工程导入文件选择器接受 XML/FCPXML，而不是使用普通媒体导入。
2. 在 Final Cut Pro 中使用“文件 > 导入 > XML”。
3. 在已验证的剪映 11.1.0 中，从首页“更多 > 导入工程”进入；保持 `.fcpxml` 原扩展名，
   不要手工改成剪映草稿或 `.fcpxmld`。
4. 用一个只有单片段的短工程区分“入口不支持”和“具体时间线能力不支持”。
5. 查看 sidecar report；若 XML 本身有效但剪映仍拒绝，应把该版本视为不兼容。

### 导入成功但画面或声音不同

按报告优先检查 `degraded` 和 `omitted`，再核对：

- 主轨空隙与 connected clip 层级；
- 源裁剪点和非整数帧率；
- 静音、隐藏和素材自带音频；
- 变速、字幕、关键帧、特效、蒙版、变换与音量。

如果这些能力决定最终观感，先在 Moirai Cut 输出高质量参考视频，与可编辑 XML 一起交付，
让接收方有可比对的视觉和声音基准。
