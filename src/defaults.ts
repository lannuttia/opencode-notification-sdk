import type { NotificationEvent } from "./types.js";

const DEFAULT_TITLES: Record<NotificationEvent, string> = {
  "session.complete": "Agent Idle",
  "subagent.complete": "Sub-agent Complete",
  "session.error": "Agent Error",
  "permission.requested": "Permission Requested",
  "question.asked": "Question Asked",
};

const DEFAULT_MESSAGES: Record<NotificationEvent, string> = {
  "session.complete": "The agent has finished and is waiting for input.",
  "subagent.complete": "A sub-agent has completed its task.",
  "session.error": "An error occurred. Check the session for details.",
  "permission.requested": "The agent needs permission to continue.",
  "question.asked":
    "The agent has a question and is waiting for your answer.",
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
