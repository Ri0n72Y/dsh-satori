# Data flow

```mermaid
sequenceDiagram
    participant U as IM user
    participant S as Satori server
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
    R->>R: capacity critical section
    R->>R: cancellable persistence lookup
    R->>A: get, resume, or create
    R->>A: verify live identity
    C->>T: queue DSH messageId + Satori target
    C->>A: followup(user message)
    A-->>T: agent/inbox/claimed(messageId, turn)
    loop every committed provider response in the turn
        A-->>T: assistant/message(turn)
        T->>T: replace final visible-text candidate, including empty
    end
    A-->>T: turn/end(turn, reason)
    alt completed or max-tokens with visible final text
        T-->>C: correlated final reply
        opt Satori Channel.Type.TEXT
            C->>E: prepend quote(source message.id)
        end
        C->>E: serialize assistant text safely
        E-->>C: quote metadata + escaped text
        C->>S: POST v1/message.create
        S-->>U: correlated assistant reply
    else no final text / error / aborted / blocked / interrupted
        T->>T: clear tracked turn without sending
    end
```

Session identity uses a bounded deterministic hash of `platform + selfId + channelId + userId`. The raw identity remains in runtime routing data rather than the DSH SessionId. A text/group channel requires a source `message.id` so concurrent replies can preserve their origin; direct channels do not add a quote.

On teardown, `SessionRouter.dispose()` marks the router closed and aborts cancellable `sessionPersistence.list(signal)` work before waiting for its capacity gate. Router disposal and `SatoriClient.stop()` then drain concurrently. Satori `sn` is advanced on receipt, so it is a transport cursor rather than an end-to-end processing acknowledgement.
