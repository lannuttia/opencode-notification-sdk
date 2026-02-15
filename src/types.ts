export const NOTIFICATION_EVENTS = [
  "session.complete",
  "subagent.complete",
  "session.error",
  "permission.requested",
  "question.asked",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export interface EventMetadata {
  sessionId: string;
  isSubagent: boolean;
  projectName: string;
  timestamp: string;
  error?: string;
  permissionType?: string;
  permissionPatterns?: string[];
}

export interface NotificationContext {
  event: NotificationEvent;
  title: string;
  message: string;
  metadata: EventMetadata;
}

export interface NotificationBackend {
  send(context: NotificationContext): Promise<void>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
