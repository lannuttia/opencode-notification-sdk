import { basename } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
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
 * Create a fully functional OpenCode notification plugin from a backend implementation.
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
 * @returns An OpenCode {@link Plugin} function ready to be exported as a plugin.
 */
export function createNotificationPlugin(
  backend: NotificationBackend,
  options?: PluginFactoryOptions,
): Plugin {
  return async (input) => {
    const config = options?.config ?? loadConfig(options?.backendConfigKey);
    const projectName = basename(input.directory);

    // Extract the client's session API. We use our own SessionClient interface
    // to keep the mock surface small in tests.
    const client: SessionClient = {
      session: {
        get: (opts) => input.client.session.get(opts),
      },
    };

    return {
      async event({ event }) {
        if (!config.enabled) {
          return;
        }

        // Extract the event type as a plain string so we can handle
        // event types not yet in the @opencode-ai/plugin Event union
        // (like "permission.asked") without TypeScript narrowing to never.
        const eventTypeStr: string = event.type;

        if (eventTypeStr === "permission.asked") {
          const notificationEvent = "permission.asked" satisfies NotificationEvent;

          if (!config.events[notificationEvent].enabled) {
            return;
          }

          // Safely extract properties from the event object since
          // permission.asked is not in the typed Event union
          const props: unknown = "properties" in event ? event.properties : undefined;
          const sessionID =
            isRecord(props) && typeof props.sessionID === "string"
              ? props.sessionID
              : "";
          const permType =
            isRecord(props) && typeof props.type === "string"
              ? props.type
              : "";

          let pattern: string | string[] | undefined;
          if (isRecord(props)) {
            if (typeof props.pattern === "string") {
              pattern = props.pattern;
            } else if (
              Array.isArray(props.pattern) &&
              props.pattern.every(
                (p): p is string => typeof p === "string",
              )
            ) {
              pattern = props.pattern;
            }
          }

          const permissionProps = {
            sessionID,
            type: permType,
            pattern,
          };

          const metadata = extractPermissionMetadata(
            permissionProps,
            projectName,
          );

          await sendNotification(
            backend, notificationEvent, metadata,
          );
          return;
        }

        if (event.type === "session.idle") {
          const notificationEvent = "session.idle" satisfies NotificationEvent;

          if (!config.events[notificationEvent].enabled) {
            return;
          }

          const sessionID = event.properties.sessionID;

          // Subagent suppression: check if session has a parentID
          const isSubagent = await isSubagentSession(client, sessionID);
          if (isSubagent) {
            return;
          }

          const metadata = extractSessionIdleMetadata(
            { sessionID },
            projectName,
          );

          await sendNotification(
            backend, notificationEvent, metadata,
          );
        }

        if (event.type === "session.error") {
          const notificationEvent = "session.error" satisfies NotificationEvent;

          if (!config.events[notificationEvent].enabled) {
            return;
          }

          const sessionID = event.properties.sessionID ?? "";

          // Subagent suppression: check if session has a parentID
          if (sessionID !== "") {
            const isSubagent = await isSubagentSession(client, sessionID);
            if (isSubagent) {
              return;
            }
          }

          const metadata = extractSessionErrorMetadata(
            event.properties,
            projectName,
          );

          await sendNotification(
            backend, notificationEvent, metadata,
          );
        }
      },
    };
  };
}
