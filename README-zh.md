# dsh-satori

[中文](README-zh.md) | [English](README.md)

`dsh-satori` 是连接 DeepSeek Harness 与 Satori 的轻量插件。Satori 负责 Telegram、Discord、飞书等 IM 平台，插件负责准入检查、DSH session 映射和回复关联。

当前 MVP 只处理文本。它直接使用 Satori `/v1/events` WebSocket 与 `/v1/message.create` API。

## 架构

```mermaid
flowchart LR
    IM[IM 平台] <--> Satori[Satori Server]
    Satori <--> Plugin[dsh-satori]
    Plugin <--> DSH[DeepSeek Harness]
```

详细设计见 [`docs/architecture.md`](docs/architecture.md)、[`docs/data-flow.md`](docs/data-flow.md) 和 [`docs/uml.md`](docs/uml.md)。

## 环境要求

- DeepSeek Harness，已配置 agent loop 与 session persistence。
- Node.js `^22.19.0 || >=24.0.0`。
- 一个正在运行的 Satori Server，并至少配置一个 IM adapter。

当前 CI 的 DSH API 兼容基线固定为 DeepSeek Harness `47f943859bef60e4160492346772ded9b24f765a`（仓库版本 `0.1.0-rc.5`）。兼容 job 会使用 DSH 自己的 `build:lib:host` 构建公开声明，再对本插件执行严格 TypeScript 检查。这一层保护的是编译期集成边界；发布前仍需要完成一次真实 DSH + Satori 的运行时往返 E2E。

## 构建

```sh
git clone https://github.com/Ri0n72Y/dsh-satori.git
cd dsh-satori
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

构建结果位于 `lib/`。

## 安装到 DSH

本地目录：

```sh
dsh plugin --profile web add /absolute/path/to/dsh-satori
```

GitHub：

```sh
dsh plugin --profile web add github:Ri0n72Y/dsh-satori
```

Git 安装会通过 `prepare` 编译 TypeScript。如果 pnpm 阻止构建脚本，在 `$DSH_HOME/profiles/web/pnpm-workspace.yaml` 中加入：

```yaml
allowBuilds:
  dsh-satori: true
```

安装后检查配置并启动：

```sh
dsh --profile web --dump-config
dsh --profile web
```

## 配置 Satori

```sh
SATORI_BASE_URL=http://127.0.0.1:5140/satori
SATORI_TOKEN=your-token
```

如果 Satori Server 不要求认证，可以不设置 `SATORI_TOKEN`。

### DSH 工作目录

插件不会在未配置时自行选择工作目录。未设置 `SATORI_CWD` 时，新建 DSH session 不写入 `meta.cwd`，保持 DSH 自身的默认语义。

需要让 IM session 固定使用某个工作区时显式配置：

```sh
SATORI_CWD=/absolute/path/to/safe-workspace
```

配置值会先去除首尾空白，再解析成绝对路径后写入新 session 的 `meta.cwd`。对可调用文件、Shell 或其他工具的 Agent，应将这里指向明确的受控工作区，并同时确认 DSH profile 的工具与审批策略。

### 准入控制

插件默认不接受外部发送者。至少配置允许的用户或频道：

```sh
SATORI_ALLOWED_USERS=telegram:123456
SATORI_ALLOWED_CHANNELS=discord:987654321
```

多个值使用逗号分隔。ID 中可以包含 `:`，例如：

```sh
SATORI_ALLOWED_USERS=matrix:@alice:example.org
```

已经 URI 编码的 ID 也会被归一化后比较。

还可以限制允许驱动 DSH 的 Satori 登录：

```sh
SATORI_ALLOWED_LOGINS=telegram:my_bot_id
```

仅在可信测试环境中可以临时开放全部非 bot 发送者：

```sh
SATORI_UNSAFE_ALLOW_ALL=1
```

机器人自身消息会优先通过 Satori `event.selfId` 与发送者 ID 比较后拒绝；`login.user.id` 和 `user.isBot` 作为额外保护。

允许一个群聊频道意味着该频道内的发送者都能通过频道准入，但不同发送者仍映射到不同 DSH session。对于 Satori `Channel.Type.TEXT`（群聊/文本频道），插件要求事件带有源 `message.id`，并在回复中引用该消息；缺少源消息 ID 的群聊事件会被忽略，避免并发回复失去归属。

## 文本消息

Satori wire 上的 `message.content` 是元素序列化字符串。插件使用 Satori 官方 `@satorijs/element` parser 解析它，只把 text 节点送入 DSH；图片、mention、quote 等非文本元素暂不进入模型。没有文本的消息会被忽略。

DSH 返回的普通文本也通过同一个 Satori element 库序列化，因此 `<at/>`、`<img/>` 等模型输出会作为普通文本显示，不会被 Satori 解释成消息元素。群聊回复会在安全转义后的模型文本前添加标准 `<quote id="..."/>` 传输元素；这个 quote 来自源 Satori 消息元数据，不进入模型上下文。

## Session 映射

每个 Satori 登录、频道和发送者都会得到稳定的 DSH session。SessionId 使用这些原始字段计算 SHA-256 派生键，并保留短的平台标签：

```text
<bounded-prefix>:<bounded-platform>:<identity-hash>
```

这样 session id 长度固定在较小范围内，也不会把完整外部用户/频道 ID 写进持久化目录名。

插件默认最多持有 32 个自己创建的 live Agent。Agent 获取、创建和同步 `followup()` 处于同一个容量临界区；达到上限时只回收 idle Agent。超过 `idleTtlMs` 的 idle Agent 会在下一次容量检查时优先回收。

## 消息路径

```mermaid
sequenceDiagram
    participant IM as IM 用户
    participant S as Satori
    participant P as dsh-satori
    participant D as DSH Agent

    IM->>S: 消息
    S->>P: message-created
    P->>P: snake_case 归一化
    P->>P: element parse + 准入 + source message id
    P->>D: followup(user message)
    D-->>P: inbox/claimed(messageId, turn)
    D-->>P: assistant/message(turn)*
    D-->>P: turn/end(turn, reason)
    P->>P: 最后一次 committed assistant message 决定最终文本
    P->>P: 群聊添加 source quote + 安全文本序列化
    P->>S: completed/max-tokens 才 message.create
    S-->>IM: 文本回复
```

插件只转发与该 Satori 输入精确关联的 DSH turn。每个 `assistant/message` 都会覆盖该 turn 的最终候选状态；如果最后一次已提交 assistant message 没有可见文本，之前的文本不会被当成最终回复。`error`、`aborted`、`blocked` 和 `interrupted` turn 不发送回复；`max-tokens` 会发送其最后一次已提交且可见的文本。

## 重连与交付语义

插件保存最近**收到**的 Satori event sequence，并在重连 IDENTIFY 时带回 `sn`。连续连接只有在收到 `READY` 后才会重置退避计数。普通断线使用指数退避；Satori 以 `4004 invalid token` 关闭连接时停止自动重连并记录原因，等待配置修正或插件重载。

`sn` 是传输接收游标，不是“已经成功送入 DSH”的确认。当前 inbound 和 outbound 都按 at-most-once 思路处理：事件进入本地 handler 后不会因为后续业务失败而回退 `sn`；`message.create` 失败会记录错误，但不会在没有幂等键的情况下盲目重试。Satori Server 是否能按 `sn` replay 漏收事件取决于实际 Server 版本和它可用的 resume buffer，必须在真实 E2E 中验证。

## 生命周期

插件卸载时会先关闭新的消息准入，并启动 `SessionRouter.dispose()`。Router 会立即 abort 可取消的 session-persistence 查询，再与 Satori client 的 inbound/outbound drain 并行收敛；已经进入 DSH `agents.create/resume` 且不能取消的工作会在返回后按现有 ownership 检查处置。

## 开发

修改前阅读 [`AGENTS.md`](AGENTS.md)。代码改变组件、依赖、消息流、session identity、生命周期、认证、重连或 ownership 时，同一个 PR 必须更新对应 Mermaid 图。

```sh
pnpm test
pnpm build
```

CI 还会独立 checkout 固定的 DSH source baseline、构建 host declaration，并运行插件兼容类型检查。

## License

MIT
