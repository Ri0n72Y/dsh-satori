# Architecture

## C4 context

```mermaid
C4Context
    title dsh-satori system context

    Person(user, "IM user")
    System_Ext(platform, "IM platform", "Telegram, Discord, Lark, WeCom, or another Satori adapter")
    System(satori, "Satori server", "Normalizes platform events and message APIs")
    System(dshSatori, "dsh-satori", "Maps Satori conversations to DSH sessions")
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
        Container(client, "SatoriClient", "TypeScript", "WebSocket event stream, reconnect cursor, message.create")
        Container(router, "SessionRouter", "TypeScript", "Maps Satori identity to DSH SessionId and opens agents")
        Container(bridge, "Plugin entry", "Cordis", "Routes inbound messages and DSH session events")
    }

    System_Ext(satori, "Satori server")
    System_Ext(agents, "DSH ctx.agents")
    System_Ext(sessions, "DSH session/event")

    Rel(satori, client, "EVENT payloads")
    Rel(client, satori, "message.create")
    Rel(client, bridge, "Normalized Satori events")
    Rel(bridge, router, "Resolve conversation")
    Rel(router, agents, "get / resume / create")
    Rel(bridge, sessions, "Listen for assistant/message and turn/end")
```
