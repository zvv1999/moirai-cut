# 团队素材库接入说明（v0.7.0）

本文可直接发给团队成员或负责安装的 AI。实际 NAS 地址、账号和令牌由管理员
通过内部渠道提供；公开仓库和 Release 不包含这些凭据。

## 1. 连接关系

新增独立成员入口：如果管理员提供的是端口 `2222` 的连接配置，使用
`bun run join:team --connection 配置文件路径 --identity 自己的私钥路径` 登录，
再执行 `bun run team:llm` 和 `bun run team:start`。服务令牌通过认证连接自动取得，
不需要个人 DSM 管理员账号或 NAS 密码。此入口使用管理员分配的英文成员名，
与 DSM 中文账号分开；部署及撤销方式见 [独立接入网关](../deploy/footage/gateway/README.md)。
下文的手动令牌配置方式继续兼容原有部署。

```text
本机浏览器 /footage
  -> 本机 Web 工作台 :3000
  -> 本机 Rust 网关与 Worker :14319
  -> 本机 SSH 中继 :14318
  -> NAS 127.0.0.1:4318 协调器
  -> NAS 本地数据库 + 素材目录

本机 Rust Worker -> 本机配置的 LLM 端点
```

NAS 统一保存原片、发布视频、标签、审核状态、版本、血缘关系和任务。
本机生成模型使用的 720p 代理，执行粗剪分析、打标、商品识别和渲染。
竖屏模型输入为 720×1280，横屏为 1280×720；页面预览可以使用更小尺寸。
编辑器读取审核发布后的版本，并保留素材来源关联。

不要将客户端 SQLite 放在 SMB/NFS 目录，也不要给客户端配置数据库连接字符串。
Web 和 Rust Worker 都在成员自己的电脑运行，不需要在 NAS 上安装 Web 编辑器。

## 2. 管理员先提供什么

| 内容 | 用途与分发要求 |
| --- | --- |
| NAS 内网地址、SSH 账号 | 成员需处于能访问 NAS 的局域网或已授权 VPN |
| 经管理员验证的 `known_hosts` 文件 | 固定 NAS 主机公钥，防止连接到错误设备 |
| `nas-service-token` 文件 | 团队 API 令牌，通过安全渠道传递，不粘贴到聊天或 Git |
| SSH 公钥登记结果 | 每人生成不同的密钥，管理员只接收 `.pub` 公钥 |
| LLM Base URL 与模型 ID | 可以统一设置，但密钥只放在各成员电脑 |

当前每个有效团队令牌拥有完整素材库权限，尚无只读、审核员等角色。
令牌和 SSH 私钥不得放入公共下载链接。不要向成员发 NAS 管理员密码。

## 3. 安装本机依赖和代码

需要 Git、Node.js 20.9+、Bun 1.3.14+、Rust 1.93.1、OpenSSH、FFmpeg 和 ffprobe。
先检查已有安装，避免覆盖其他项目的环境。Windows 安装 Rust 时还需要
Visual Studio C++ Build Tools；在 PowerShell 中执行对应命令。

```sh
git clone --branch v0.7.0 https://github.com/zvv1999/moirai-cut.git
cd moirai-cut
node --version
bun --version
cargo --version
ssh -V
ffmpeg -version
ffprobe -version
bun install --frozen-lockfile
```

已有工作目录不要强制切换或覆盖未提交修改。可另行克隆一个目录。
这是源码版，不是双击安装包。AI 调色模式另外需要本机的自适应 LUT 运行环境，
参见 `scripts/footage/setup-lut.mjs`；尚未安装时先选“原色”。

## 4. 生成每人独立的 SSH 身份

macOS/Linux 示例：

```sh
mkdir -p "$HOME/.moirai-cut/team"
chmod 700 "$HOME/.moirai-cut/team"
ssh-keygen -t ed25519 -f "$HOME/.moirai-cut/team/id_ed25519" -C "moirai-team-member"
```

保留 `id_ed25519` 私钥，只向管理员发送 `id_ed25519.pub`。
如设置了密钥口令，启动前先用 `ssh-add` 加载到 ssh-agent；中继使用 BatchMode，
不会在每次请求时弹出口令提示。不要覆盖已经存在的同名密钥。

Windows 可先创建 `$HOME\.moirai-cut\team`，再执行相同的 `ssh-keygen -f` 命令；
确保 Windows OpenSSH 的 ssh-agent 可用，私钥 ACL 仅允许本人访问。

管理员把每人的公钥追加到 NAS SSH 账号的 `authorized_keys`。当前 DSM
部署使用固定中继脚本，每把公钥须限定到这个命令：

```text
command="python -u /absolute/deployment/relay.py",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 MEMBER_PUBLIC_KEY
```

`relay.py` 必须由管理员维护，不能让团队成员修改。脚本只允许连接 NAS
`127.0.0.1:4318`。不要清空原有 authorized_keys，不需要开启全局 TCP 转发。
具体 NAS 路径和已验证主机公钥见管理员的内部配置说明。

## 5. 配置并启动中继

将管理员提供的 `known_hosts`、`nas-service-token` 放入刚创建的私有目录。
macOS/Linux 对令牌和私钥设置 `chmod 600`。

从 `deploy/footage/connection.example.json` 创建自己的 `connection.json`：

```json
{
  "host": "管理员提供的 NAS 地址",
  "user": "管理员提供的 SSH 账号",
  "identityFile": "/本机绝对路径/.moirai-cut/team/id_ed25519",
  "knownHostsFile": "/本机绝对路径/.moirai-cut/team/known_hosts",
  "port": 14318
}
```

JSON 中不展开 `$HOME` 或 `~`，必须写真实的本机绝对路径。Windows 可用
`C:/Users/你的用户名/.moirai-cut/team/...`，不要复制别人的 Mac 路径。

保持第一个终端运行：

```sh
node deploy/footage/connect.mjs "$HOME/.moirai-cut/team/connection.json"
```

预期输出 `NAS footage connection: 127.0.0.1:14318`。这只表示本地监听已启动，
还需完成后面的素材库检查，才能确认 NAS 身份验证正常。

## 6. 配置本机 Worker 和 LLM

在第二个终端、仓库根目录执行：

```sh
bun run setup:team
```

逐项填写：

| 提示 | 值 |
| --- | --- |
| 团队 API 地址 | `http://127.0.0.1:14318`，对应本机 SSH 中继 |
| 服务令牌文件 | 本机 `nas-service-token` 的绝对路径，不能填令牌内容 |
| 本地缓存目录 | 本机磁盘目录，例如 `/Users/成员/.moirai-cut/team-cache` |
| Worker 端口 | 默认 `14319`；冲突时另选空闲端口 |

脚本会创建 `~/.moirai-cut/footage-team.json` 并生成本机唯一的 `workerId`。
完整字段见 `deploy/footage/edge.example.json`。FFmpeg 不在 PATH 时，修改该配置
中的 `ffmpeg` 和 `ffprobe` 为可执行文件绝对路径。

接着设置环境变量并配置本机模型：

```sh
export MOIRAI_FOOTAGE_CONFIG="$HOME/.moirai-cut/footage-team.json"
bun run setup:footage
```

已有团队连接时无需配置挂载 NAS 目录，对 NAS 配置提示按回车保留即可。
选择配置 LLM，填写管理员提供的 Base URL（通常含 `/v1`）；API Key 只在
隐藏终端提示中输入。工作台“分析设置”中选择准确模型 ID 和“视频”输入模式。
已有端点会保留，可复用现有 Agent 端点。跳过 LLM 时可以导入和手工审核，
自动分析会失败并显示可重试错误，不代表视频已经成功识别。

Windows 的环境变量写法：

```powershell
$env:MOIRAI_FOOTAGE_CONFIG = "$HOME/.moirai-cut/footage-team.json"
bun run setup:footage
```

## 7. 启动工作台

保持中继终端运行。在已设置 `MOIRAI_FOOTAGE_CONFIG` 的第二个终端执行：

```sh
bun run setup:local
```

此命令检查依赖、构建并启动本地 Rust Worker 和 Web 工作台。首次 Rust/WASM
构建可能需要数分钟。按照启动输出打开本机地址，通常为
`http://127.0.0.1:3000/footage`。端口占用时检查输出地址，不要终止其他项目。
Web 与 Worker 必须使用同一份团队配置。以后也可用
`MOIRAI_FOOTAGE_CONFIG=... bun run dev:footage` 单独启动 Worker。

`serverTokenFile` 指向 NAS 令牌；Worker 会在自己的 `dataDir` 中另外生成
`service-token` 给 Web 使用。两个文件不可互相替换。

## 8. 验收和日常协作

1. 打开 `/footage`，顶部应显示“团队素材库 · 本机处理”。
2. 打开 `/api/footage/state`，不同成员的 `libraryId` 应相同，
   `runtime.computeLocation` 应为 `local`，`worker.workerId` 应各不相同。
3. `/api/footage/edge/status` 应为 `idle` 或正在处理；长期
   `disconnected_or_failed` 时查看本机缓存目录下的 `service.log`。
4. `/api/footage/models` 应能读取模型列表。这不等于视频识别已通过，
   真实端点测试须经素材所有者允许。不要上传客户原片只为探测接口。
5. 用获准样片导入、审核发布。第二位成员应看到相同标签和发布版本，
   可供编辑器读取，来源与工程关联中应保留原片与分镜血缘。

上传的原片先在本机缓存，再传 NAS 注册任务；当前必须上传到协调器成功后
才算团队导入成功，尚不是断网时也可排队的离线同步。上传者优先处理自己的
任务，其他在线 Worker 可接手。编辑冲突不会静默覆盖他人的更新。

## 9. 排错与维护

| 现象 | 检查 |
| --- | --- |
| Connection refused / timeout | NAS/VPN 网络、SSH 中继进程、本机端口及 NAS 容器状态 |
| Permission denied (publickey) | 成员公钥是否登记、私钥路径、文件权限、ssh-agent |
| Host key verification failed | 向管理员重新核验指纹；不要关闭 StrictHostKeyChecking |
| 401 | NAS 令牌是否过期或拿成了 Worker 本地令牌 |
| 看见空库或不同的 libraryId | Web 是否误用了个人单机配置或连接了另一套服务 |
| 任务一直排队 | 是否有在线 Worker，查看本机日志及模型配置 |
| 模型报错 | Base URL、密钥、模型 ID、视频兼容性和本机到端点的网络 |
| 发布后读不到视频 | 先检查 NAS 发布任务完成状态，再检查服务和中继日志 |

NAS 数据库备份应在容器停止后进行，或使用可靠 SQLite 备份工具；不要直接
复制运行中的 SQLite/WAL。升级前备份 `state` 和 `library`，保留旧镜像。
撤销成员时删除其 SSH 公钥；团队令牌泄露时还需要轮换令牌并更新所有客户端。

此版本按需预览、媒体探测和参考图片规范化仍部分在 NAS 执行。尚无成员权限
分级、团队离线写入合并和缓存自动清理。原先的单机配置可以独立使用，
但单机库和团队库不会自动合并。编辑器工程仍是成员本机工程，不是多人实时共编。

## 给安装 AI 的提示词

请先阅读 AGENTS.md、本说明和 deploy/footage/README.md，再检查已有配置。
把本机接入管理员指定的 NAS 协调器，使用本地 Rust Worker，不要通过 SMB
打开数据库。保留单机库与已有凭据，私钥和 API Key 不进入聊天、Git 或公共
Release。每台机器单独生成 Worker ID 和 SSH 身份。按本文完成中继、Worker、
Web 和模型配置，逐项验证第 8 节；如真实视频识别未测试，应明确记录。
