# Feishu Bridge

Connect Feishu (飞书/Lark) to OpenClaw or ClawVerse.

## Quick Start

```bash
export FEISHU_APP_ID=cli_xxx
export FEISHU_APP_SECRET=xxx
export OPENCLAW_API_URL=http://localhost:18789/api/v1/chat

pnpm standalone
```

## Feishu Setup

1. Create app at [Feishu Open Platform](https://open.feishu.cn/)
2. Enable Bot capability
3. Configure Event Subscription URL: `http://your-server:3002/webhook`
4. Add permissions: `im:message:receive`, `im:message:send`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| FEISHU_APP_ID | Yes | App ID |
| FEISHU_APP_SECRET | Yes | App Secret |
| OPENCLAW_API_URL | Yes* | OpenClaw API |
| CLAWVERSE_HUB_URL | Yes* | ClawVerse Hub |
| PORT | No | Server port (default: 3002) |
