# Architecture

## C4 context

```mermaid
C4Context
    title dsh-satori system context

    Person(user, "IM user")
    System_Ext(platform, "IM platform", "Telegram, Discord, Lark, WeCom, or another supported platform")
    System(satori, "Koishi / Satori runtime", "Owns platform adapters and exposes the Satori protocol")
    System(dshSatori, "dsh-satori", "Maps admitted Satori messages to DSH turns")
    System(dsh, "DeepSeek Harness", "Runs agents, tools, sessions, and model calls")

    Rel(user, platform, "Sends and receives messages")
    Rel(platform, satori, "Platform adapter")
    Rel(satori, dshSatori, "Satori WebSocket events and HTTP API")
    Rel(dshSatori, dsh, "Cordis services and session events")
```

## C4 container view

```mermaid
C4Container
    title dsh-satori containers

    Container_Boundary(plugin, "dsh-satori Cordis plugin") {
        Container(client, "SatoriClient", "TypeScript", "IDENTIFY/READY, event cursor, heartbeat, reconnect, message.create")
        Container(codec, "Satori element codec", "@satorijs/element", "Extracts inbound text and serializes outbound text")
        Container(admission, "Admission", "TypeScript", "Canonical user, channel, and login allowlists")
        Container(router, "SessionRouter", "TypeScript", "Bounded identity mapping and agent ownership")
        Container(tracker, "ReplyTracker", "TypeScript", "Correlates DSH messageId to turn and terminal reason")
        Container(bridge, "Plugin entry", "Cordis", "Routes admitted messages and settled replies")
    }

    System_Ext(satori, "Koishi / Satori runtime")
    System_Ext(agents, "DSH ctx.agents")
    System_Ext(persistence, "DSH ctx.sessionPersistence")
    System_Ext(sessions, "DSH session/event")

    Rel(satori, client, "snake_case payloads")
    Rel(client, satori, "message.create")
    Rel(client, codec, "message.content / final plain text")
    Rel(codec, admission, "plain text + identity")
    Rel(admission, bridge, "admitted message")
    Rel(bridge, router, "withAgent(identity, followup)")
    Rel(router, agents, "get / resume / create / dispose")
    Rel(router, persistence, "check persisted session")
    Rel(bridge, tracker, "messageId / claimed turn / terminal reason")
    Rel(bridge, sessions, "assistant/message and turn/end")
```
