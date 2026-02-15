/**
 * Minimal interface for the OpenCode client's session API.
 * Only the methods the SDK needs are specified, keeping the mock surface small.
 */
export interface SessionClient {
  session: {
    get(options: {
      path: { id: string };
    }): Promise<{
      data:
        | {
            parentID?: string;
          }
        | undefined;
    }>;
  };
}

/**
 * The sub-agent notification mode, controlling how `session.idle` events
 * from child sessions are handled:
 * - `"always"` — notify for all sessions as `session.complete`
 * - `"never"` — only notify for root sessions
 * - `"separate"` — fire `session.complete` for root and `subagent.complete` for child
 */
export type SubagentMode = "always" | "never" | "separate";

/**
 * Checks whether a session is a child (sub-agent) session by looking
 * for a `parentID` on the session object.
 *
 * @param client - The OpenCode client with a session API.
 * @param sessionId - The session ID to check.
 * @returns `true` if the session has a parent (is a sub-agent), `false` otherwise.
 *   Returns `false` if the API call fails (treats unknown sessions as root).
 */
export async function isChildSession(
  client: SessionClient,
  sessionId: string,
): Promise<boolean> {
  try {
    const response = await client.session.get({ path: { id: sessionId } });
    return Boolean(response.data?.parentID);
  } catch {
    return false;
  }
}

/**
 * Classify a `session.idle` event into a canonical notification event type
 * based on the sub-agent notification mode and whether the session is a child.
 *
 * @param client - The OpenCode client with a session API.
 * @param sessionId - The session ID to classify.
 * @param subagentMode - The configured sub-agent notification mode.
 * @returns The canonical event type (`"session.complete"` or `"subagent.complete"`),
 *   or `null` if the event should be silently ignored.
 */
export async function classifySession(
  client: SessionClient,
  sessionId: string,
  subagentMode: SubagentMode,
): Promise<"session.complete" | "subagent.complete" | null> {
  if (subagentMode === "always") {
    return "session.complete";
  }

  const isChild = await isChildSession(client, sessionId);

  if (subagentMode === "never") {
    return isChild ? null : "session.complete";
  }

  // subagentMode === "separate"
  return isChild ? "subagent.complete" : "session.complete";
}
