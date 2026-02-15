/**
 * Array of all canonical notification event type strings.
 *
 * Used as the source of truth for the {@link NotificationEvent} union type
 * and for runtime validation of event type values.
 */
export const NOTIFICATION_EVENTS = [
  "session.complete",
  "subagent.complete",
  "session.error",
  "permission.requested",
  "question.asked",
] as const;

/**
 * A canonical notification event type.
 *
 * The SDK classifies raw OpenCode events into one of these canonical types:
 * - `"session.complete"` -- main session finished generating
 * - `"subagent.complete"` -- a sub-agent finished its task
 * - `"session.error"` -- session encountered an error
 * - `"permission.requested"` -- agent needs user permission
 * - `"question.asked"` -- agent is asking the user a question
 */
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];

/**
 * Metadata associated with a notification event.
 *
 * Contains contextual information about the event such as session identity,
 * project name, and event-specific fields like error messages or permission details.
 */
export interface EventMetadata {
  /** The OpenCode session ID. */
  sessionId: string;
  /** Whether this event originated from a sub-agent (child) session. */
  isSubagent: boolean;
  /** The directory basename of the project. */
  projectName: string;
  /** ISO 8601 timestamp of when the event was processed. */
  timestamp: string;
  /** The error message, present only for `session.error` events. */
  error?: string;
  /** The permission type, present only for `permission.requested` events. */
  permissionType?: string;
  /** The permission patterns, present only for `permission.requested` events. */
  permissionPatterns?: string[];
}

/**
 * The notification context passed to a {@link NotificationBackend} when a
 * notification should be delivered.
 *
 * Contains the resolved title, message, canonical event type, and metadata.
 * The title and message are already resolved from shell command templates
 * or default values before being passed to the backend.
 */
export interface NotificationContext {
  /** The canonical notification event type. */
  event: NotificationEvent;
  /** The resolved notification title (from template command or default). */
  title: string;
  /** The resolved notification message (from template command or default). */
  message: string;
  /** Metadata associated with the event. */
  metadata: EventMetadata;
}

/**
 * Interface that notification backend plugins must implement.
 *
 * Backend plugins are responsible only for delivering notifications via their
 * transport (HTTP, desktop notification, Slack, etc.). The SDK handles all
 * decision logic (event classification, filtering, rate limiting, content
 * resolution) before calling {@link NotificationBackend.send}.
 *
 * Errors thrown by `send()` are caught and silently ignored by the SDK to
 * ensure notifications never crash the host process.
 */
export interface NotificationBackend {
  /**
   * Deliver a notification.
   *
   * @param context - The fully resolved notification context including event
   *   type, title, message, and metadata.
   * @returns A promise that resolves when the notification has been sent.
   */
  send(context: NotificationContext): Promise<void>;
}

/**
 * Type guard that checks whether a value is a plain object (Record<string, unknown>).
 *
 * @param value - The value to check.
 * @returns `true` if the value is a non-null, non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
