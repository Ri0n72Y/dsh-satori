# Data flow

## Workspace configuration

```mermaid
sequenceDiagram
    participant U as DSH Web user
    participant C as dsh-satori config card
    participant H as dsh-satori Host
    participant S as ctx.settings
    participant W as ctx.workspaceRegistry

    U->>C: save directory
    C->>H: PUT /plugins/dsh-satori/config
    H->>W: resolveByPath(directory)
    alt Workspace exists
        W-->>H: existing Workspace
    else no Workspace owns path
        H->>W: create(directory)
        W-->>H: new Workspace
    end
    H->>S: persist canonical workspacePath
    H-->>C: canonical path + reused status
```

The directory must already exist. DSH owns canonicalization and Workspace records; the plugin does not create filesystem directories.

## Message path

```mermaid
sequenceDiagram
    participant U as IM user
    participant S as Koishi / Satori runtime
    participant C as SatoriClient
    participant W as WorkspaceResolver
    participant R as SessionRouter
    participant D as DSH Workspace
    participant A as DSH Agent
    participant T as ReplyTracker

    U->>S: message
    S-->>C: EVENT message-created
    C->>C: normalize + parse text + admission
    C->>W: current configured Workspace
    W->>D: resolveByPath or create
    D-->>W: canonical path
    C->>R: withAgent(identity, Workspace)
    R->>R: SessionId includes Workspace path
    R->>A: get, resume, or create with meta.cwd
    R->>D: attachSession(sessionId)
    C->>T: queue DSH messageId + Satori target
    C->>A: followup(user message)
    A-->>T: inbox/claimed + assistant/message + turn/end
    alt settled turn has visible final text
        T-->>C: correlated reply
        C->>S: message.create
        S-->>U: assistant reply
    else no final text or failed turn
        T->>T: clear tracked turn
    end
```

Changing the configured Workspace changes the SessionId discriminator. Existing sessions remain attached to their original Workspace instead of crossing project directories.

During teardown, the router aborts cancellable persistence work before draining owned agents. Satori `sn` advances when an event is received, so it is a transport cursor rather than an end-to-end processing acknowledgement.
