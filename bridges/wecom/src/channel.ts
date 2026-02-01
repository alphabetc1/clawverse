import type { ResolvedWeComAccount, WeComAccountConfig } from "./types.js";
import { WeComAccountConfigSchema } from "./types.js";
import { SessionStore, parseCommand, getHelpText, formatError } from "@clawverse/bridge-common";

const DEFAULT_ACCOUNT_ID = "default";
const sessions = new SessionStore({ maxHistoryTurns: 10 });

export const wecomMeta = {
  id: "wecom" as const,
  label: "WeCom",
  selectionLabel: "WeCom (企业微信)",
  blurb: "Connect to WeCom enterprise bot",
  docsPath: "/channels/wecom",
};

export function resolveWeComAccount(params: {
  cfg: { channels?: { wecom?: WeComAccountConfig } };
  accountId?: string | null;
}): ResolvedWeComAccount {
  const config = WeComAccountConfigSchema.parse({
    corpId: process.env.WECOM_CORP_ID || params.cfg.channels?.wecom?.corpId || "",
    agentId: process.env.WECOM_AGENT_ID || params.cfg.channels?.wecom?.agentId || "",
    secret: process.env.WECOM_SECRET || params.cfg.channels?.wecom?.secret || "",
    token: process.env.WECOM_TOKEN || params.cfg.channels?.wecom?.token || "",
    encodingAESKey: process.env.WECOM_ENCODING_AES_KEY || params.cfg.channels?.wecom?.encodingAESKey || "",
  });
  
  return {
    accountId: params.accountId || DEFAULT_ACCOUNT_ID,
    enabled: config.enabled,
    ...config,
    config,
  };
}

export const wecomPlugin = {
  id: "wecom" as const,
  meta: wecomMeta,
  capabilities: { chatTypes: ["direct", "group"] as const },
  config: {
    listAccountIds: () => [DEFAULT_ACCOUNT_ID],
    resolveAccount: resolveWeComAccount,
    isConfigured: (a: ResolvedWeComAccount) => Boolean(a.corpId && a.secret),
  },
};
