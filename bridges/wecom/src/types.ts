import { z } from "zod";

export const WeComAccountConfigSchema = z.object({
  enabled: z.boolean().default(true),
  corpId: z.string(),
  agentId: z.string(),
  secret: z.string(),
  token: z.string(),
  encodingAESKey: z.string(),
});

export type WeComAccountConfig = z.infer<typeof WeComAccountConfigSchema>;

export interface ResolvedWeComAccount {
  accountId: string;
  enabled: boolean;
  corpId: string;
  agentId: string;
  secret: string;
  token: string;
  encodingAESKey: string;
  config: WeComAccountConfig;
}
