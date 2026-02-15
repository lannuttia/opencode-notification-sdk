# opencode-notification-sdk

You are building a TypeScript SDK that provides a standard notification decision engine for OpenCode plugins.

## Goal

Build a TypeScript library (`opencode-notification-sdk`) that handles all notification decision logic -- event classification, session filtering, rate limiting, and shell command templates -- so that notification backend plugins (ntfy.sh, desktop notifications, Slack, etc.) only need to implement a simple `send()` method.

## Instructions

1. Read the PLAN.md to understand the current state of implementation.
2. If all items in PLAN.md are complete and match this prompt's specifications, output exactly `<promise>Done</promise>` and stop. Do not make any changes.
3. Pick the SINGLE highest priority incomplete item from PLAN.md and implement it.
4. Ensure tests pass after your changes.
5. Update PLAN.md with your progress and commit all changes with `git add -A && git commit -m "..."`.

If there is a discrepancy between PLAN.md and this prompt, always update PLAN.md to match this prompt.

### Code Quality Rules

- **No type casting.** Never use `as`, `as any`, `as unknown`, or similar type assertions. If the types don't align, fix the type definitions or use type guards, generics, or proper type narrowing instead. This is enforced by ESLint via the `@typescript-eslint/consistent-type-assertions` rule with `assertionStyle: "never"`.
- **Prefer constants.** Use `const` variables instead of `let` wherever the value is not reassigned. For object literals, arrays, and other compound values that should be deeply immutable, use `as const` assertions (const assertions) to narrow types to their literal values. This improves type safety, communicates intent, and prevents accidental mutation.
- **Linting is required.** All source and test code must pass `npm run lint` before committing. The linter uses ESLint with typescript-eslint and is configured in `eslint.config.js`.

## Specifications

### Overview

The SDK is a standalone npm package that backend notification plugins depend on. It handles:

1. **Event classification** -- mapping raw OpenCode plugin events to canonical notification event types
2. **Session filtering** -- distinguishing root sessions from sub-agent sessions
3. **Rate limiting** -- configurable per-event cooldown with leading/trailing edge
4. **Shell command templates** -- customizable notification fields via shell commands with `{var}` substitution
5. **Default notification content** -- sensible defaults for titles, messages, and metadata per event type
6. **Plugin factory** -- a `createNotificationPlugin()` function that wires everything together and returns OpenCode `Hooks`

Backend plugins implement a single `NotificationBackend` interface and call `createNotificationPlugin()` to get a fully functional plugin.

### Canonical Event Types

The SDK defines the following canonical notification event types, derived from the superset of events across existing notification plugins:

| Canonical Event | OpenCode Trigger | Description |
|---|---|---|
| `session.complete` | `session.idle` event where the session has no `parentID` | Main session finished generating |
| `subagent.complete` | `session.idle` event where the session has a `parentID` | A sub-agent finished its task |
| `session.error` | `session.error` event | Session encountered an error |
| `permission.requested` | `permission.asked` event (via the `event` hook, not `permission.ask` hook) | Agent needs user permission |
| `question.asked` | `tool.execute.before` hook where `input.tool === "question"` | Agent is asking the user a question via the question tool |

These are defined as a TypeScript string literal union type `NotificationEvent`.

### Event Classification (`src/events.ts`)

The SDK must classify raw OpenCode events into canonical `NotificationEvent` values. This module:

1. Receives raw OpenCode events from the `event` hook and `tool.execute.before` hook
2. For `session.idle` events: uses the OpenCode `client.session.get()` API to check whether the session has a `parentID`, then emits either `session.complete` or `subagent.complete`
3. For `session.error` events: emits `session.error`
4. For `permission.asked` events (note: this event type string is not yet in the `@opencode-ai/plugin` SDK's `Event` union, so it must be handled via string comparison on `event.type`): emits `permission.requested`
5. For `tool.execute.before` where `input.tool === "question"`: emits `question.asked`
6. Extracts event metadata (error messages, permission types, patterns, session IDs, timestamps)

### Session Filtering (`src/session.ts`)

The SDK must support configurable sub-agent notification behavior via a `subagentNotifications` config option:

- `"always"` -- notify for all `session.idle` events regardless of parent/child status; all are classified as `session.complete`
- `"never"` -- only notify for root sessions (no `parentID`); silently ignore sub-agent idle events entirely
- `"separate"` (default) -- fire `session.complete` for root sessions and `subagent.complete` for child sessions; each can be independently enabled/disabled in the events config

Session parent/child detection is done by calling `client.session.get({ path: { id: sessionID } })` and checking for `response.data.parentID`. The SDK must handle API failures gracefully (treat as root session on error).

### Rate Limiting (`src/rate-limiter.ts`)

The SDK must provide configurable per-event-type rate limiting:

- Cooldown duration specified as an ISO 8601 duration string (e.g., `PT30S`, `PT5M`). Parsed using a small third-party ISO 8601 duration library (e.g., `iso8601-duration`).
- Cooldown edge: `"leading"` (throttle -- first event fires immediately, subsequent suppressed) or `"trailing"` (debounce -- fires after quiet period). Uses a small third-party throttle/debounce library (e.g., `throttle-debounce`).
- Rate limiting is tracked per canonical event type (e.g., `session.complete` and `session.error` have independent cooldown timers).
- When cooldown is not configured, no rate limiting is applied.
- A cooldown of `PT0S` (zero seconds) disables rate limiting.

This module exposes:

- `parseISO8601Duration(duration: string): number` -- parses an ISO 8601 duration string and returns milliseconds
- `createRateLimiter(options: RateLimiterOptions): RateLimiter` -- creates a stateful rate limiter
- `RateLimiter.shouldAllow(eventType: string): boolean` -- returns whether a notification should be sent

### Configuration (`src/config.ts`)

Configuration is loaded from a JSON config file at `~/.config/opencode/notification.json`. The SDK must:

1. Read and parse the config file on plugin initialization
2. Validate the config against the expected schema
3. Provide defaults for all optional fields
4. Expose a `getBackendConfig<T>(config, backendName)` function that extracts a backend-specific config section

#### Config File Schema

```json
{
  "enabled": true,
  "subagentNotifications": "separate",
  "cooldown": {
    "duration": "PT30S",
    "edge": "leading"
  },
  "events": {
    "session.complete": { "enabled": true },
    "subagent.complete": { "enabled": false },
    "session.error": { "enabled": true },
    "permission.requested": { "enabled": true },
    "question.asked": { "enabled": true }
  },
  "templates": {
    "session.complete": {
      "titleCmd": null,
      "messageCmd": null
    }
  },
  "backends": {
    "ntfy": {
      "topic": "my-topic",
      "server": "https://ntfy.sh"
    },
    "desktop": {
      "sound": true
    }
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Global kill switch for all notifications |
| `subagentNotifications` | `"always" \| "never" \| "separate"` | `"separate"` | How to handle sub-agent session.idle events |
| `cooldown` | `object \| null` | `null` | Rate limiting configuration |
| `cooldown.duration` | `string` | (required if cooldown set) | ISO 8601 duration string |
| `cooldown.edge` | `"leading" \| "trailing"` | `"leading"` | Which edge of the cooldown window triggers |
| `events` | `object` | (all enabled) | Per-event enable/disable toggles |
| `events.<type>.enabled` | `boolean` | `true` | Whether this event type triggers notifications |
| `templates` | `object \| null` | `null` | Per-event shell command templates |
| `templates.<type>.titleCmd` | `string \| null` | `null` | Shell command to generate notification title |
| `templates.<type>.messageCmd` | `string \| null` | `null` | Shell command to generate notification message |
| `backends` | `object` | `{}` | Backend-specific configuration sections |

When the config file does not exist, all defaults are used (everything enabled, no cooldown, no templates).

### Default Notification Content (`src/defaults.ts`)

The SDK provides default titles and messages for each canonical event type. These are used when no shell command template is configured for the field.

| Event | Default Title | Default Message |
|---|---|---|
| `session.complete` | `"Agent Idle"` | `"The agent has finished and is waiting for input."` |
| `subagent.complete` | `"Sub-agent Complete"` | `"A sub-agent has completed its task."` |
| `session.error` | `"Agent Error"` | `"An error occurred. Check the session for details."` |
| `permission.requested` | `"Permission Requested"` | `"The agent needs permission to continue."` |
| `question.asked` | `"Question Asked"` | `"The agent has a question and is waiting for your answer."` |

### Shell Command Templates (`src/templates.ts`)

Notification fields (title, message) can be customized per event type via shell commands. This module:

1. Takes the Bun `$` shell (from `PluginInput`), a command template string (or `null`/`undefined`), a variables record, and a fallback default value
2. If the command template is `null`/`undefined`, returns the fallback
3. Substitutes all `{var_name}` placeholders in the command with values from the variables record. Unset variables are substituted with empty strings
4. Executes the substituted command via the Bun `$` shell, capturing stdout
5. Returns the trimmed stdout if the command succeeds (exit code 0 and non-empty output)
6. Returns the fallback value if the command fails (non-zero exit, exception, empty output)

#### Template Variables

| Variable | Available In | Description |
|---|---|---|
| `{event}` | All events | The canonical event type string (e.g., `session.complete`) |
| `{time}` | All events | ISO 8601 timestamp |
| `{project}` | All events | Project directory name (basename) |
| `{error}` | `session.error` only | The error message (empty string for other events) |
| `{permission_type}` | `permission.requested` only | The permission type (empty string for other events) |
| `{permission_patterns}` | `permission.requested` only | Comma-separated list of patterns (empty string for other events) |
| `{session_id}` | All events | The session ID (empty string if unavailable) |

### Notification Context (`src/types.ts`)

When a notification passes all filters (enabled, event config, rate limiter), the SDK produces a `NotificationContext` object and passes it to the backend:

```typescript
interface NotificationContext {
  event: NotificationEvent;
  title: string;
  message: string;
  metadata: EventMetadata;
}

interface EventMetadata {
  sessionId: string;
  isSubagent: boolean;
  projectName: string;
  timestamp: string;
  error?: string;
  permissionType?: string;
  permissionPatterns?: string[];
}
```

The `title` and `message` fields are resolved from shell command templates (if configured) or defaults.

### Backend Interface (`src/types.ts`)

Backend plugins implement this interface:

```typescript
interface NotificationBackend {
  send(context: NotificationContext): Promise<void>;
}
```

The SDK calls `backend.send()` after all filtering and content resolution. The backend is responsible only for delivering the notification via its transport (HTTP, desktop notification, etc.). Errors thrown by `send()` are caught and silently ignored by the SDK (notifications should not crash the host).

### Plugin Factory (`src/plugin-factory.ts`)

The main entry point for backend plugins:

```typescript
function createNotificationPlugin(
  backend: NotificationBackend,
  options?: { backendConfigKey?: string }
): Plugin;
```

This function:

1. Returns an OpenCode `Plugin` function (matching the `@opencode-ai/plugin` `Plugin` type)
2. When invoked by OpenCode, loads the config file, initializes the rate limiter, and returns `Hooks`
3. The returned `Hooks` include:
   - `event` handler -- classifies `session.idle`, `session.error`, and `permission.asked` events
   - `tool.execute.before` handler -- detects question tool invocations
4. For each classified event:
   - Checks `config.enabled` (global kill switch)
   - Checks `config.events[eventType].enabled` (per-event toggle)
   - Checks rate limiter (`rateLimiter.shouldAllow(eventType)`)
   - Resolves title and message via shell command templates or defaults
   - Calls `backend.send(context)`
   - Catches and ignores errors from `backend.send()`
5. If `options.backendConfigKey` is provided, the backend's config section is extracted from `config.backends[backendConfigKey]` and made available (the SDK does not interpret it; it's passed through for the backend to use)

### Public API (`src/index.ts`)

The SDK exports the following from `src/index.ts`:

- `createNotificationPlugin` -- the plugin factory function
- `NotificationBackend` -- the backend interface type
- `NotificationContext` -- the context object type
- `NotificationEvent` -- the canonical event type union
- `EventMetadata` -- the event metadata type
- `NotificationSDKConfig` -- the full config type
- `loadConfig` -- the config loading function (for backends that need the config)
- `getBackendConfig` -- the backend config extraction function
- `parseISO8601Duration` -- exposed for backends that need duration parsing
- `RateLimiter` -- the rate limiter interface type
- `RateLimiterOptions` -- the rate limiter options type

### Tech Stack

- TypeScript with strict mode
- ESLint with typescript-eslint for linting
- Vitest for testing
- Small third-party runtime dependencies:
  - A small library for parsing ISO 8601 duration strings (e.g., `iso8601-duration`)
  - A small library for debouncing/throttling (e.g., `throttle-debounce`)
- `@opencode-ai/plugin` as a peer dependency (the SDK needs the `Plugin`, `PluginInput`, `Hooks`, and `Event` types)
- Publishable as an npm package

### Project Structure

```
opencode-notification-sdk/
  src/
    index.ts              # Public API exports
    types.ts              # NotificationEvent, NotificationContext, NotificationBackend, EventMetadata
    events.ts             # Event classification (raw OpenCode events -> canonical events)
    session.ts            # Session tracking and parent/child detection
    rate-limiter.ts       # ISO 8601 duration parsing, per-event cooldown
    config.ts             # Config file loading, validation, backend config extraction
    defaults.ts           # Default notification content per event type
    templates.ts          # Shell command template execution with {var} substitution
    plugin-factory.ts     # createNotificationPlugin() factory
  tests/
    types.test.ts         # Type conformance tests
    events.test.ts        # Event classification tests
    session.test.ts       # Session filtering tests
    rate-limiter.test.ts  # Rate limiter and duration parsing tests
    config.test.ts        # Config loading and validation tests
    defaults.test.ts      # Default content tests
    templates.test.ts     # Template execution tests
    plugin-factory.test.ts # Integration tests for the plugin factory
    mock-shell.ts         # Shared mock BunShell factory
  eslint.config.js
  package.json
  tsconfig.json
  vitest.config.ts
  PROMPT.md               # This file
  PLAN.md                 # Implementation plan / task tracker
  ralph.sh                # The loop script
```

### Documentation: Creating a Custom Notification Plugin

The project must include documentation (in a `docs/creating-a-plugin.md` file) that explains how to create a custom notification plugin using this SDK. The documentation should cover:

1. **Overview** -- a brief explanation of the SDK's architecture and the role of a backend plugin (i.e., the SDK handles all decision logic; the plugin only implements delivery)
2. **Prerequisites** -- what dependencies to install (`opencode-notification-sdk` and `@opencode-ai/plugin` as a peer dependency)
3. **Implementing `NotificationBackend`** -- a step-by-step guide showing how to create a class or object that implements the `NotificationBackend` interface, including:
   - The `send(context: NotificationContext): Promise<void>` method signature
   - How to use `context.title`, `context.message`, `context.event`, and `context.metadata` to construct the notification payload
   - Error handling expectations (the SDK catches errors from `send()`, but backends should still handle transient failures gracefully)
4. **Using `createNotificationPlugin()`** -- how to wire the backend into a fully functional OpenCode plugin using the factory function, including:
   - Passing the backend instance
   - Using the `backendConfigKey` option to receive backend-specific configuration from `~/.config/opencode/notification.json`
   - Accessing backend-specific config via `getBackendConfig()`
5. **Configuration** -- how end users configure the plugin via the shared `notification.json` config file, including:
   - Adding a backend-specific section under `backends`
   - Customizing events, cooldown, and templates
6. **Complete example** -- a full, minimal working example of a custom notification plugin (e.g., a simple webhook-based notifier) from start to finish, including the plugin entry point file that exports the plugin
7. **Testing tips** -- guidance on how plugin authors can test their backend implementation in isolation by constructing `NotificationContext` objects directly

### Node.js Version Support

The SDK must support all currently supported versions of Node.js (20, 22, and 24). This is enforced via:

1. `engines.node` field in `package.json` set to `>=20`
2. CI matrix running lint, build, and test against Node.js 20, 22, and 24
