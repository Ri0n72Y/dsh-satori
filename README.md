# dsh-satori

`dsh-satori` connects DeepSeek Harness to a Satori server. Satori handles the IM platforms. This plugin maps Satori conversations to DSH sessions and sends DSH replies back through Satori.

The current MVP handles text messages. One Satori login and channel maps to one deterministic DSH session, so the same chat can resume after the plugin reconnects.

## How it fits

```mermaid
flowchart LR
    IM[IM platforms] <--> Satori[Satori server]
    Satori <--> Plugin[dsh-satori]
    Plugin <--> DSH[DeepSeek Harness]
```

See [`docs/architecture.md`](docs/architecture.md), [`docs/data-flow.md`](docs/data-flow.md), and [`docs/uml.md`](docs/uml.md) for the maintained design diagrams.

## Requirements

- DeepSeek Harness with an agent loop and session persistence configured.
- Node.js 22.19 or newer, matching the current DSH runtime requirement.
- A running Satori server with at least one IM adapter.

The default Satori base URL is `http://127.0.0.1:5140/satori`.

## Build

```sh
git clone https://github.com/Ri0n72Y/dsh-satori.git
cd dsh-satori
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Build output goes to `lib/`.

## Install into DSH

### Local checkout

Install the current checkout into a DSH profile:

```sh
dsh plugin --profile web add /absolute/path/to/dsh-satori
```

Check the composed config before starting DSH:

```sh
dsh --profile web --dump-config
dsh --profile web
```

### Install from GitHub

```sh
dsh plugin --profile web add github:Ri0n72Y/dsh-satori
```

The package uses `prepare` to compile TypeScript after a Git install. pnpm requires explicit permission before it runs dependency build scripts. If the first install is blocked, add this to `$DSH_HOME/profiles/web/pnpm-workspace.yaml`:

```yaml
allowBuilds:
  dsh-satori: true
```

Then run the `dsh plugin ... add` command again. For a reproducible install, pin a commit:

```sh
dsh plugin --profile web add github:Ri0n72Y/dsh-satori#<commit-sha>
```

## Configure Satori

The bundled Cordis patch reads these environment variables:

```sh
SATORI_BASE_URL=http://127.0.0.1:5140/satori
SATORI_TOKEN=your-token
```

`SATORI_TOKEN` can be omitted when the Satori server does not require authentication.

You can also override the plugin row in the profile's `cordis.patch.yml`:

```yaml
- id: satori
  name: dsh-satori
  config:
    baseUrl: http://127.0.0.1:5140/satori
    token: your-token
    sessionPrefix: satori
```

`provider` and `model` are optional config fields. Leave them unset to use the model route supplied by the surrounding DSH composition.

## Session mapping

A Satori conversation maps to:

```text
<sessionPrefix>:<platform>:<selfId>:<channelId>
```

The adapter first checks for a live DSH agent, then tries to resume the persisted session, then creates it when no saved session can be resumed.

## Development

Read [`AGENTS.md`](AGENTS.md) before changing the plugin. Architecture changes must update the matching Mermaid diagrams in `docs/` in the same PR.

```sh
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT
