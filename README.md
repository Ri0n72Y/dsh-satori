# dsh-satori

[中文](README-zh.md) | [English](README.md)

`dsh-satori` is a small bridge between DeepSeek Harness and Satori. It receives Satori messages, applies admission and session mapping, sends text to a DSH Agent, and returns the settled reply to the source channel.

The current MVP handles text only.

## Architecture

```mermaid
flowchart LR
    IM[IM platforms] <--> KS[Koishi / Satori Runtime]
    KS <--> Plugin[dsh-satori]
    Plugin <--> DSH[DeepSeek Harness]
```

Platform accounts, tokens, app IDs, and secrets belong in the Koishi / Satori Runtime. They are not configured in DSH or `dsh-satori`. Prepare a runtime with the required platform adapter and Satori Server before connecting this plugin.

- [Koishi installation](https://koishi.chat/en-US/manual/starter/)
- [Satori SDK and adapters](https://satori.chat/en-US/sdk/)
- [`server-satori` configuration](https://koishi.chat/en-US/plugins/develop/server-satori)

See [`docs/architecture.md`](docs/architecture.md), [`docs/data-flow.md`](docs/data-flow.md), and [`docs/uml.md`](docs/uml.md) for the detailed design.

## Requirements

- DeepSeek Harness with agent loop and session persistence configured.
- Node.js `^22.19.0 || >=24.0.0`.
- A configured Koishi / Satori Runtime with at least one working IM adapter.

The source compatibility baseline is pinned to DeepSeek Harness `47f943859bef60e4160492346772ded9b24f765a`, repository version `0.1.0-rc.5`. Runtime E2E against published packages used `0.1.0-rc.6`.

## Install into DSH

GitHub:

```sh
dsh plugin --profile web add github:Ri0n72Y/dsh-satori
```

Local checkout:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-satori
```

Git installs compile TypeScript through `prepare`. If pnpm blocks the build script, add this to `$DSH_HOME/profiles/web/pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-satori: true
```

Then inspect the composed config and start DSH:

```sh
dsh --profile web --dump-config
dsh --profile web
```

## Configuration

```sh
SATORI_BASE_URL=http://127.0.0.1:5140/satori
SATORI_TOKEN=your-token
SATORI_CWD=/absolute/path/to/safe-workspace
SATORI_ALLOWED_USERS=telegram:123456
SATORI_ALLOWED_CHANNELS=discord:987654321
SATORI_ALLOWED_LOGINS=telegram:my_bot_id
```

`SATORI_TOKEN` and `SATORI_CWD` are optional. If `SATORI_CWD` is omitted, fresh sessions do not write `meta.cwd`.

External senders are denied by default. Configure at least `SATORI_ALLOWED_USERS` or `SATORI_ALLOWED_CHANNELS`. Separate multiple values with commas. IDs may contain `:`. Use this only in a trusted test environment:

```sh
SATORI_UNSAFE_ALLOW_ALL=1
```

## Behavior

- Inbound `message.content` is parsed with the official `@satorijs/element` package. Only text nodes enter model context; images, mentions, quotes, and other elements are ignored by the MVP.
- Outbound text is serialized through the same element library, so model output such as `<at/>` or `<img/>` remains plain text.
- Group senders map to separate DSH sessions and replies use the source `message.id` as a standard Satori quote. Direct messages do not add a quote.
- Only `completed` or `max-tokens` turns correlated to the originating Satori input can produce a reply. If the last committed assistant message has no visible text, earlier text is not reused.
- `sn` is a receive cursor. Inbound and outbound delivery are currently at-most-once oriented; replay depends on the deployed Satori Server.

Session IDs are derived from `platform + selfId + channelId + userId` with SHA-256, so full external IDs are not written into persistence directory names. The plugin owns at most 32 live agents by default and only evicts idle agents.

## Development and verification

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm pack
```

Current verification:

- Vitest: 43/43 tests passed across 8 files.
- Build passed and produced ESM output.
- Strict typecheck passed against declarations built from the pinned DSH `0.1.0-rc.5` source baseline.
- Runtime Satori wire E2E passed 13/13 checks over real WebSocket and HTTP. The DSH side used stubs and peer packages came from the published `0.1.0-rc.6` release.
- A full E2E with the real DSH Agent Loop, a model, and a real Satori Server is still pending.

Development rules are in [`AGENTS.md`](AGENTS.md).

## License

MIT
