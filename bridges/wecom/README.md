# WeCom Bridge

Connect WeCom (企业微信) to OpenClaw or ClawVerse.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| WECOM_CORP_ID | Yes | Corp ID |
| WECOM_AGENT_ID | Yes | Agent ID |
| WECOM_SECRET | Yes | Agent Secret |
| WECOM_TOKEN | Yes | Callback Token |
| WECOM_ENCODING_AES_KEY | Yes | Callback AES Key |

## Note

WeCom requires message encryption/decryption. Full implementation requires pycryptodome or similar crypto library. See the Python version in the original dingtalk-bridge for reference.
