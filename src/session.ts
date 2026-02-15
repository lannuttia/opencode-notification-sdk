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

export type SubagentMode = "always" | "never" | "separate";

/**
 * Checks whether a session is a child (sub-agent) session by looking
 * for a parentID on the session object.
 *
 * Returns false if the API call fails (treats unknown sessions as root).
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
 * Classifies a session.idle event into a canonical notification event type
 * based on the sub-agent notification mode and whether the session is a child.
 *
 * Returns null if the event should be silently ignored.
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
