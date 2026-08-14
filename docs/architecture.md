# Architecture

## C4 context

```mermaid
C4Context
    title dsh-satori system context

    Person(user, "IM user")
    System_Ext(platform, "IM platform", "Telegram, Discord, Lark, WeCom, or another Satori adapter")
    System(satori, "Satori server", "Normalizes platform access and exposes the Satori protocol")
    System(dshSatori, "dsh-satori", "Maps admitted Satori messages to DSH turns")
    System(dsh, "DeepSeek Harness", "Runs agents, tools, sessions, and model calls")

    Rel(user, platform, "Sends and receives messages")
    Rel(platform, satori, "Adapter events and API calls")
    Rel(satori, dshSatori, "WebSocket events and HTTP API")
    Rel(dshSatori, dsh, "Cordis services and session events")
```

## C4 container view

```mermaid
C4Container
    title dsh-satori containers

    Container_Boundary(plugin, "dsh-satori Cordis plugin") {
        Container(client, "SatoriClient", "TypeScript", "IDENTIFY/READY, event cursor, heartbeat, reconnect, message.create")
        Container(codec, "Satori element codec", "@satorijs/element", "Extracts inbound text and safely serializes outbound plain text")
        Container(admission, "Admission", "TypeScript", "Canonical user/channel/login allowlists")
        Container(router, "SessionRouter", "TypeScript", "Bounded identity mapping and serialized capacity ownership")
        Container(tracker, "ReplyTracker", "TypeScript", "Correlates DSH messageId to turn and terminal reason")
        Container(bridge, "Plugin entry", "Cordis", "Routes accepted messages and committed replies")
    }

    System_Ext(satori, "Satori server")
    System_Ext(agents, "DSH ctx.agents")
    System_Ext(persistence, "DSH ctx.sessionPersistence")
    System_Ext(sessions, "DSH session/event")

    Rel(satori, client, "snake_case payloads")
    Rel(client, satori, "message.create")
    Rel(client, codec, "message.content / final plain text")
    Rel(codec, admission, "inbound plain text + identity")
    Rel(admission, bridge, "admitted message")
    Rel(bridge, router, "withAgent(identity, followup)")
    Rel(router, agents, "get / resume / create / dispose")
    Rel(router, persistence, "Check persisted session existence")
    Rel(bridge, tracker, "messageId / claimed turn / terminal reason")
    Rel(bridge, sessions, "assistant/message and turn/end")
```
