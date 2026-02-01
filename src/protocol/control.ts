/**
 * Control protocol handlers for managing remote nodes
 */

import type { Transport } from "../transport/types.js";
import type { ControlPayload, ControlResponse } from "./messages.js";

/**
 * Execute a control action on a remote node
 */
export async function executeControl(
  transport: Transport,
  payload: ControlPayload
): Promise<ControlResponse> {
  const { action, params } = payload;

  try {
    switch (action) {
      case "status": {
        const response = await transport.call("health");
        return {
          success: !response.error,
          data: response.result,
          error: response.error?.message,
        };
      }

      case "restart": {
        const response = await transport.call("gateway.restart", params);
        return {
          success: !response.error,
          data: response.result,
          error: response.error?.message,
        };
      }

      case "stop": {
        const response = await transport.call("gateway.stop", params);
        return {
          success: !response.error,
          data: response.result,
          error: response.error?.message,
        };
      }

      case "config_update": {
        const response = await transport.call("config.update", params);
        return {
          success: !response.error,
          data: response.result,
          error: response.error?.message,
        };
      }

      case "health": {
        const response = await transport.call("health");
        return {
          success: !response.error,
          data: response.result,
          error: response.error?.message,
        };
      }

      default:
        return {
          success: false,
          error: `Unknown control action: ${action}`,
        };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get status of a remote node
 */
export async function getNodeStatus(transport: Transport): Promise<ControlResponse> {
  return executeControl(transport, { action: "status" });
}

/**
 * Restart a remote node's gateway
 */
export async function restartNode(transport: Transport): Promise<ControlResponse> {
  return executeControl(transport, { action: "restart" });
}

/**
 * Request a remote node to stop
 */
export async function stopNode(transport: Transport): Promise<ControlResponse> {
  return executeControl(transport, { action: "stop" });
}

/**
 * Update configuration on a remote node
 */
export async function updateNodeConfig(
  transport: Transport,
  config: Record<string, unknown>
): Promise<ControlResponse> {
  return executeControl(transport, { action: "config_update", params: config });
}
