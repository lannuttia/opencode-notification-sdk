import type { NotificationEvent } from "./types.js";

const DEFAULT_TITLES: Record<NotificationEvent, string> = {
  "session.idle": "Agent Idle",
  "session.error": "Agent Error",
  "permission.asked": "Permission Asked",
};

const DEFAULT_MESSAGES: Record<NotificationEvent, string> = {
  "session.idle": "The agent has finished and is waiting for input.",
  "session.error": "An error occurred. Check the session for details.",
  "permission.asked": "The agent needs permission to continue.",
};

/**
 * Get the default notification title for a canonical event type.
 *
 * @param event - The canonical notification event type.
 * @returns The default title string for the given event.
 */
export function getDefaultTitle(event: NotificationEvent): string {
  return DEFAULT_TITLES[event];
}

/**
 * Get the default notification message for a canonical event type.
 *
 * @param event - The canonical notification event type.
 * @returns The default message string for the given event.
 */
export function getDefaultMessage(event: NotificationEvent): string {
  return DEFAULT_MESSAGES[event];
}
