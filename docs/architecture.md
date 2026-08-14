# Architecture

## C4 context

```mermaid
C4Context
    title dsh-satori system context

    Person(user, "IM user")
    System_Ext(platform, "IM platform", "Telegram, Discord, Lark, WeCom, or another Satori adapter")
    System(satori, "Satori server", "Normalizes platform access and exposes the Satori API")
    System(dshSatori, "dsh-satori", "Maps admitted Satori messages to DSH turns")
    System(dsh, "DeepSeek Harness", "Runs agents, tools, sessions, and model calls")

    Rel(user, platform, "Sends and receives messages")
    Rel(platform, satori, "Adapter events and API calls")
    Rel(satori, dshSatori, "Satori WebSocket and HTTP API")
    Rel(dshSatori, dsh, "Cordis services and session events")
```

## C4 container view

```mermaid
C4Container
    title dsh-satori containers

    Container_Boundary(plugin, "dsh-satori Cordis plugin") {
        Container(client, "SatoriClient", "TypeScript", "WebSocket, snake_case normalization, reconnect cursor, message.create")
        Container(admission, "Admission", "TypeScript", "Allow users, channels, and optional bot logins")
        Container(router, "SessionRouter", "TypeScript", "Maps Satori identity to DSH SessionId and bounds live agents")
        Container(tracker, "ReplyTracker", "TypeScript", "Correlates Satori messageId to exact DSH turns")
        Container(bridge, "Plugin entry", "Cordis", "Routes inbound messages and committed replies")
    }

    System_Ext(satori, "Satori server")
    System_Ext(agents, "DSH ctx.agents")
    System_Ext(persistence, "DSH ctx.sessionPersistence")
    System_Ext(sessions, "DSH session/event")

    Rel(satori, client, "snake_case EVENT payloads")
    Rel(client, satori, "message.create")
    Rel(client, bridge, "camelCase Satori events")
    Rel(bridge, admission, "Check sender/channel/login")
    Rel(bridge, router, "Resolve admitted conversation")
    Rel(router, agents, "get / resume / create / dispose")
    Rel(router, persistence, "Check persisted session existence")
    Rel(bridge, tracker, "messageId / claimed turn / final text")
    Rel(bridge, sessions, "Observe assistant/message and turn/end")
```
