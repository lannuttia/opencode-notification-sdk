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
    if (response.data?.parentID) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
