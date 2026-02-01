<h1 align="center">ClawVerse</h1>

<p align="center">
  🦞 Multi-Instance OpenClaw Orchestration Platform<br>
  <b>Manage, route, and sync your distributed AI assistants</b>
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> | English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="language">
  <img src="https://img.shields.io/badge/runtime-Node.js%2022%2B-339933" alt="runtime">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="license">
</p>

---

## 🏗️ Architecture

ClawVerse enables **hierarchical OpenClaw clusters** where one OpenClaw can manage multiple OpenClaws, forming scalable tree structures:

```
                              ┌─────────────────┐
                              │   ClawVerse     │
                              │      Hub        │
                              │  (Control Plane)│
                              └────────┬────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
    ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
    │  OpenClaw   │             │  OpenClaw   │             │  OpenClaw   │
    │   Master    │             │   Master    │             │   Master    │
    │  (Region A) │             │  (Region B) │             │  (Region C) │
    └──────┬──────┘             └──────┬──────┘             └─────────────┘
           │                           │
     ┌─────┴─────┐               ┌─────┴─────┐
     │           │               │           │
     ▼           ▼               ▼           ▼
┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐
│OpenClaw │ │OpenClaw │    │OpenClaw │ │OpenClaw │
│ Worker  │ │ Worker  │    │ Worker  │ │ Worker  │
│  A-1    │ │  A-2    │    │  B-1    │ │  B-2    │
└────┬────┘ └─────────┘    └─────────┘ └────┬────┘
     │                                      │
     ▼                                      ▼
┌─────────┐                            ┌─────────┐
│OpenClaw │  ← Multi-level nesting     │OpenClaw │
│  A-1-1  │                            │  B-2-1  │
└─────────┘                            └─────────┘
```

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🌳 **Topology Management** | Define flat or tree relationships between OpenClaw instances |
| 🔀 **Smart Routing** | Route messages based on channel, labels, or custom rules |
| 🔄 **Data Synchronization** | Sync memory, sessions, and skills across all nodes |
| ⬆️ **Task Escalation** | Auto-escalate unhandled tasks to parent nodes |
| ⬇️ **Task Delegation** | Delegate sub-tasks from parent to child nodes |
| 🌐 **Node Registry** | Register, monitor, and health-check multiple instances |
| 📱 **Full Channel Support** | All OpenClaw native channels + DingTalk, Feishu, WeCom |

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.0.0
- [OpenClaw](https://github.com/nicepkg/openclaw) installed on target machines

### 1. Install ClawVerse

```bash
git clone https://github.com/nicepkg/clawverse.git
cd clawverse
pnpm install && pnpm build
```

### 2. Start OpenClaw Gateways

On each machine running OpenClaw:

```bash
# Configure channels (same as standalone OpenClaw)
openclaw channels add imessage   # or discord, telegram, etc.

# Start gateway for ClawVerse to connect
openclaw gateway start --port 18789
```

### 3. Configure ClawVerse

```bash
mkdir -p ~/.clawverse
cp clawverse.example.json ~/.clawverse/clawverse.json
```

Edit `~/.clawverse/clawverse.json`:

```json
{
  "nodes": {
    "main": { "url": "ws://192.168.1.10:18789", "token": "xxx" },
    "worker": { "url": "ws://192.168.1.20:18789", "token": "xxx" }
  },
  "topology": {
    "type": "tree",
    "root": "main",
    "children": { "main": ["worker"] }
  },
  "routing": { "default": "main" },
  "sync": { "enabled": true }
}
```

### 4. Start Hub

```bash
pnpm dev    # Development mode
pnpm start  # Production mode
```

### 5. Verify

```bash
pnpm clawverse status  # Check hub status
pnpm clawverse nodes   # List all nodes
```

---

## 🔌 Channel Support

> **ClawVerse orchestrates OpenClaw instances, not re-implements channels.**

### Native Channels (via OpenClaw)

Configure on OpenClaw nodes using standard `openclaw` commands:

```bash
openclaw channels add imessage
openclaw channels add whatsapp
openclaw channels add discord
openclaw channels add telegram
# ... etc
```

### Extended Channels (via Bridge)

For channels not natively supported by OpenClaw, use bridges that connect to the Hub's HTTP API:

| Channel | Bridge | Port | Hub Endpoint |
|---------|--------|------|--------------|
| 🔷 DingTalk | `bridges/dingtalk` | 3001 | `POST /api/agent` |
| 🔶 Feishu | `bridges/feishu` | 3002 | `POST /api/agent` |
| 🟢 WeCom | `bridges/wecom` | 3003 | `POST /api/agent` |

```bash
cd bridges/dingtalk
export DINGTALK_OUTGOING_TOKEN=xxx
export CLAWVERSE_HUB_URL=http://localhost:18801  # HTTP API port
pnpm standalone
```

**HTTP API Endpoints:**
```
POST /api/agent         # Receive channel messages, route to OpenClaw
GET  /api/health        # Health check
GET  /api/status        # Hub status with all nodes
GET  /api/nodes         # List registered nodes
POST /api/routing/test  # Test routing rules
```

---

## 📖 Usage Examples

### Multi-Device Sync (Flat Topology)

```json
{
  "nodes": {
    "desktop": { "url": "ws://192.168.1.10:18789" },
    "laptop": { "url": "ws://192.168.1.20:18789" },
    "server": { "url": "ws://192.168.1.30:18789" }
  },
  "topology": { "type": "flat" },
  "sync": { "enabled": true, "scope": { "memory": true, "sessions": true } }
}
```

### Task Distribution (Tree Topology)

```json
{
  "nodes": {
    "main": { "url": "ws://main:18789", "labels": ["primary"] },
    "dingtalk-worker": { "url": "ws://worker1:18789", "labels": ["dingtalk"] }
  },
  "topology": {
    "type": "tree",
    "root": "main",
    "children": { "main": ["dingtalk-worker"] }
  },
  "routing": {
    "default": "main",
    "rules": [{ "match": { "channel": "dingtalk" }, "target": "dingtalk-worker" }],
    "escalation": { "enabled": true }
  }
}
```

---

## 🖥️ CLI Reference

| Command | Description |
|---------|-------------|
| `clawverse status` | Show hub status |
| `clawverse nodes` | List all nodes |
| `clawverse nodes get <id>` | Get node details |
| `clawverse config` | Show configuration |
| `clawverse send -n <node> -m <msg>` | Send message to node |

---

## 📁 Project Structure

```
clawverse/
├── packages/
│   ├── hub/          # Central control plane
│   └── cli/          # Command-line interface
├── bridges/
│   ├── common/       # Shared utilities
│   ├── dingtalk/     # DingTalk bridge
│   ├── feishu/       # Feishu bridge
│   └── wecom/        # WeCom bridge
└── docs/
```

---

## 📄 License

[Apache License 2.0](./LICENSE)

Copyright © ClawVerse Contributors
