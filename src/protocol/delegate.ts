/**
 * Delegate protocol handlers for task delegation
 */

import type { Transport } from "../transport/types.js";
import type { DelegatePayload, DelegateResponse } from "./messages.js";

export interface DelegateOptions {
  /** Timeout in milliseconds */
  timeoutMs?: number;
  /** Wait for response */
  wait?: boolean;
}

const DEFAULT_TIMEOUT_MS = 60000; // 1 minute

/**
 * Delegate a task to a remote node
 */
export async function delegateTask(
  transport: Transport,
  payload: DelegatePayload,
  options: DelegateOptions = {}
): Promise<DelegateResponse> {
  const timeoutMs = options.timeoutMs ?? payload.timeout ?? DEFAULT_TIMEOUT_MS;
  const wait = options.wait ?? true;

  try {
    const startTime = Date.now();

    // Send agent message to the gateway
    const response = await transport.call<{
      runId?: string;
      result?: string;
      error?: string;
    }>("agent", {
      message: payload.task,
      sessionKey: payload.sessionKey ?? "main",
      context: payload.context,
      thinkingLevel: payload.thinkingLevel,
      wait,
      timeoutMs,
    });

    if (response.error) {
      return {
        success: false,
        error: response.error.message,
      };
    }

    const duration = Date.now() - startTime;

    return {
      success: true,
      response: response.result?.result,
      runId: response.result?.runId,
      duration,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Delegate a task and wait for completion
 */
export async function delegateAndWait(
  transport: Transport,
  task: string,
  options: {
    sessionKey?: string;
    context?: string;
    thinkingLevel?: string;
    timeoutMs?: number;
  } = {}
): Promise<DelegateResponse> {
  return delegateTask(
    transport,
    {
      task,
      sessionKey: options.sessionKey,
      context: options.context,
      thinkingLevel: options.thinkingLevel,
      timeout: options.timeoutMs,
    },
    { wait: true, timeoutMs: options.timeoutMs }
  );
}

/**
 * Fire and forget task delegation
 */
export async function delegateAsync(
  transport: Transport,
  task: string,
  options: {
    sessionKey?: string;
    context?: string;
    thinkingLevel?: string;
  } = {}
): Promise<DelegateResponse> {
  return delegateTask(
    transport,
    {
      task,
      sessionKey: options.sessionKey,
      context: options.context,
      thinkingLevel: options.thinkingLevel,
    },
    { wait: false }
  );
}

/**
 * Check if a delegated task is complete
 */
export async function checkDelegateStatus(
  transport: Transport,
  runId: string
): Promise<{
  complete: boolean;
  result?: string;
  error?: string;
}> {
  try {
    const response = await transport.call<{
      status?: string;
      result?: string;
      error?: string;
    }>("agent.status", { runId });

    if (response.error) {
      return { complete: false, error: response.error.message };
    }

    const isComplete = response.result?.status === "complete" || 
                       response.result?.status === "error";

    return {
      complete: isComplete,
      result: response.result?.result,
      error: response.result?.error,
    };
  } catch (err) {
    return {
      complete: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
