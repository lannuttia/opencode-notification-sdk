import type { EventMetadata, NotificationEvent } from "./types.js";

/**
 * Minimal interface for the OpenCode V2 plugin context's session API.
 * Only the methods the SDK needs are specified, keeping the mock surface small.
 */
export interface SessionClient {
  session: {
    get(options: {
      sessionID: string;
    }): Promise<{
      parentID?: string | null;
    }>;
  };
}

/**
 * Checks whether a session is a subagent (child) session by looking
 * for a `parentID` on the session object via `ctx.session.get()`.
 *
 * If the session lookup fails (e.g., network error, missing session),
 * returns `false` so the notification is sent anyway (fail-open behavior).
 *
 * @param client - The OpenCode plugin context with a session API.
 * @param sessionId - The session ID to check.
 * @returns `true` if the session has a parent (is a subagent), `false` otherwise.
 */
export async function isSubagentSession(
  client: SessionClient,
  sessionId: string,
): Promise<boolean> {
  try {
    const response = await client.session.get({ sessionID: sessionId });
    return Boolean(response.parentID);
  } catch {
    return false;
  }
}

function createBaseMetadata(
  sessionID: string,
  projectName: string,
): EventMetadata {
  return {
    sessionId: sessionID,
    projectName,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Extract event metadata from a `session.idle` event's properties.
 *
 * @param properties - The event properties containing the session ID.
 * @param projectName - The project directory basename.
 * @returns The constructed {@link EventMetadata} for the idle event.
 */
export function extractSessionIdleMetadata(
  properties: { sessionID: string },
  projectName: string,
): EventMetadata {
  return createBaseMetadata(properties.sessionID, projectName);
}

/**
 * Checks whether a value has a top-level `message` string property.
 * Matches the V2 `SessionStructuredError` shape: `{ type: string, message: string }`.
 */
function hasDirectMessage(value: unknown): value is { message: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
  );
}

/**
 * Extract event metadata from a `session.execution.failed` (session error) event's data.
 *
 * If the error object contains a `message` string (V2 `SessionStructuredError` shape),
 * it is included in the metadata's `error` field.
 *
 * @param properties - The event data, optionally containing session ID and error info.
 * @param projectName - The project directory basename.
 * @returns The constructed {@link EventMetadata} for the error event.
 */
export function extractSessionErrorMetadata(
  properties: { sessionID?: string; error?: unknown },
  projectName: string,
): EventMetadata {
  const metadata = createBaseMetadata(properties.sessionID ?? "", projectName);

  if (hasDirectMessage(properties.error)) {
    metadata.error = properties.error.message;
  }

  return metadata;
}

/**
 * Extract event metadata from a `permission.asked` event's properties.
 *
 * Populates the `permissionType` and `permissionPatterns` fields on the
 * returned metadata.
 *
 * @param properties - The event properties containing session ID, permission type, and optional patterns.
 * @param projectName - The project directory basename.
 * @returns The constructed {@link EventMetadata} for the permission event.
 */
export function extractPermissionMetadata(
  properties: {
    sessionID: string;
    type: string;
    pattern?: string | string[];
  },
  projectName: string,
): EventMetadata {
  const metadata = createBaseMetadata(properties.sessionID, projectName);
  metadata.permissionType = properties.type;

  if (properties.pattern !== undefined) {
    metadata.permissionPatterns = Array.isArray(properties.pattern)
      ? properties.pattern
      : [properties.pattern];
  }

  return metadata;
}

/**
 * Build a template variables record for shell command substitution.
 *
 * Creates a flat `Record<string, string>` mapping variable names to their
 * values, suitable for `{var_name}` substitution in shell command templates.
 *
 * @param event - The canonical notification event type.
 * @param metadata - The event metadata from which to extract variable values.
 * @returns A record of template variable names to string values.
 */
export function buildTemplateVariables(
  event: NotificationEvent,
  metadata: EventMetadata,
): Record<string, string> {
  return {
    event,
    time: metadata.timestamp,
    project: metadata.projectName,
    session_id: metadata.sessionId,
    error: metadata.error ?? "",
    permission_type: metadata.permissionType ?? "",
    permission_patterns: metadata.permissionPatterns?.join(",") ?? "",
  };
}
