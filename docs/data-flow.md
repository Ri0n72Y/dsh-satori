# Data flow

## Text message round trip

```mermaid
sequenceDiagram
    participant U as IM user
    participant S as Satori server
    participant C as SatoriClient
    participant G as Admission
    participant R as SessionRouter
    participant A as DSH Agent
    participant T as ReplyTracker

    U->>S: message
    S-->>C: snake_case EVENT message-created
    C->>C: normalize wire keys to camelCase
    C->>G: user + channel + login
    G-->>C: admitted
    C->>R: platform + selfId + channelId + userId
    R->>A: get, resume, or create
    C->>T: queue DSH messageId + Satori target
    C->>A: followup(user message)
    A-->>T: agent/inbox/claimed(messageId, turn)
    A-->>T: assistant/message(turn)
    A-->>T: turn/end(turn)
    T-->>C: correlated final reply
    C->>S: POST v1/message.create
    S-->>U: assistant text
```

The session key is deterministic:

```text
<sessionPrefix>:<platform>:<selfId>:<channelId>:<userId>
```

Each component is URI-encoded before joining. Different senders in the same group channel therefore get separate DSH histories in the MVP.

The bridge sends a DSH reply to Satori only when the originating Satori message was claimed into that exact DSH turn. Output produced by another driver of the same session is ignored.
