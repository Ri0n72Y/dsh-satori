# AGENTS.md

## Scope

`dsh-satori` bridges Satori transport to DeepSeek Harness. DSH owns agents and sessions. The Koishi / Satori Runtime owns platform accounts and adapters. Keep platform login logic out of this plugin.

`README-zh.md` is the canonical README. Keep `README.md` synchronized.

## Check upstream first

Before changing integration behavior, read the current implementations that define the boundary:

- Satori `packages/server` and `adapters/satori` for wire format, IDENTIFY/READY, `sn`, heartbeat, and HTTP headers.
- `@satorijs/element` for message parsing and serialization.
- AstrBot, LangBot, or AIRI when comparing established Satori consumer patterns.
- DSH ACP bridge and agent lifecycle code for `AgentHandle`, inbox/turn correlation, errors, and teardown.

Do not reconstruct these contracts from memory when upstream code is available.

## Runtime contracts

- A reply requires exact `user messageId -> agent/inbox/claimed -> turn` correlation.
- Every committed `assistant/message` replaces the turn's final visible-text candidate, including an empty candidate.
- `event.selfId` is the primary self-message identity. `login.user.id` and `user.isBot` are additional guards.
- Satori `Channel.Type.TEXT` replies require source `message.id` and preserve it as a standard quote. Direct replies do not add a quote.
- `sn` is a receive cursor, not a business-processing acknowledgement. Current delivery is at-most-once oriented.
- Omitted `cwd` stays omitted from fresh DSH session metadata.
- Router disposal aborts cancellable persistence work before draining owned agents.
- DSH/Cordis packages imported or injected by this plugin are required peers.

## Development

Use pnpm:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The normal test job and `dsh-compat` job are intentionally separate. Do not leave a `.dsh-source` junction or checkout under the repository while running Vitest unless it is explicitly excluded from discovery; Vitest may traverse the full DSH source tree.

The source compatibility baseline is pinned to DSH `47f943859bef60e4160492346772ded9b24f765a`, repository version `0.1.0-rc.5`. Manual runtime wire E2E has also been checked with the published `0.1.0-rc.6` peer packages. Record source and runtime baselines separately when they differ.

Add regression tests when changing wire normalization, element handling, admission, session identity, reply settlement, reconnect state, capacity, workspace metadata, or teardown.

## Documentation and PRs

The Mermaid files in `docs/` describe the current implementation. Update them in the same change when components, dependencies, message flow, session identity, lifecycle, retry behavior, authentication, admission, or ownership change.

PR descriptions should record the tested plugin head, DSH source baseline, runtime package baseline when applicable, automated results, manual results, and any remaining E2E gate.
