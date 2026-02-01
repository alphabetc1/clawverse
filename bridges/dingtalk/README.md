# DingTalk Bridge

Connect DingTalk (钉钉) to OpenClaw or ClawVerse.

## Modes

### 1. Standalone Server

Run as independent HTTP server:

```bash
# Environment setup
export DINGTALK_OUTGOING_TOKEN=your-token
export OPENCLAW_API_URL=http://localhost:18789/api/v1/chat
# Or for ClawVerse:
export CLAWVERSE_HUB_URL=http://localhost:18800/api/agent
export CLAWVERSE_TOKEN=your-hub-token

# Run
pnpm standalone
```

### 2. OpenClaw Plugin (coming soon)

Install as OpenClaw channel plugin for native integration.

## DingTalk Setup

1. Go to DingTalk Admin Console
2. Create Enterprise Robot
3. Enable "Outgoing Webhook"
4. Set webhook URL to `http://your-server:3001/webhook`
5. Copy the token to `DINGTALK_OUTGOING_TOKEN`

## Commands

- `/new` - Start new conversation
- `/clear` - Clear history
- `/help` - Show help

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DINGTALK_OUTGOING_TOKEN | Yes | DingTalk webhook token |
| OPENCLAW_API_URL | Yes* | OpenClaw API URL |
| CLAWVERSE_HUB_URL | Yes* | ClawVerse Hub URL |
| OPENCLAW_TOKEN | No | API auth token |
| MODEL | No | AI model (default: gpt-4o) |
| PORT | No | Server port (default: 3001) |

*One of OPENCLAW_API_URL or CLAWVERSE_HUB_URL required.
