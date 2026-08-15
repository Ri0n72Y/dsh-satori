# Data flow

```mermaid
sequenceDiagram
    participant U as IM user
    participant S as Koishi / Satori runtime
    participant C as SatoriClient
    participant E as Satori element codec
    participant G as Admission
    participant R as SessionRouter
    participant A as DSH Agent
    participant T as ReplyTracker

    U->>S: message
    S-->>C: EVENT message-created
    C->>C: snake_case to camelCase
    C->>E: message.content
    E-->>C: text nodes only
    C->>G: selfId + user + channel + message.id
    G-->>C: admitted target + identity
    C->>R: withAgent(identity)
    R->>R: capacity gate + cancellable persistence lookup
    R->>A: get, resume, or create
    R->>A: verify live identity
    C->>T: queue DSH messageId + Satori target
    C->>A: followup(user message)
    A-->>T: agent/inbox/claimed(messageId, turn)
    loop each committed provider response
        A-->>T: assistant/message(turn)
        T->>T: replace final visible-text candidate, including empty
    end
    A-->>T: turn/end(turn, reason)
    alt completed or max-tokens with visible final text
        T-->>C: correlated final reply
        opt Channel.Type.TEXT
            C->>E: quote(source message.id)
        end
        C->>E: serialize assistant text
        E-->>C: quote metadata + escaped text
        C->>S: POST v1/message.create
        S-->>U: assistant reply
    else no final text or failed turn
        T->>T: clear tracked turn
    end
```

Session identity is a bounded hash of `platform + selfId + channelId + userId`. Group replies require a source `message.id`; direct replies do not add a quote.

During teardown, the router aborts cancellable persistence work before draining owned agents. Satori `sn` advances when an event is received, so it is a transport cursor rather than an end-to-end processing acknowledgement.
