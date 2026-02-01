<h1 align="center">ClawVerse</h1>

<p align="center">
  🦞 多实例 OpenClaw 编排平台<br>
  <b>管理、路由、同步你的分布式 AI 助手</b>
</p>

<p align="center">
  简体中文 | <a href="./README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="language">
  <img src="https://img.shields.io/badge/runtime-Node.js%2022%2B-339933" alt="runtime">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue" alt="license">
</p>

---

## 🏗️ 系统架构

ClawVerse 支持**层级化 OpenClaw 集群**，一个 OpenClaw 可以管理多个 OpenClaw，形成可扩展的树形结构：

```
                              ┌─────────────────┐
                              │   ClawVerse     │
                              │      Hub        │
                              │   (控制面板)     │
                              └────────┬────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
    ┌─────────────┐             ┌─────────────┐             ┌─────────────┐
    │  OpenClaw   │             │  OpenClaw   │             │  OpenClaw   │
    │    主节点    │             │    主节点    │             │    主节点    │
    │  (区域 A)   │             │  (区域 B)   │             │  (区域 C)   │
    └──────┬──────┘             └──────┬──────┘             └─────────────┘
           │                           │
     ┌─────┴─────┐               ┌─────┴─────┐
     │           │               │           │
     ▼           ▼               ▼           ▼
┌─────────┐ ┌─────────┐    ┌─────────┐ ┌─────────┐
│OpenClaw │ │OpenClaw │    │OpenClaw │ │OpenClaw │
│ 工作节点 │ │ 工作节点 │    │ 工作节点 │ │ 工作节点 │
│  A-1    │ │  A-2    │    │  B-1    │ │  B-2    │
└────┬────┘ └─────────┘    └─────────┘ └────┬────┘
     │                                      │
     ▼                                      ▼
┌─────────┐                            ┌─────────┐
│OpenClaw │  ← 支持多层嵌套             │OpenClaw │
│  A-1-1  │                            │  B-2-1  │
└─────────┘                            └─────────┘
```

### 集群能力

| 特性 | 说明 |
|------|------|
| **多层级架构** | OpenClaw 管理 OpenClaw，可继续管理更多 OpenClaw |
| **任务委托** | 父节点向子节点分配子任务 |
| **问题升级** | 子节点无法处理时自动升级到父节点 |
| **跨节点同步** | 记忆、会话、技能在集群间同步 |
| **智能路由** | 按渠道、能力、负载或自定义规则路由 |

### 拓扑模式

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **平行 (Flat)** | 所有节点对等 | 多设备同步、负载均衡 |
| **树形 (Tree)** | 层级父子关系 | 任务委托、大规模集群 |

### 通信流向

```
渠道 ──► Hub ──► 主 OpenClaw ──► 工作 OpenClaw ──► 子工作 OpenClaw
             ◄── 问题升级 ◄──────── 问题升级 ◄──────────────┘
```

- **任务委托**：任务沿层级向下流转
- **问题升级**：无法处理的任务向上冒泡到父节点
- **数据同步**：数据在所有连接的节点间双向同步

---

## ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 🌳 **拓扑管理** | 定义 OpenClaw 实例间的平行或层级关系 |
| 🔀 **智能路由** | 根据渠道、标签或自定义规则路由消息 |
| 🔄 **数据同步** | 跨节点同步记忆、会话和技能 |
| ⬆️ **问题升级** | 自动将无法处理的任务升级到父节点 |
| ⬇️ **任务委托** | 从父节点向子节点委托子任务 |
| 🌐 **节点注册** | 注册、监控和健康检查多个实例 |
| 📱 **全渠道支持** | OpenClaw 所有原生渠道 + 钉钉、飞书、企业微信 |

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.0.0
- 目标机器上已安装 [OpenClaw](https://github.com/nicepkg/openclaw)

### 1. 安装 ClawVerse

```bash
git clone https://github.com/nicepkg/clawverse.git
cd clawverse
pnpm install && pnpm build
```

### 2. 启动 OpenClaw Gateway

在每台运行 OpenClaw 的机器上：

```bash
# 配置渠道（与单独使用 OpenClaw 相同）
openclaw channels add imessage   # 或 discord, telegram 等

# 启动 Gateway 供 ClawVerse 连接
openclaw gateway start --port 18789
```

### 3. 配置 ClawVerse

```bash
mkdir -p ~/.clawverse
cp clawverse.example.json ~/.clawverse/clawverse.json
```

编辑 `~/.clawverse/clawverse.json`：

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

### 4. 启动 Hub

```bash
pnpm dev    # 开发模式
pnpm start  # 生产模式
```

### 5. 验证

```bash
pnpm clawverse status  # 检查 Hub 状态
pnpm clawverse nodes   # 列出所有节点
```

---

## 🔌 渠道支持

> **ClawVerse 编排 OpenClaw 实例，不重新实现渠道。**

### 原生渠道（通过 OpenClaw）

在 OpenClaw 节点上使用标准 `openclaw` 命令配置：

```bash
openclaw channels add imessage
openclaw channels add whatsapp
openclaw channels add discord
openclaw channels add telegram
# ... 等等
```

### 扩展渠道（通过 Bridge）

对于 OpenClaw 未原生支持的渠道，使用连接到 Hub HTTP API 的桥接服务：

| 渠道 | Bridge | 端口 | Hub 端点 |
|------|--------|------|----------|
| 🔷 钉钉 | `bridges/dingtalk` | 3001 | `POST /api/agent` |
| 🔶 飞书 | `bridges/feishu` | 3002 | `POST /api/agent` |
| 🟢 企业微信 | `bridges/wecom` | 3003 | `POST /api/agent` |

```bash
cd bridges/dingtalk
export DINGTALK_OUTGOING_TOKEN=xxx
export CLAWVERSE_HUB_URL=http://localhost:18801  # HTTP API 端口
pnpm standalone
```

**HTTP API 端点：**
```
POST /api/agent         # 接收渠道消息，路由到 OpenClaw
GET  /api/health        # 健康检查
GET  /api/status        # Hub 状态及所有节点
GET  /api/nodes         # 列出已注册节点
POST /api/routing/test  # 测试路由规则
```

---

## 📖 使用示例

### 多设备同步（平行拓扑）

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

### 任务分发（树形拓扑）

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

## 🖥️ CLI 命令参考

| 命令 | 说明 |
|------|------|
| `clawverse status` | 显示 Hub 状态 |
| `clawverse nodes` | 列出所有节点 |
| `clawverse nodes get <id>` | 获取节点详情 |
| `clawverse config` | 显示配置 |
| `clawverse send -n <node> -m <msg>` | 向节点发送消息 |

---

## 📁 项目结构

```
clawverse/
├── packages/
│   ├── hub/          # 中心控制面板
│   └── cli/          # 命令行工具
├── bridges/
│   ├── common/       # 共享工具
│   ├── dingtalk/     # 钉钉桥接
│   ├── feishu/       # 飞书桥接
│   └── wecom/        # 企业微信桥接
└── docs/
```

---

## 🎨 Logo 设计理念

OpenClaw: 🦞 红色龙虾 | ClawVerse: 多只龙虾钳围绕中心枢纽

```
       🦞
    ╱     ╲
  🦞 ──●── 🦞
    ╲     ╱
       🦞
```

---

## 📄 开源协议

[Apache License 2.0](./LICENSE)

Copyright © ClawVerse Contributors
