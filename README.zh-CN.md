<h1 align="center">ClawVerse</h1>

<p align="center">
  🦞 多实例 OpenClaw 编排平台<br>
  分布式 AI 助手的集中控制面板
</p>

<p align="center">
  简体中文 | <a href="./README.md">English</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Linux%20%7C%20macOS%20%7C%20Windows-blue" alt="platform">
  <img src="https://img.shields.io/badge/language-TypeScript-3178c6" alt="language">
  <img src="https://img.shields.io/badge/runtime-Node.js%2022%2B-339933" alt="runtime">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

---

## ✨ 功能亮点

| 功能 | 说明 |
|------|------|
| 🌐 **节点注册** | 注册并监控多个 OpenClaw 实例，支持健康检查 |
| 🌳 **拓扑管理** | 配置平行（并列）或树形（层级）的节点关系 |
| 🔀 **智能路由** | 根据渠道、标签或自定义规则路由消息 |
| 🔄 **数据同步** | 跨节点同步记忆、会话和技能 |
| ⬆️ **问题升级** | 自动将无法处理的任务升级到父节点 |
| ⬇️ **任务委托** | 从父节点向子节点委托任务 |
| 💬 **扩展渠道** | 支持钉钉、飞书、企业微信等国内渠道 |
| 🖥️ **CLI 工具** | 命令行管理状态、节点和配置 |

---

## 🏗️ 系统架构

```
                        ┌─────────────────────────────────────────┐
                        │           ClawVerse Hub 控制面板         │
                        │  ┌───────────────────────────────────┐  │
                        │  │   节点注册    │    拓扑配置        │  │
                        │  ├───────────────────────────────────┤  │
      钉钉   ───────────┼──│   路由器      │    同步引擎        │  │
      飞书   ───────────┼──│   渠道桥接    │                    │  │
      企业微信 ─────────┼──└───────────────────────────────────┘  │
                        └──────────────────┬──────────────────────┘
                                           │
                ┌──────────────────────────┼──────────────────────────┐
                │                          │                          │
                ▼                          ▼                          ▼
          ┌──────────┐              ┌──────────┐              ┌──────────┐
          │ OpenClaw │              │ OpenClaw │              │ OpenClaw │
          │  节点 A  │◄────────────►│  节点 B  │◄────────────►│  节点 C  │
          │  (主节点) │    同步      │ (工作节点)│    同步      │ (工作节点)|
          └──────────┘              └──────────┘              └──────────┘
               │                         │                         │
               ▼                         ▼                         ▼
          iMessage、CLI             钉钉消息处理             代码审查任务
          WhatsApp 等                飞书消息处理             研究任务
```

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.0.0
- 一个或多个运行中的 [OpenClaw](https://github.com/nicepkg/openclaw) 实例

### 第一步：安装 ClawVerse

```bash
# 克隆仓库
git clone https://github.com/nicepkg/clawverse.git
cd clawverse

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

### 第二步：启动 OpenClaw 实例

在每台需要运行 OpenClaw 的机器上：

```bash
# 安装 OpenClaw（如尚未安装）
npm install -g openclaw

# 启动 OpenClaw Gateway，开启远程访问
openclaw gateway start --port 18789

# 或者使用指定配置启动
openclaw gateway start --config ~/.openclaw/config.json
```

**获取 Token（用于认证）：**

```bash
# 查看当前配置中的 token
openclaw config get gateway.token

# 或者设置新的 token
openclaw config set gateway.token "your-secure-token"
```

### 第三步：配置 ClawVerse

```bash
# 创建配置目录
mkdir -p ~/.clawverse

# 复制示例配置
cp clawverse.example.json ~/.clawverse/clawverse.json
```

编辑 `~/.clawverse/clawverse.json`：

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

### 第四步：启动 ClawVerse Hub

```bash
# 开发模式（支持热重载）
pnpm dev

# 生产模式
pnpm start
```

### 第五步：验证安装

```bash
# 检查 Hub 状态
pnpm clawverse status

# 列出所有节点
pnpm clawverse nodes
```

---

## 📖 完整使用指南

### 场景一：个人多设备同步

你在台式机、笔记本和家庭服务器上都运行了 OpenClaw，希望状态同步：

```json
{
  "nodes": {
    "desktop": { "url": "ws://192.168.1.10:18789", "labels": ["台式机"] },
    "laptop": { "url": "ws://192.168.1.20:18789", "labels": ["笔记本"] },
    "server": { "url": "ws://192.168.1.30:18789", "labels": ["服务器"] }
  },
  "topology": { "type": "flat" },
  "routing": { "default": "desktop" },
  "sync": {
    "enabled": true,
    "interval": 60,
    "scope": {
      "memory": true,
      "sessions": true,
      "skills": true,
      "config": false
    }
  }
}
```

**效果：**
- 在任意设备上的对话记忆会同步到其他设备
- 学习到的技能（skills）自动共享
- 配置文件各设备独立管理

### 场景二：层级任务分发

主节点处理复杂任务，工作节点处理特定渠道：

```json
{
  "nodes": {
    "main": {
      "url": "ws://main-server:18789",
      "labels": ["primary", "complex-tasks"],
      "capabilities": ["browser", "canvas", "exec"]
    },
    "dingtalk-worker": {
      "url": "ws://worker-1:18789",
      "labels": ["dingtalk", "feishu"]
    },
    "research-worker": {
      "url": "ws://worker-2:18789",
      "labels": ["research", "web-search"]
    }
  },
  "topology": {
    "type": "tree",
    "root": "main",
    "children": {
      "main": ["dingtalk-worker", "research-worker"]
    }
  },
  "routing": {
    "default": "main",
    "rules": [
      { "match": { "channel": "dingtalk" }, "target": "dingtalk-worker", "priority": 10 },
      { "match": { "channel": "feishu" }, "target": "dingtalk-worker", "priority": 10 },
      { "match": { "label": "research" }, "target": "research-worker", "priority": 5 }
    ],
    "escalation": {
      "enabled": true,
      "triggers": ["ESCALATE", "UNABLE_TO_HANDLE", "NEED_HUMAN"]
    }
  }
}
```

**工作流程：**
1. 钉钉/飞书消息 → 路由到 `dingtalk-worker`
2. 标记为 `research` 的任务 → 路由到 `research-worker`
3. 工作节点无法处理时 → 自动升级到 `main` 节点
4. 主节点可以向下委托子任务

### 场景三：使用渠道桥接

#### 启动钉钉桥接

```bash
cd bridges/dingtalk

# 配置环境变量
export DINGTALK_OUTGOING_TOKEN=your-dingtalk-token
export CLAWVERSE_HUB_URL=http://localhost:18800/api/agent
export CLAWVERSE_TOKEN=your-hub-token
export MODEL=gpt-4o

# 启动桥接服务
pnpm standalone
```

钉钉配置：
1. 登录钉钉开放平台，创建企业内部机器人
2. 开启"消息接收地址"，设置为 `http://your-server:3001/webhook`
3. 复制 Token 到环境变量

#### 启动飞书桥接

```bash
cd bridges/feishu

export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export CLAWVERSE_HUB_URL=http://localhost:18800/api/agent

pnpm standalone
```

---

## 🖥️ CLI 命令参考

| 命令 | 说明 |
|------|------|
| `clawverse status` | 显示 Hub 状态和节点概览 |
| `clawverse nodes` | 列出所有注册的节点及其状态 |
| `clawverse nodes get <id>` | 获取指定节点的详细信息 |
| `clawverse config` | 显示当前配置 |
| `clawverse send -n <node> -m <msg>` | 向指定节点发送消息 |

---

## 🎨 Logo 设计建议

OpenClaw 的 Logo 是一只**红色龙虾** 🦞，ClawVerse 的 Logo 设计建议：

### 设计理念："爪之宇宙"

**设计元素：**
- **多个龙虾钳** 围绕中心呈环形/轨道排列
- **中心枢纽** 连接所有钳子（代表控制面板）
- **渐变色彩**：从 OpenClaw 的红色渐变到紫色/蓝色（象征扩展）
- **轨道环** 暗示多个实例协同运作

**ASCII 示意：**
```
       🦞
    ╱     ╲
  🦞 ──●── 🦞
    ╲     ╱
       🦞
```

**配色方案：**
- 主色：`#E53935`（OpenClaw 红）
- 辅色：`#7B1FA2`（紫色 - 扩展）
- 点缀：`#1976D2`（蓝色 - 连接）

**标语建议：**
- "一爪统领全局"
- "编排智能，无处不在"
- "你的 AI，处处相连"

---

## 📁 项目结构

```
clawverse/
├── packages/
│   ├── hub/                 # 中心控制面板
│   │   └── src/
│   │       ├── registry/    # 节点注册与心跳
│   │       ├── topology/    # 拓扑管理
│   │       ├── router/      # 消息路由
│   │       ├── sync/        # 数据同步
│   │       └── server/      # HTTP/WebSocket 服务
│   └── cli/                 # 命令行工具
├── bridges/
│   ├── common/              # 共享工具
│   ├── dingtalk/            # 钉钉桥接
│   ├── feishu/              # 飞书桥接
│   └── wecom/               # 企业微信桥接
└── docs/                    # 文档
```

---

## 🔗 相关项目

- [OpenClaw](https://github.com/nicepkg/openclaw) - 个人 AI 助手平台
- [钉钉开放平台](https://open.dingtalk.com/)
- [飞书开放平台](https://open.feishu.cn/)
- [企业微信开放平台](https://developer.work.weixin.qq.com/)

---

## 📄 许可证

MIT © ClawVerse Contributors
