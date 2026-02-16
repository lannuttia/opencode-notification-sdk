import { basename } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import type { PluginInput } from "@opencode-ai/plugin";
import { isRecord } from "./types.js";
import type { NotificationBackend, NotificationEvent, EventMetadata } from "./types.js";
import { loadConfig } from "./config.js";
import type { NotificationSDKConfig } from "./config.js";
import {
  isSubagentSession,
  extractSessionIdleMetadata,
  extractSessionErrorMetadata,
  extractPermissionMetadata,
  buildTemplateVariables,
} from "./events.js";
import type { SessionClient } from "./events.js";
import { getDefaultTitle, getDefaultMessage } from "./defaults.js";
import { resolveField } from "./templates.js";
import { createRateLimiter } from "./rate-limiter.js";
import type { RateLimiter } from "./rate-limiter.js";

async function resolveAndSend(
  backend: NotificationBackend,
  $: PluginInput["$"],
  config: NotificationSDKConfig,
  notificationEvent: NotificationEvent,
  metadata: EventMetadata,
  rateLimiter: RateLimiter | null,
): Promise<void> {
  if (rateLimiter !== null && !rateLimiter.shouldAllow(notificationEvent)) {
    return;
  }

  const templateVars = buildTemplateVariables(notificationEvent, metadata);
  const templateConfig = config.templates?.[notificationEvent] ?? null;

  const title = await resolveField(
    $,
    templateConfig?.titleCmd ?? null,
    templateVars,
    getDefaultTitle(notificationEvent),
  );

  const message = await resolveField(
    $,
    templateConfig?.messageCmd ?? null,
    templateVars,
    getDefaultMessage(notificationEvent),
  );

  try {
    await backend.send({
      event: notificationEvent,
      title,
      message,
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
   * The key under `config.backends` from which to extract backend-specific
   * configuration. When provided, the backend can retrieve its config via
   * {@link getBackendConfig}.
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
 * config loading, event classification, subagent suppression, rate limiting,
 * shell command template resolution, and default notification content — then
 * calls `backend.send()` for each notification that passes all filters.
 *
 * Errors thrown by `backend.send()` are caught and silently ignored to ensure
 * notifications never crash the host process.
 *
 * @param backend - The notification backend that implements the delivery transport.
 * @param options - Optional configuration including a `backendConfigKey` for
 *   extracting backend-specific config from the shared config file.
 * @returns An OpenCode {@link Plugin} function ready to be exported as a plugin.
 */
export function createNotificationPlugin(
  backend: NotificationBackend,
  options?: PluginFactoryOptions,
): Plugin {
  return async (input) => {
    const config = options?.config ?? loadConfig();
    // backendConfigKey is available for future use by backends
    void options?.backendConfigKey;
    const projectName = basename(input.directory);
    const rateLimiter = config.cooldown
      ? createRateLimiter(config.cooldown)
      : null;

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

          await resolveAndSend(
            backend, input.$, config, notificationEvent, metadata, rateLimiter,
          );
          return;
        }

        if (event.type === "session.idle") {
          const sessionID = event.properties.sessionID;

          // Subagent suppression: check if session has a parentID
          const isSubagent = await isSubagentSession(client, sessionID);
          if (isSubagent) {
            return;
          }

          const notificationEvent = "session.idle" satisfies NotificationEvent;

          if (!config.events[notificationEvent].enabled) {
            return;
          }

          const metadata = extractSessionIdleMetadata(
            { sessionID },
            projectName,
          );

          await resolveAndSend(
            backend, input.$, config, notificationEvent, metadata, rateLimiter,
          );
        }

        if (event.type === "session.error") {
          const sessionID = event.properties.sessionID ?? "";

          // Subagent suppression: check if session has a parentID
          if (sessionID !== "") {
            const isSubagent = await isSubagentSession(client, sessionID);
            if (isSubagent) {
              return;
            }
          }

          const notificationEvent = "session.error" satisfies NotificationEvent;

          if (!config.events[notificationEvent].enabled) {
            return;
          }

          const metadata = extractSessionErrorMetadata(
            event.properties,
            projectName,
          );

          await resolveAndSend(
            backend, input.$, config, notificationEvent, metadata, rateLimiter,
          );
        }
      },
    };
  };
}
