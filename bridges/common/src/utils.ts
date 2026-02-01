/**
 * Split long text into chunks for platforms with message length limits
 */
export function splitMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text];
  
  const chunks: string[] = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    // Try to split at paragraph
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt < maxLength * 0.3) {
      // Try single newline
      splitAt = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      // Try sentence end
      const sentenceEnd = remaining.slice(0, maxLength).match(/[.!?。！？]\s*/g);
      if (sentenceEnd && sentenceEnd.length > 0) {
        splitAt = remaining.lastIndexOf(sentenceEnd[sentenceEnd.length - 1], maxLength);
        if (splitAt >= 0) splitAt += sentenceEnd[sentenceEnd.length - 1].length;
      }
    }
    if (splitAt < maxLength * 0.3) {
      // Force split at space
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt < maxLength * 0.3) {
      // Force split at max length
      splitAt = maxLength;
    }
    
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  
  return chunks;
}

/**
 * Parse command from message text
 * Returns { command, args } or null if not a command
 */
export function parseCommand(text: string): { command: string; args: string[] } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return null;
  
  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  if (!command) return null;
  
  return { command, args: parts.slice(1) };
}

/**
 * Generate help text for common commands
 */
export function getHelpText(channelName: string): string {
  return `📚 ${channelName} Bridge Commands:

/new [name] - Start new conversation
/clear - Clear current conversation history
/list - List recent conversations
/help - Show this help

Send any message to chat with AI.`;
}

/**
 * Format error message for user
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `⚠️ Error: ${error.message}`;
  }
  return `⚠️ An unexpected error occurred`;
}

/**
 * Escape special characters for markdown
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([*_`\[\]()~>#+=|{}.!-])/g, "\\$1");
}

/**
 * Convert markdown to plain text
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/^[-*]\s+/gm, "• ");
}
