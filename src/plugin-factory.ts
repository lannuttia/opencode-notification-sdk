import { basename } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import type { NotificationBackend } from "./types.js";
import { loadConfig } from "./config.js";
import { classifySession } from "./session.js";
import {
  extractSessionIdleMetadata,
  extractSessionErrorMetadata,
  buildTemplateVariables,
} from "./events.js";
import { getDefaultTitle, getDefaultMessage } from "./defaults.js";
import { resolveField } from "./templates.js";

export function createNotificationPlugin(
  backend: NotificationBackend,
): Plugin {
  return async (input) => {
    const config = loadConfig();
    const projectName = basename(input.directory);

    return {
      async event({ event }) {
        if (!config.enabled) {
          return;
        }

        if (event.type === "session.idle") {
          const sessionID = event.properties.sessionID;

          const classifiedEvent = await classifySession(
            input.client,
            sessionID,
            config.subagentNotifications,
          );

          if (classifiedEvent === null) {
            return;
          }

          if (!config.events[classifiedEvent].enabled) {
            return;
          }

          const metadata = extractSessionIdleMetadata(
            { sessionID },
            projectName,
          );

          if (classifiedEvent === "subagent.complete") {
            metadata.isSubagent = true;
          }

          const templateVars = buildTemplateVariables(
            classifiedEvent,
            metadata,
          );

          const templateConfig =
            config.templates?.[classifiedEvent] ?? null;

          const title = await resolveField(
            input.$,
            templateConfig?.titleCmd ?? null,
            templateVars,
            getDefaultTitle(classifiedEvent),
          );

          const message = await resolveField(
            input.$,
            templateConfig?.messageCmd ?? null,
            templateVars,
            getDefaultMessage(classifiedEvent),
          );

          await backend.send({
            event: classifiedEvent,
            title,
            message,
            metadata,
          });
        }

        if (event.type === "session.error") {
          const notificationEvent = "session.error";

          if (!config.events[notificationEvent].enabled) {
            return;
          }

          const metadata = extractSessionErrorMetadata(
            event.properties,
            projectName,
          );

          const templateVars = buildTemplateVariables(
            notificationEvent,
            metadata,
          );

          const templateConfig =
            config.templates?.[notificationEvent] ?? null;

          const title = await resolveField(
            input.$,
            templateConfig?.titleCmd ?? null,
            templateVars,
            getDefaultTitle(notificationEvent),
          );

          const message = await resolveField(
            input.$,
            templateConfig?.messageCmd ?? null,
            templateVars,
            getDefaultMessage(notificationEvent),
          );

          await backend.send({
            event: notificationEvent,
            title,
            message,
            metadata,
          });
        }
      },
    };
  };
}
