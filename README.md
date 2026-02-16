# opencode-notification-sdk

A TypeScript SDK that provides a standard notification decision engine for [OpenCode](https://opencode.ai) plugins. Backend notification plugins (ntfy.sh, desktop notifications, Slack, etc.) only need to implement a simple `send()` method -- the SDK handles everything else.

## Features

- **Event filtering** -- determines which OpenCode events should trigger notifications
- **Subagent suppression** -- silently suppresses notifications from sub-agent (child) sessions
- **Rate limiting** -- configurable per-event cooldown with leading (throttle) or trailing (debounce) edge
- **Shell command templates** -- customizable notification titles and messages via shell commands with `{var}` substitution
- **Default notification content** -- sensible defaults for titles and messages per event type

## Supported Events

| Event | Description |
|---|---|
| `session.idle` | Agent finished generating and is waiting for input |
| `session.error` | Session encountered an error |
| `permission.asked` | Agent needs user permission to continue |

## Installation

```bash
npm install opencode-notification-sdk
```

`@opencode-ai/plugin` is a peer dependency and must be available in the consuming project:

```bash
npm install --save-dev @opencode-ai/plugin
```

**Node.js version:** `>=20` (supports Node.js 20, 22, and 24)

## Quick Start

Create a notification backend and wire it into an OpenCode plugin:

```typescript
import type { NotificationBackend, NotificationContext } from "opencode-notification-sdk";
import { createNotificationPlugin } from "opencode-notification-sdk";

const myBackend: NotificationBackend = {
  async send(context: NotificationContext): Promise<void> {
    console.log(`[${context.event}] ${context.title}: ${context.message}`);
  },
};

const plugin = createNotificationPlugin(myBackend, {
  backendConfigKey: "mybackend",
});

export default plugin;
```

That's it. The SDK handles event filtering, subagent suppression, rate limiting, and content resolution. Your backend only delivers the notification.

## Configuration

Each backend plugin has its own config file. The config file path is determined by the `backendConfigKey` provided to `createNotificationPlugin()`:

```
~/.config/opencode/notification-<backendConfigKey>.json
```

For example, a plugin with `backendConfigKey: "ntfy"` reads from `~/.config/opencode/notification-ntfy.json`. If no `backendConfigKey` is provided, the SDK falls back to `~/.config/opencode/notification.json`.

When the config file does not exist, all defaults are used (everything enabled, no cooldown, no templates, empty backend config).

### Config File Schema

```json
{
  "enabled": true,
  "cooldown": {
    "duration": "PT30S",
    "edge": "leading"
  },
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "templates": {
    "session.idle": {
      "titleCmd": "echo 'Custom Title'",
      "messageCmd": null
    }
  },
  "backend": {
    "topic": "my-topic",
    "server": "https://ntfy.sh"
  }
}
```

### Config Options

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Global kill switch for all notifications |
| `cooldown` | `object \| null` | `null` | Rate limiting configuration |
| `cooldown.duration` | `string` | (required if cooldown set) | ISO 8601 duration string (e.g., `PT30S`, `PT5M`) |
| `cooldown.edge` | `"leading" \| "trailing"` | `"leading"` | Throttle (first event fires) or debounce (fires after quiet period) |
| `events.<type>.enabled` | `boolean` | `true` | Per-event enable/disable toggle |
| `templates.<type>.titleCmd` | `string \| null` | `null` | Shell command to generate notification title |
| `templates.<type>.messageCmd` | `string \| null` | `null` | Shell command to generate notification message |
| `backend` | `object` | `{}` | Backend-specific configuration for this plugin |

### Template Variables

Shell command templates support `{var_name}` substitution. Available variables:

| Variable | Available In | Description |
|---|---|---|
| `{event}` | All events | The event type string (e.g., `session.idle`) |
| `{time}` | All events | ISO 8601 timestamp |
| `{project}` | All events | Project directory name (basename) |
| `{session_id}` | All events | The session ID (empty string if unavailable) |
| `{error}` | `session.error` only | The error message |
| `{permission_type}` | `permission.asked` only | The permission type |
| `{permission_patterns}` | `permission.asked` only | Comma-separated list of patterns |

### Default Notification Content

When no shell command template is configured, the SDK provides these defaults:

| Event | Default Title | Default Message |
|---|---|---|
| `session.idle` | Agent Idle | The agent has finished and is waiting for input. |
| `session.error` | Agent Error | An error occurred. Check the session for details. |
| `permission.asked` | Permission Asked | The agent needs permission to continue. |

## API Reference

### `createNotificationPlugin(backend, options?)`

Creates a fully functional OpenCode plugin from a backend implementation.

```typescript
function createNotificationPlugin(
  backend: NotificationBackend,
  options?: { backendConfigKey?: string }
): Plugin;
```

- `backend` -- an object implementing the `NotificationBackend` interface
- `options.backendConfigKey` -- determines the config file path (`~/.config/opencode/notification-<key>.json`)

### `loadConfig(backendConfigKey?)`

Loads the notification SDK configuration from the appropriate config file. Accepts an optional `backendConfigKey` to determine the config file path.

```typescript
function loadConfig(backendConfigKey?: string): NotificationSDKConfig;
```

### `getBackendConfig(config)`

Extracts the backend-specific configuration from the full config.

```typescript
function getBackendConfig(
  config: NotificationSDKConfig
): Record<string, unknown>;
```

### `parseISO8601Duration(duration)`

Parses an ISO 8601 duration string and returns the value in milliseconds.

```typescript
function parseISO8601Duration(duration: string): number;
```

### Types

```typescript
// The three supported notification event types
type NotificationEvent = "session.idle" | "session.error" | "permission.asked";

// Context passed to backend.send()
interface NotificationContext {
  event: NotificationEvent;
  title: string;
  message: string;
  metadata: EventMetadata;
}

// Event metadata
interface EventMetadata {
  sessionId: string;
  projectName: string;
  timestamp: string;
  error?: string;
  permissionType?: string;
  permissionPatterns?: string[];
}

// Interface backends must implement
interface NotificationBackend {
  send(context: NotificationContext): Promise<void>;
}

// Rate limiter types
interface RateLimiterOptions {
  duration: string;
  edge: "leading" | "trailing";
}

interface RateLimiter {
  shouldAllow(eventType: string): boolean;
}
```

## Creating a Custom Plugin

See [docs/creating-a-plugin.md](docs/creating-a-plugin.md) for a comprehensive guide on building your own notification backend plugin, including:

- Implementing the `NotificationBackend` interface
- Using `createNotificationPlugin()` with backend-specific configuration
- A complete working example (webhook notifier)
- Testing tips

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Lint
npm run lint

# Build
npm run build
```

## License

ISC
