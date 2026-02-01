import type { BridgeSession, HistoryEntry } from "./types.js";

/**
 * In-memory session store (for plugin mode)
 * Can be replaced with SQLite for standalone mode
 */
export class SessionStore {
  private sessions: Map<string, BridgeSession> = new Map();
  private maxHistory: number;
  private expireMs: number;

  constructor(options: { maxHistoryTurns?: number; expireDays?: number } = {}) {
    this.maxHistory = (options.maxHistoryTurns ?? 10) * 2;
    this.expireMs = (options.expireDays ?? 7) * 24 * 60 * 60 * 1000;
  }

  private makeKey(conversationId: string, userId: string): string {
    return `${conversationId}:${userId}`;
  }

  get(conversationId: string, userId: string): BridgeSession | undefined {
    const key = this.makeKey(conversationId, userId);
    const session = this.sessions.get(key);
    if (session && Date.now() - session.lastActiveAt > this.expireMs) {
      this.sessions.delete(key);
      return undefined;
    }
    return session;
  }

  getOrCreate(conversationId: string, userId: string): BridgeSession {
    let session = this.get(conversationId, userId);
    if (!session) {
      session = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        conversationId,
        userId,
        history: [],
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      this.sessions.set(this.makeKey(conversationId, userId), session);
    }
    return session;
  }

  addHistory(conversationId: string, userId: string, entries: HistoryEntry[]): void {
    const session = this.getOrCreate(conversationId, userId);
    session.history.push(...entries);
    if (session.history.length > this.maxHistory) {
      session.history = session.history.slice(-this.maxHistory);
    }
    session.lastActiveAt = Date.now();
  }

  clearHistory(conversationId: string, userId: string): void {
    const session = this.get(conversationId, userId);
    if (session) {
      session.history = [];
      session.lastActiveAt = Date.now();
    }
  }

  delete(conversationId: string, userId: string): boolean {
    return this.sessions.delete(this.makeKey(conversationId, userId));
  }

  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, session] of this.sessions) {
      if (now - session.lastActiveAt > this.expireMs) {
        this.sessions.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }
}
