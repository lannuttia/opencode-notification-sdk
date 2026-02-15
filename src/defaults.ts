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

export function getDefaultTitle(event: NotificationEvent): string {
  return DEFAULT_TITLES[event];
}

export function getDefaultMessage(event: NotificationEvent): string {
  return DEFAULT_MESSAGES[event];
}
