# AGENTS.md

## Project

`dsh-satori` is a small adapter between DeepSeek Harness and the Satori protocol. DSH owns agents and sessions. Satori owns IM platform access. Keep this bridge focused on transport adaptation, admission, identity mapping, lifecycle, message correlation, and replies.

## Before editing

Read `README-zh.md`, `README.md`, and the diagrams in `docs/`. `README-zh.md` is the source of truth for README structure and wording; keep `README.md` synchronized as its English translation.

Before changing integration behavior, check the current upstream implementations instead of reconstructing protocol behavior from memory:

- Satori `packages/server` and `adapters/satori` for wire format, IDENTIFY/READY, event sequence, heartbeat, and HTTP headers.
- `@satorijs/element` for `message.content`; do not add a second Satori markup parser here.
- Mature Satori consumers such as AstrBot, LangBot, and AIRI for reconnect and message-conversion patterns.
- DSH's ACP bridge and agent lifecycle documentation for `AgentHandle`, liveness checks, inbox/turn correlation, errors, and teardown.

## Architecture documents

The Mermaid diagrams are part of the implementation contract:

- `docs/architecture.md`: C4 system and container views.
- `docs/data-flow.md`: inbound and outbound message flow.
- `docs/uml.md`: runtime classes and ownership.

Update the relevant diagram in the same change whenever code changes components, dependencies, message flow, session identity, lifecycle, retry behavior, authentication, admission, or ownership. A diagram that describes an older revision is a bug.

PR descriptions should include the Mermaid view affected by an architecture change.

## Development

Use pnpm.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Keep tests close to behavior. Changes to the Satori wire boundary need raw snake_case fixtures. Changes to message parsing need Satori element fixtures. Changes to admission, session identity, reply settlement, reconnect state, capacity, or lifecycle cleanup need regression tests.

A reply may be sent to IM only after the originating DSH user message is correlated through `agent/inbox/claimed` to an exact turn. Terminal turn reason is part of reply settlement; do not expose stale intermediate assistant text from failed or cancelled turns.

The standalone package build uses `tsdown` without DSH type checking because DSH currently has unpublished internal package dependencies. When a change depends on DSH API details, verify it against a current DSH source checkout.

Before opening or updating a PR, run the affected tests and record the tested head SHA and result in the PR description.

## MVP

The current bridge accepts Satori messages that contain text, passes only their text elements to DSH, and sends the final committed text for completed or max-token turns back to the same Satori channel. Rich-element handling can be added after the text path is stable.
