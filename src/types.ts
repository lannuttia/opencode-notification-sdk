export const NOTIFICATION_EVENTS = [
  "session.complete",
  "subagent.complete",
  "session.error",
  "permission.requested",
  "question.asked",
] as const;

export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

export const EVENT_METADATA_REQUIRED_KEYS = [
  "sessionId",
  "isSubagent",
  "projectName",
  "timestamp",
] as const;

export const EVENT_METADATA_OPTIONAL_KEYS = [
  "error",
  "permissionType",
  "permissionPatterns",
] as const;

export interface EventMetadata {
  sessionId: string;
  isSubagent: boolean;
  projectName: string;
  timestamp: string;
  error?: string;
  permissionType?: string;
  permissionPatterns?: string[];
}

export const NOTIFICATION_CONTEXT_KEYS = [
  "event",
  "title",
  "message",
  "metadata",
] as const;

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
