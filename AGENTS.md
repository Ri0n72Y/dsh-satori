# AGENTS.md

## Project

`dsh-satori` is a small adapter between DeepSeek Harness and the Satori protocol. DSH owns agents and sessions. Satori owns IM platform access. Keep the bridge focused on translating identities, messages, lifecycle, and replies between them.

## Before editing

Read `README-zh.md`, `README.md`, and the diagrams in `docs/`. `README-zh.md` is the source of truth for README structure and wording; keep `README.md` synchronized as its English translation.

Check the current DSH agent/session APIs and the current Satori protocol before changing integration behavior. Use the existing abstractions before adding a new one. Platform-specific protocol code belongs in Satori or its adapters unless the bridge needs a protocol feature that Satori does not expose.

## Architecture documents

The Mermaid diagrams are part of the implementation contract:

- `docs/architecture.md`: C4 system and container views.
- `docs/data-flow.md`: inbound and outbound message flow.
- `docs/uml.md`: runtime classes and ownership.

Update the relevant diagram in the same change whenever code changes components, dependencies, message flow, session identity, lifecycle, retry behavior, authentication, or ownership. A diagram that describes an older revision is a bug.

PR descriptions should include the Mermaid view affected by the change when the architecture changes.

## Development

Use pnpm.

```sh
pnpm install
pnpm test
pnpm build
```

Keep tests close to behavior. Session identity, event filtering, reply selection, reconnect state, and lifecycle cleanup need regression tests when changed.

The standalone package build uses `tsdown` without DSH type checking because DSH currently has unpublished internal package dependencies. When a change depends on DSH API details, verify it against a current DSH source checkout.

Before opening or updating a PR, run the affected tests and record the tested head SHA and result in the PR description.

## Scope of the MVP

The current bridge handles Satori text messages and sends the final visible assistant text back to the same Satori channel. Add richer Satori elements after the text path is stable.
