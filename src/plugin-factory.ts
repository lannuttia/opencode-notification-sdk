import { basename } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import type { NotificationBackend } from "./types.js";
import { loadConfig } from "./config.js";
import { classifySession } from "./session.js";
import {
  extractSessionIdleMetadata,
  extractSessionErrorMetadata,
  extractPermissionMetadata,
  extractQuestionMetadata,
  buildTemplateVariables,
} from "./events.js";
import { getDefaultTitle, getDefaultMessage } from "./defaults.js";
import { resolveField } from "./templates.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

        // Extract the event type as a plain string so we can handle
        // event types not yet in the @opencode-ai/plugin Event union
        // (like "permission.asked") without TypeScript narrowing to never.
        const eventTypeStr: string = event.type;

        if (eventTypeStr === "permission.asked") {
          const notificationEvent = "permission.requested";

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

      async "tool.execute.before"(toolInput) {
        if (!config.enabled) {
          return;
        }

        if (toolInput.tool !== "question") {
          return;
        }

        const notificationEvent = "question.asked";

        if (!config.events[notificationEvent].enabled) {
          return;
        }

        const metadata = extractQuestionMetadata(
          { sessionID: toolInput.sessionID },
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
      },
    };
  };
}
