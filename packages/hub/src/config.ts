import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ClawVerseConfigSchema, type ClawVerseConfig } from "./types/config.js";
import { createLogger } from "./logger.js";

const log = createLogger("config");

const CONFIG_PATHS = [
  "./clawverse.json",
  path.join(os.homedir(), ".clawverse", "clawverse.json"),
  "/etc/clawverse/clawverse.json",
];

export async function loadConfig(configPath?: string): Promise<ClawVerseConfig> {
  const paths = configPath ? [configPath] : CONFIG_PATHS;

  for (const p of paths) {
    try {
      const content = await fs.readFile(p, "utf-8");
      const raw = JSON.parse(content);
      const config = ClawVerseConfigSchema.parse(raw);
      log.info(`Loaded config from ${p}`);
      return config;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        log.warn(`Failed to load config from ${p}:`, err);
      }
    }
  }

  // Return default config if no config file found
  log.warn("No config file found, using defaults");
  return ClawVerseConfigSchema.parse({
    nodes: {},
    routing: { default: "" },
  });
}

export async function saveConfig(config: ClawVerseConfig, configPath?: string): Promise<void> {
  const p = configPath || path.join(os.homedir(), ".clawverse", "clawverse.json");

  // Ensure directory exists
  await fs.mkdir(path.dirname(p), { recursive: true });

  // Validate before saving
  const validated = ClawVerseConfigSchema.parse(config);

  await fs.writeFile(p, JSON.stringify(validated, null, 2), "utf-8");
  log.info(`Saved config to ${p}`);
}
