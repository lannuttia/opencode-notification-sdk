export const NOTIFICATION_EVENTS = [
  "session.complete",
  "subagent.complete",
  "session.error",
  "permission.requested",
  "question.asked",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
