# opencode-notification-sdk

You are building a TypeScript SDK that provides a standard notification decision engine for OpenCode plugins.

## Goal

Build a TypeScript library (`opencode-notification-sdk`) that handles all notification decision logic -- event filtering and shell command templates -- so that notification backend plugins (ntfy.sh, desktop notifications, Slack, etc.) only need to implement a simple `send()` method.

## Instructions

1. Read the PLAN.md to understand the current state of implementation.
2. If all items in PLAN.md are complete and match this prompt's specifications, output exactly `<promise>Done</promise>` and stop. Do not make any changes.
3. Pick the SINGLE highest priority incomplete item from PLAN.md and implement it.
4. Ensure tests pass after your changes.
5. Update PLAN.md with your progress.
6. If your changes affect user-facing behavior, configuration, or project structure, update `README.md` to reflect the current state of the project. The README must accurately document how to install, configure, and use the SDK based on the actual implementation, not legacy or outdated approaches.
7. Commit all changes with `git add -A && git commit -m "..."`.

If there is a discrepancy between PLAN.md and this prompt, always update PLAN.md to match this prompt.

### Code Quality Rules

- **No type casting.** Never use `as`, `as any`, `as unknown`, or similar type assertions. If the types don't align, fix the type definitions or use type guards, generics, or proper type narrowing instead. This is enforced by ESLint via the `@typescript-eslint/consistent-type-assertions` rule with `assertionStyle: "never"`.
- **Prefer constants.** Use `const` variables instead of `let` wherever the value is not reassigned. For object literals, arrays, and other compound values that should be deeply immutable, use `as const` assertions (const assertions) to narrow types to their literal values. This improves type safety, communicates intent, and prevents accidental mutation.
- **Linting is required.** All source and test code must pass `npm run lint` before committing. The linter uses ESLint with typescript-eslint and is configured in `eslint.config.js`.
- **Prefer immutability and pure functions.** Favor immutable data and pure functions over mutable state and side effects. Avoid mutating function arguments or shared state. When a function needs to produce a modified value, return a new value rather than mutating the input. Side effects (I/O, network calls, filesystem access) should be pushed to the edges of the system so that core logic remains pure and easy to test.
- **No implementation-coupled test doubles.** Tests must not use mocks, spies, stubs, monkey-patching, or module patching that couple the test to the internal implementation of the unit under test. This includes -- but is not limited to -- `vi.mock()`, `vi.spyOn()`, `vi.fn()`, `vi.stubGlobal()`, and manual mock files. Design production code so that dependencies can be supplied directly (e.g., via function parameters or options objects) rather than requiring interception at the module or global level. Network-level interception libraries like MSW are permitted because they operate at the HTTP boundary without coupling tests to implementation details.

## Specifications

### Overview

The SDK is a standalone npm package that backend notification plugins depend on. It handles:

1. **Event filtering** -- determining which OpenCode plugin events should trigger notifications
2. **Subagent suppression** -- silently suppressing notifications from sub-agent (child) sessions
3. **Shell command templates** -- customizable notification fields via shell commands with `{var}` substitution
4. **Default notification content** -- sensible defaults for titles, messages, and metadata per event type
5. **Plugin factory** -- a `createNotificationPlugin()` function that wires everything together and returns OpenCode `Hooks`

Backend plugins implement a single `NotificationBackend` interface and call `createNotificationPlugin()` to get a fully functional plugin.

### Supported Events

The SDK sends notifications on the following OpenCode events via the `event` hook:

| Event | OpenCode Trigger | Description |
|---|---|---|
| `session.idle` | `session.idle` event | Agent finished generating and is waiting for input |
| `session.error` | `session.error` event | Session encountered an error |
| `permission.asked` | `permission.asked` event | Agent needs user permission |

These are defined as a TypeScript string literal union type `NotificationEvent`.

### Subagent Suppression

`session.idle` and `session.error` events from subagent (child) sessions must be silently suppressed. When a subagent completes or errors, control returns to the parent agent, so there is nothing for the user to act on. The SDK must use the `client` from the plugin input to call `client.session.get()` with the session ID from the event's properties to determine whether the session has a `parentID`. If it does, the event is from a subagent and no notification is sent. If the session lookup fails (e.g., network error, missing session), the SDK must fall through and send the notification anyway to avoid silently dropping notifications due to transient failures.

### Event Filtering (`src/events.ts`)

The SDK must classify raw OpenCode events and determine whether a notification should be sent. This module:

1. Receives raw OpenCode events from the `event` hook
2. For `session.idle` events: uses the OpenCode `client.session.get()` API to check whether the session has a `parentID`. If it does, the event is from a subagent and is silently suppressed. If the lookup fails, the notification is sent anyway.
3. For `session.error` events: uses the same subagent check as `session.idle`. Subagent errors are silently suppressed.
4. For `permission.asked` events (note: this event type string is not yet in the `@opencode-ai/plugin` SDK's `Event` union, so it must be handled via string comparison on `event.type`): always sends a notification.
5. Extracts event metadata (error messages, permission types, patterns, session IDs, timestamps)

### Configuration (`src/config.ts`)

Each plugin that uses the SDK gets its own configuration file. The config file path is determined by the `backendConfigKey` provided to `createNotificationPlugin()`: `~/.config/opencode/notification-<backendConfigKey>.json`. For example, a plugin with `backendConfigKey: "ntfy"` reads from `~/.config/opencode/notification-ntfy.json`, and a plugin with `backendConfigKey: "desktop"` reads from `~/.config/opencode/notification-desktop.json`.

If no `backendConfigKey` is provided, the SDK falls back to `~/.config/opencode/notification.json`.

The SDK must:

1. Read and parse the plugin's config file on plugin initialization
2. Validate the config against the expected schema
3. Provide defaults for all optional fields
4. Expose a `getBackendConfig<T>(config, backendName)` function that extracts the backend-specific config section

#### Config File Schema

Each plugin's config file contains the shared notification settings plus a single `backend` section for that plugin's backend-specific configuration. For example, `~/.config/opencode/notification-ntfy.json`:

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "templates": {
    "session.idle": {
      "titleCmd": null,
      "messageCmd": null
    }
  },
  "backend": {
    "topic": "my-topic",
    "server": "https://ntfy.sh"
  }
}
```

And `~/.config/opencode/notification-desktop.json`:

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "backend": {
    "sound": true
  }
}
```

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Global kill switch for all notifications from this plugin |
| `events` | `object` | (all enabled) | Per-event enable/disable toggles |
| `events.<type>.enabled` | `boolean` | `true` | Whether this event type triggers notifications |
| `templates` | `object \| null` | `null` | Per-event shell command templates |
| `templates.<type>.titleCmd` | `string \| null` | `null` | Shell command to generate notification title |
| `templates.<type>.messageCmd` | `string \| null` | `null` | Shell command to generate notification message |
| `backend` | `object` | `{}` | Backend-specific configuration for this plugin |

When the config file does not exist, all defaults are used (everything enabled, no templates, empty backend config).

### Default Notification Content (`src/defaults.ts`)

The SDK provides default titles and messages for each event type. These are used when no shell command template is configured for the field.

| Event | Default Title | Default Message |
|---|---|---|
| `session.idle` | `"Agent Idle"` | `"The agent has finished and is waiting for input."` |
| `session.error` | `"Agent Error"` | `"An error occurred. Check the session for details."` |
| `permission.asked` | `"Permission Asked"` | `"The agent needs permission to continue."` |

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
| `{event}` | All events | The event type string (e.g., `session.idle`) |
| `{time}` | All events | ISO 8601 timestamp |
| `{project}` | All events | Project directory name (basename) |
| `{error}` | `session.error` only | The error message (empty string for other events) |
| `{permission_type}` | `permission.asked` only | The permission type (empty string for other events) |
| `{permission_patterns}` | `permission.asked` only | Comma-separated list of patterns (empty string for other events) |
| `{session_id}` | All events | The session ID (empty string if unavailable) |

### Notification Context (`src/types.ts`)

When a notification passes all filters (enabled, event config, subagent suppression), the SDK produces a `NotificationContext` object and passes it to the backend:

```typescript
interface NotificationContext {
  event: NotificationEvent;
  title: string;
  message: string;
  metadata: EventMetadata;
}

interface EventMetadata {
  sessionId: string;
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
2. When invoked by OpenCode, loads the plugin's config file (determined by `backendConfigKey`) and returns `Hooks`
3. The returned `Hooks` include:
   - `event` handler -- handles `session.idle`, `session.error`, and `permission.asked` events
4. For each event:
   - Checks `config.enabled` (global kill switch)
   - Checks `config.events[eventType].enabled` (per-event toggle)
   - Performs subagent suppression for `session.idle` and `session.error` events
   - Resolves title and message via shell command templates or defaults
   - Calls `backend.send(context)`
   - Catches and ignores errors from `backend.send()`
5. If `options.backendConfigKey` is provided, the config is loaded from `~/.config/opencode/notification-<backendConfigKey>.json`, and the backend's config section is available via `config.backend` (the SDK does not interpret it; it's passed through for the backend to use)

### Public API (`src/index.ts`)

The SDK exports the following from `src/index.ts`:

- `createNotificationPlugin` -- the plugin factory function
- `NotificationBackend` -- the backend interface type
- `NotificationContext` -- the context object type
- `NotificationEvent` -- the event type union
- `EventMetadata` -- the event metadata type
- `NotificationSDKConfig` -- the full config type
- `loadConfig` -- the config loading function (accepts an optional `backendConfigKey` to determine the config file path)
- `getBackendConfig` -- the backend config extraction function

### Tech Stack

- TypeScript with strict mode
- ESLint with typescript-eslint for linting
- Vitest for testing
- `@opencode-ai/plugin` as a peer dependency (the SDK needs the `Plugin`, `PluginInput`, `Hooks`, and `Event` types)
- Publishable as an npm package

### Project Structure

```
opencode-notification-sdk/
  src/
    index.ts              # Public API exports
    types.ts              # NotificationEvent, NotificationContext, NotificationBackend, EventMetadata
    events.ts             # Event filtering and subagent suppression
    config.ts             # Config file loading, validation, backend config extraction
    defaults.ts           # Default notification content per event type
    templates.ts          # Shell command template execution with {var} substitution
    plugin-factory.ts     # createNotificationPlugin() factory
  tests/
    types.test.ts         # Type conformance tests
    events.test.ts        # Event filtering and subagent suppression tests
    config.test.ts        # Config loading and validation tests
    defaults.test.ts      # Default content tests
    templates.test.ts     # Template execution tests
    plugin-factory.test.ts # Integration tests for the plugin factory
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
   - Using the `backendConfigKey` option so the plugin loads its own config file (`~/.config/opencode/notification-<backendConfigKey>.json`)
   - Accessing backend-specific config via `getBackendConfig()`
5. **Configuration** -- how end users configure the plugin via its own config file (`~/.config/opencode/notification-<backendConfigKey>.json`), including:
   - The `backend` section for backend-specific settings
   - Customizing events and templates
6. **Complete example** -- a full, minimal working example of a custom notification plugin (e.g., a simple webhook-based notifier) from start to finish, including the plugin entry point file that exports the plugin
7. **Testing tips** -- guidance on how plugin authors can test their backend implementation in isolation by constructing `NotificationContext` objects directly

### Node.js Version Support

The SDK must support all currently supported versions of Node.js (20, 22, and 24). This is enforced via:

1. `engines.node` field in `package.json` set to `>=20`
2. CI matrix running lint, build, and test against Node.js 20, 22, and 24
