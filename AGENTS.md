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

Keep tests close to behavior. Changes to the Satori wire boundary need raw snake_case fixtures. Changes to message parsing or reply quoting need Satori element fixtures. Changes to admission, session identity, reply settlement, reconnect state, capacity, workspace metadata, or lifecycle cleanup need regression tests.

A reply may be sent to IM only after the originating DSH user message is correlated through `agent/inbox/claimed` to an exact turn. Every committed `assistant/message` replaces the turn's final visible-text candidate, including an empty candidate; do not reuse text from an earlier provider call when the last committed assistant message has no visible text. Terminal turn reason is part of settlement, and failed or cancelled turns must not expose stale intermediate text.

Treat Satori `event.selfId` as the primary self-message identity. `login.user.id` and `user.isBot` are additional guards, not substitutes for the required event self ID.

A Satori text/group channel reply must preserve the source message identity. For `Channel.Type.TEXT`, require `message.id` and carry it as a standard Satori quote in outbound content. Direct-message replies do not need a quote. The quote is transport metadata and must not be injected into DSH model context.

The current Satori event sequence is a receive cursor, not a business-processing acknowledgement. Do not describe `sn` resume as an end-to-end delivery guarantee. Inbound and outbound are currently at-most-once oriented unless an explicit idempotency/deduplication design is added.

The normal package job remains standalone. The `dsh-compat` CI job checks out the pinned DeepSeek Harness source SHA, builds DSH host declarations with DSH's own build configuration, and strict-typechecks this plugin against those public declaration boundaries. When a change depends on DSH API details, update or confirm that baseline deliberately; do not replace the pinned SHA with an unreviewed moving target.

An omitted plugin `cwd` must stay omitted from fresh DSH session metadata. Only an explicitly configured workspace may be resolved to an absolute path and passed as `meta.cwd`.

Router teardown must close admission before draining ownership. Abort cancellable persistence work as soon as disposal begins; work already inside non-cancellable DSH agent creation/resume must still be disposed or ownership-checked when it returns.

Core DSH/Cordis packages used or injected by this plugin are required peers. Do not mark required host contracts optional merely to suppress standalone peer installation behavior; the DSH profile module fallback and compatibility CI own that integration boundary.

Before opening or updating a PR, run the affected tests and record the tested plugin head SHA, DSH compatibility SHA, and result in the PR description.

## MVP

The current bridge accepts admitted Satori messages that contain text, passes only their text elements to DSH, and sends the final committed visible text for completed or max-token turns back to the same Satori channel. Group replies preserve source-message correlation with a Satori quote. Rich-element handling can be added after the text path is stable.
