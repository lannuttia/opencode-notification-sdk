import { basename } from "node:path";
import { Plugin } from "@opencode/plugin";
import { isRecord } from "./types.js";
import type { NotificationBackend, NotificationEvent, EventMetadata } from "./types.js";
import { loadConfig } from "./config.js";
import type { NotificationSDKConfig } from "./config.js";
import {
  isSubagentSession,
  extractSessionIdleMetadata,
  extractSessionErrorMetadata,
  extractPermissionMetadata,
} from "./events.js";
import type { SessionClient } from "./events.js";

/**
 * The subset of the OpenCode V2 plugin context that this SDK requires.
 *
 * Exported so tests can construct a minimal object that satisfies the
 * contract without depending on or mocking the full `Plugin.Context`.
 */
export interface NotificationPluginContext {
  readonly location: { readonly directory: string };
  readonly event: {
    subscribe(options?: { signal?: AbortSignal }): AsyncIterable<{ type: string; data?: unknown }>;
  };
  readonly session: SessionClient["session"];
}

async function sendNotification(
  backend: NotificationBackend,
  notificationEvent: NotificationEvent,
  metadata: EventMetadata,
): Promise<void> {
  try {
    await backend.send({
      event: notificationEvent,
      metadata,
    });
  } catch {
    // Silently ignore errors from backend.send() --
    // notifications should not crash the host
  }
}

/** Options for the {@link createNotificationPlugin} factory function. */
export interface PluginFactoryOptions {
  /**
   * Key used to determine the config file path. When provided, the config
   * is loaded from `~/.config/opencode/notification-<backendConfigKey>.json`.
   * When omitted, falls back to `~/.config/opencode/notification.json`.
   */
  backendConfigKey?: string;
  /**
   * Override the config instead of loading from file. Used for testing
   * without `vi.mock()`.
   */
  config?: NotificationSDKConfig;
}

/**
 * Create a fully functional OpenCode V2 notification plugin from a backend implementation.
 *
 * This is the main entry point for backend plugin authors. It wires together
 * config loading, event classification, and subagent suppression — then calls
 * `backend.send()` with a {@link NotificationContext} for each notification
 * that passes all filters.
 *
 * Errors thrown by `backend.send()` are caught and silently ignored to ensure
 * notifications never crash the host process.
 *
 * @param backend - The notification backend that implements the delivery transport.
 * @param options - Optional configuration including a `backendConfigKey` for
 *   determining the per-backend config file path.
 * @returns An OpenCode V2 {@link Plugin} ready to be exported as a plugin default export.
 */
export function createNotificationPlugin(
  backend: NotificationBackend,
  options?: PluginFactoryOptions,
): Plugin.Plugin {
  return Plugin.define({
    id: options?.backendConfigKey
      ? `opencode-notification-${options.backendConfigKey}`
      : "opencode-notification",

    setup(ctx: NotificationPluginContext) {
      const config = options?.config ?? loadConfig(options?.backendConfigKey);
      const projectName = basename(ctx.location.directory);

      const client: SessionClient = {
        session: ctx.session,
      };

      const controller = new AbortController();

      void (async () => {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (!config.enabled) {
            continue;
          }

          // Extract the event type as a plain string so we can handle
          // event types not yet in the @opencode/plugin Event union
          // (like "permission.asked") without TypeScript narrowing to never.
          const eventTypeStr: string = event.type;

          if (eventTypeStr === "permission.asked") {
            const notificationEvent = "permission.asked" satisfies NotificationEvent;

            if (!config.events[notificationEvent].enabled) {
              continue;
            }

            // Safely extract properties from the event object since
            // the data shape may not always match what TypeScript expects.
            const data: unknown = "data" in event ? event.data : undefined;
            const sessionID =
              isRecord(data) && typeof data.sessionID === "string"
                ? data.sessionID
                : "";
            const action =
              isRecord(data) && typeof data.action === "string"
                ? data.action
                : "";

            // In V2, resources is an array of strings (replaces V1's pattern field)
            let permissionPatterns: string[] | undefined;
            if (isRecord(data) && Array.isArray(data.resources)) {
              const resources = data.resources;
              if (resources.every((r): r is string => typeof r === "string")) {
                permissionPatterns = resources;
              }
            }

            const permissionProps = {
              sessionID,
              type: action,
              pattern: permissionPatterns,
            };

            const metadata = extractPermissionMetadata(
              permissionProps,
              projectName,
            );

            await sendNotification(backend, notificationEvent, metadata);
            continue;
          }

          if (event.type === "session.execution.succeeded") {
            const notificationEvent = "session.idle" satisfies NotificationEvent;

            if (!config.events[notificationEvent].enabled) {
              continue;
            }

            const sessionID =
              isRecord(event.data) && typeof event.data.sessionID === "string"
                ? event.data.sessionID
                : "";

            // Subagent suppression: check if session has a parentID
            const isSubagent = await isSubagentSession(client, sessionID);
            if (isSubagent) {
              continue;
            }

            const metadata = extractSessionIdleMetadata(
              { sessionID },
              projectName,
            );

            await sendNotification(backend, notificationEvent, metadata);
            continue;
          }

          if (event.type === "session.execution.failed") {
            const notificationEvent = "session.error" satisfies NotificationEvent;

            if (!config.events[notificationEvent].enabled) {
              continue;
            }

            const sessionID =
              isRecord(event.data) && typeof event.data.sessionID === "string"
                ? event.data.sessionID
                : "";
            const error = isRecord(event.data) ? event.data.error : undefined;

            // Subagent suppression: check if session has a parentID
            if (sessionID !== "") {
              const isSubagent = await isSubagentSession(client, sessionID);
              if (isSubagent) {
                continue;
              }
            }

            // In V2, error is a SessionStructuredError with a top-level message field
            const metadata = extractSessionErrorMetadata(
              { sessionID, error },
              projectName,
            );

            await sendNotification(backend, notificationEvent, metadata);
          }
        }
      })();

      return () => controller.abort();
    },
  });
}
