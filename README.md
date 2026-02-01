<h1 align="center">ClawVerse</h1>

<p align="center">
  🦞 Multi-Instance OpenClaw Orchestration Platform<br>
  Centralized control plane for managing distributed AI assistants
</p>

<p align="center">
  <a href="./README.zh-CN.md">简体中文</a> | English
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="language">
  <img src="https://img.shields.io/badge/runtime-Node.js%2022%2B-339933" alt="runtime">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🌐 **Node Registry** | Register and monitor multiple OpenClaw instances with health checks |
| 🌳 **Topology Management** | Configure flat (parallel) or tree (hierarchical) relationships |
| 🔀 **Smart Routing** | Route messages based on channel, labels, or custom rules |
| 🔄 **Data Sync** | Synchronize memory, sessions, and skills across nodes |
| ⬆️ **Task Escalation** | Automatically escalate unhandled tasks to parent nodes |
| ⬇️ **Task Delegation** | Delegate tasks from parent to child nodes |
| 💬 **Extended Channels** | DingTalk, Feishu, WeCom bridges beyond OpenClaw's built-in |
| 🖥️ **CLI Tools** | Command-line interface for status, nodes, and configuration |

---

## 🏗️ Architecture

```
                        ┌─────────────────────────────────────────┐
                        │            ClawVerse Hub                │
                        │  ┌───────────────────────────────────┐  │
                        │  │   Registry   │   Topology Config  │  │
                        │  ├───────────────────────────────────┤  │
     DingTalk ──────────┼──│   Router     │    Sync Engine     │  │
     Feishu   ──────────┼──│   Bridge     │                    │  │
     WeCom    ──────────┼──└───────────────────────────────────┘  │
                        └──────────────────┬──────────────────────┘
                                           │
                ┌──────────────────────────┼──────────────────────────┐
                │                          │                          │
                ▼                          ▼                          ▼
          ┌──────────┐              ┌──────────┐              ┌──────────┐
          │ OpenClaw │              │ OpenClaw │              │ OpenClaw │
          │  Node A  │◄────────────►│  Node B  │◄────────────►│  Node C  │
          │  (Main)  │   sync       │ (Worker) │   sync       │ (Worker) │
          └──────────┘              └──────────┘              └──────────┘
               │                         │                         │
               ▼                         ▼                         ▼
          iMessage, CLI             DingTalk               Code Review
          WhatsApp, etc.            Feishu                 Research Tasks
```

---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.0.0
- One or more running [OpenClaw](https://github.com/nicepkg/openclaw) instances

### Step 1: Install ClawVerse

```bash
# Clone repository
git clone https://github.com/nicepkg/clawverse.git
cd clawverse

# Install dependencies
pnpm install

# Build all packages
pnpm build
```

### Step 2: Start OpenClaw Instances

On each machine where you want to run OpenClaw:

```bash
# Install OpenClaw (if not already installed)
npm install -g openclaw

# Start OpenClaw gateway with remote access enabled
openclaw gateway start --port 18789

# Or start with specific config
openclaw gateway start --config ~/.openclaw/config.json
```

### Step 3: Configure ClawVerse

```bash
# Create config directory
mkdir -p ~/.clawverse

# Copy example configuration
cp clawverse.example.json ~/.clawverse/clawverse.json
```

Edit `~/.clawverse/clawverse.json`:

```json
{
  "nodes": {
    "main": {
      "url": "ws://192.168.1.10:18789",
      "token": "your-openclaw-token",
      "labels": ["primary"]
    },
    "worker-1": {
      "url": "ws://192.168.1.11:18789",
      "labels": ["dingtalk", "feishu"]
    }
  },
  "topology": {
    "type": "tree",
    "root": "main",
    "children": {
      "main": ["worker-1"]
    }
  },
  "routing": {
    "default": "main",
    "rules": [
      { "match": { "channel": "dingtalk" }, "target": "worker-1" }
    ]
  }
}
```

### Step 4: Start ClawVerse Hub

```bash
# Development mode (with hot reload)
pnpm dev

# Production mode
pnpm start
```

### Step 5: Verify Setup

```bash
# Check hub status
pnpm clawverse status

# List all nodes
pnpm clawverse nodes
```

---

## 📖 Complete Usage Guide

### Managing Multiple OpenClaw Instances

#### Scenario 1: Personal Multi-Device Setup

You have OpenClaw running on your desktop, laptop, and home server:

```json
{
  "nodes": {
    "desktop": { "url": "ws://192.168.1.10:18789" },
    "laptop": { "url": "ws://192.168.1.20:18789" },
    "server": { "url": "ws://192.168.1.30:18789" }
  },
  "topology": { "type": "flat" },
  "routing": { "default": "desktop" },
  "sync": {
    "enabled": true,
    "scope": { "memory": true, "sessions": true, "skills": true }
  }
}
```

#### Scenario 2: Hierarchical Task Distribution

Main node handles complex tasks, workers handle specific channels:

```json
{
  "nodes": {
    "main": { "url": "ws://main-server:18789", "labels": ["primary"] },
    "dingtalk-worker": { "url": "ws://worker-1:18789", "labels": ["dingtalk"] },
    "research-worker": { "url": "ws://worker-2:18789", "labels": ["research"] }
  },
  "topology": {
    "type": "tree",
    "root": "main",
    "children": { "main": ["dingtalk-worker", "research-worker"] }
  },
  "routing": {
    "default": "main",
    "rules": [
      { "match": { "channel": "dingtalk" }, "target": "dingtalk-worker" },
      { "match": { "label": "research" }, "target": "research-worker" }
    ],
    "escalation": { "enabled": true, "triggers": ["ESCALATE", "NEED_HUMAN"] }
  }
}
```

### Using Channel Bridges

#### DingTalk Bridge

```bash
cd bridges/dingtalk

# Set environment
export DINGTALK_OUTGOING_TOKEN=your-token
export CLAWVERSE_HUB_URL=http://localhost:18800/api/agent

# Run bridge
pnpm standalone
```

#### Feishu Bridge

```bash
cd bridges/feishu

export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export CLAWVERSE_HUB_URL=http://localhost:18800/api/agent

pnpm standalone
```

### CLI Reference

| Command | Description |
|---------|-------------|
| `clawverse status` | Show hub status and node summary |
| `clawverse nodes` | List all registered nodes with status |
| `clawverse nodes get <id>` | Get details for a specific node |
| `clawverse config` | Display current configuration |
| `clawverse send -n <node> -m <msg>` | Send message to a specific node |

---

## 📁 Project Structure

```
clawverse/
├── packages/
│   ├── hub/                 # Central control plane
│   │   └── src/
│   │       ├── registry/    # Node registration & heartbeat
│   │       ├── topology/    # Topology management
│   │       ├── router/      # Message routing
│   │       ├── sync/        # Data synchronization
│   │       └── server/      # HTTP/WebSocket server
│   └── cli/                 # Command-line interface
├── bridges/
│   ├── common/              # Shared utilities
│   ├── dingtalk/            # DingTalk bridge
│   ├── feishu/              # Feishu/Lark bridge
│   └── wecom/               # WeCom bridge
└── docs/                    # Documentation
```

---

## 📄 License

MIT © ClawVerse Contributors
