# Data flow

## Text message round trip

```mermaid
sequenceDiagram
    participant U as IM user
    participant S as Satori server
    participant C as SatoriClient
    participant R as SessionRouter
    participant A as DSH Agent
    participant L as DSH session log

    U->>S: message
    S-->>C: EVENT message-created
    C->>R: platform + selfId + channelId
    R->>A: get, resume, or create
    C->>A: followup(user text)
    A->>L: assistant/message
    A->>L: turn/end
    L-->>C: session/event
    C->>S: POST v1/message.create
    S-->>U: assistant text
```

The session key is deterministic:

```text
<sessionPrefix>:<platform>:<selfId>:<channelId>
```

Each component is URI-encoded before joining. A direct chat and a group channel therefore keep separate DSH histories. Multiple users in the same group share the group session.
