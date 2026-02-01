# Clawverse Architecture

## Overview

Clawverse is designed as a coordination layer that sits above individual OpenClaw gateway instances, providing:

1. **Unified Management**: Single control point for multiple gateways
2. **Message Routing**: Route messages between nodes based on topology
3. **Context Sharing**: Query and share session data across nodes
4. **Health Monitoring**: Track connectivity and health of all nodes

## Components

### Daemon Server

The daemon is a WebSocket server that manages all node connections:

```
┌────────────────────────────────────────────────────────┐
│                    DaemonServer                         │
│                                                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │   Node      │  │  Topology   │  │   Context   │     │
│  │  Registry   │  │   Manager   │  │   Broker    │     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘     │
│         │                │                │             │
│         └────────────────┼────────────────┘             │
│                          │                              │
│                   ┌──────┴──────┐                       │
│                   │ Health      │                       │
│                   │ Monitor     │                       │
│                   └─────────────┘                       │
└────────────────────────────────────────────────────────┘
```

### Transport Layer

Three transport types for connecting to OpenClaw gateways:

1. **LocalTransport**: Direct WebSocket to localhost
2. **SshTransport**: SSH tunnel with port forwarding
3. **UrlTransport**: Direct WebSocket to any URL

All transports implement the same interface:

```typescript
interface Transport {
  readonly nodeId: string;
  readonly status: TransportStatus;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: ClawverseMessage): Promise<void>;
  call<T>(method: string, params?: unknown): Promise<GatewayRpcResponse<T>>;
  on(handler: TransportEventHandler): void;
  off(handler: TransportEventHandler): void;
}
```

### Topology Manager

Manages hierarchical relationships between nodes:

```
          work (root)
            │
            ├── delegate
            │
      ┌─────┴─────┐
      │           │
   server      laptop
      │
      └── message
           │
        mobile
```

Permission checking:
- Same node: Always allowed
- Direct parent → child: Based on relation mode
- Transitive (grandparent → grandchild): Inherits from direct child relation
- Peers (no relation): Only messaging allowed by default

### Context Broker

Handles cross-node context queries with caching:

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Client    │─────►│   Context   │─────►│   Remote    │
│             │      │   Broker    │      │   Gateway   │
└─────────────┘      └──────┬──────┘      └─────────────┘
                            │
                     ┌──────┴──────┐
                     │    Cache    │
                     └─────────────┘
```

Features:
- LRU cache with TTL
- Automatic cache invalidation
- Support for session history and session list queries

## Message Flow

### Sending a Message

```
1. CLI/Client sends message to Daemon
2. Daemon validates message format
3. TopologyManager checks permissions
4. NodeRegistry retrieves transport
5. Transport sends to target gateway
6. (Optional) Wait for response
7. Return result to client
```

### Context Query

```
1. Client requests context query
2. Broker checks cache
3. If miss: Transport calls gateway RPC
4. Gateway returns session data
5. Broker caches result
6. Return to client
```

## Protocol

### Message Types

| Type | Description |
|------|-------------|
| `control` | Node management (restart, stop, config) |
| `delegate` | Task delegation with response |
| `message` | Simple message passing |
| `context_query` | Context data request |
| `context_response` | Context data response |
| `ping/pong` | Health check |

### Message Structure

```typescript
interface ClawverseMessage {
  id: string;           // Unique message ID
  source: string;       // Source node ID
  target: string;       // Target node ID
  type: MessageType;    // Message type
  payload: unknown;     // Type-specific payload
  timestamp: number;    // Unix timestamp
  correlationId?: string; // For request/response pairing
}
```

## Configuration

Configuration is hierarchical:

```
~/.clawverse/
├── config.json       # Main configuration
├── daemon.pid        # Daemon PID file
├── daemon.out.log    # Daemon stdout
└── daemon.err.log    # Daemon stderr
```

Environment variables:
- `CLAWVERSE_HOME`: Override config directory

## Security Model

1. **Transport Authentication**: Each transport can have its own auth (token/password)
2. **Topology Permissions**: Fine-grained control over node interactions
3. **Local Binding**: Daemon binds to loopback by default
4. **No Stored Secrets**: Tokens are in config, not hardcoded

## Scalability

- Designed for personal/small team use (10s of nodes)
- Connection pooling with auto-reconnect
- In-memory caching reduces network calls
- Async message delivery for non-blocking operations
