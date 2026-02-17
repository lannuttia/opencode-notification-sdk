# Creating a Custom Notification Plugin

This guide explains how to create a custom notification backend plugin using the `opencode-notification-sdk`. By the end, you will have a fully functional OpenCode plugin that delivers notifications through your chosen transport.

## Overview

The `opencode-notification-sdk` handles all notification decision logic:

- **Event filtering** -- determining which OpenCode plugin events should trigger notifications
- **Subagent suppression** -- silently suppressing notifications from sub-agent (child) sessions for `session.idle` and `session.error` events
- **Content utilities** -- composable functions for producing dynamic notification content: `renderTemplate()`, `execCommand()`, `execTemplate()`

Your backend plugin only needs to implement a single method: `send()`. The SDK calls your `send()` method after all filtering is complete. You receive a `NotificationContext` with the event type and metadata -- your backend decides what content to produce and how to deliver it.

## Prerequisites

Install the SDK and the OpenCode plugin types:

```bash
bun add opencode-notification-sdk
bun add -d @opencode-ai/plugin
```

Your `package.json` should list `@opencode-ai/plugin` as a peer dependency:

```json
{
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  },
  "dependencies": {
    "opencode-notification-sdk": "^0.x"
  }
}
```

## Implementing `NotificationBackend`

Create a class or object that implements the `NotificationBackend` interface. The interface requires a single async method:

```typescript
import type { NotificationBackend, NotificationContext } from "opencode-notification-sdk";

const myBackend: NotificationBackend = {
  async send(context: NotificationContext): Promise<void> {
    // Deliver the notification using your chosen transport
  },
};
```

### The `NotificationContext` object

The `context` parameter passed to `send()` contains the event type and metadata:

```typescript
interface NotificationContext {
  event: NotificationEvent;   // "session.idle", "session.error", or "permission.asked"
  metadata: EventMetadata;    // Event metadata (session ID, project name, etc.)
}

interface EventMetadata {
  sessionId: string;           // The OpenCode session ID
  projectName: string;         // Directory basename of the project
  timestamp: string;           // ISO 8601 timestamp
  error?: string;              // Error message (session.error events only)
  permissionType?: string;     // Permission type (permission.asked only)
  permissionPatterns?: string[]; // Permission patterns (permission.asked only)
}
```

The SDK does not prescribe what fields a notification must contain (e.g., title, message, body). Your backend decides what content to produce. You can use the content utilities to produce formatted strings from the context data.

### Using content utilities

The SDK provides three composable functions for producing dynamic notification content:

#### `renderTemplate(template, context)`

Pure, synchronous string interpolation. Substitutes `{var_name}` placeholders with values derived from the `NotificationContext`:

```typescript
import { renderTemplate } from "opencode-notification-sdk";
import type { NotificationContext } from "opencode-notification-sdk";

const myBackend: NotificationBackend = {
  async send(context: NotificationContext): Promise<void> {
    const title = renderTemplate("OpenCode: {event} in {project}", context);
    const message = renderTemplate("Session {session_id} at {time}", context);

    // Use title and message in your notification delivery...
  },
};
```

Available template variables:

| Variable | Source | Description |
|---|---|---|
| `{event}` | `context.event` | The event type string (e.g., `session.idle`) |
| `{time}` | `context.metadata.timestamp` | ISO 8601 timestamp |
| `{project}` | `context.metadata.projectName` | Project directory name |
| `{session_id}` | `context.metadata.sessionId` | The session ID |
| `{error}` | `context.metadata.error` | Error message (empty string if not present) |
| `{permission_type}` | `context.metadata.permissionType` | Permission type (empty string if not present) |
| `{permission_patterns}` | `context.metadata.permissionPatterns` | Comma-separated patterns (empty string if not present) |

Unrecognized variable names are substituted with empty strings.

#### `execCommand($, command)`

Executes a shell command via the Bun `$` shell and returns trimmed stdout. Rejects on non-zero exit codes:

```typescript
import { execCommand } from "opencode-notification-sdk";

// In a context where you have access to the PluginInput's $ shell:
const hostname = await execCommand($, "hostname");
```

#### `execTemplate($, template, context)`

Combines `renderTemplate()` and `execCommand()`: renders `{var_name}` placeholders first, then executes the resulting command:

```typescript
import { execTemplate } from "opencode-notification-sdk";

const message = await execTemplate(
  $,
  "echo 'Alert: {event} in project {project}'",
  context,
);
```

### Example: HTTP webhook backend

```typescript
import type { NotificationBackend, NotificationContext } from "opencode-notification-sdk";
import { renderTemplate } from "opencode-notification-sdk";

const webhookBackend: NotificationBackend = {
  async send(context: NotificationContext): Promise<void> {
    const title = renderTemplate("OpenCode: {event}", context);
    const message = renderTemplate("{project} - session {session_id}", context);

    await fetch("https://hooks.example.com/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        message,
        event: context.event,
        project: context.metadata.projectName,
        timestamp: context.metadata.timestamp,
      }),
    });
  },
};
```

### Error handling

The SDK wraps every call to `send()` in a try/catch and silently ignores errors. This ensures that notification failures never crash the host OpenCode process. However, your backend should still handle transient failures gracefully -- for example, by logging errors internally or implementing retry logic -- so that notifications are as reliable as possible.

## Using `createNotificationPlugin()`

The `createNotificationPlugin()` factory function wires your backend into a fully functional OpenCode plugin. It returns a `Plugin` function that OpenCode invokes when the plugin is loaded.

```typescript
import { createNotificationPlugin } from "opencode-notification-sdk";

const plugin = createNotificationPlugin(myBackend);

export default plugin;
```

### Using `backendConfigKey`

If your backend needs user-configurable settings (API keys, server URLs, etc.), provide a `backendConfigKey`. This determines which config file the SDK loads for your plugin:

```typescript
import { createNotificationPlugin } from "opencode-notification-sdk";

const plugin = createNotificationPlugin(myBackend, {
  backendConfigKey: "mybackend",
});

export default plugin;
```

With `backendConfigKey: "mybackend"`, the SDK loads config from `~/.config/opencode/notification-mybackend.json`. Without a key, it falls back to `~/.config/opencode/notification.json`.

### Accessing backend-specific configuration

To read your backend's configuration section from the config file, use `loadConfig()` and `getBackendConfig()`:

```typescript
import {
  loadConfig,
  getBackendConfig,
} from "opencode-notification-sdk";

// Load the config from ~/.config/opencode/notification-mybackend.json
const config = loadConfig("mybackend");

// Extract the backend-specific section (config.backend)
const backendConfig = getBackendConfig(config, "mybackend");
// backendConfig is Record<string, unknown>

const serverUrl = typeof backendConfig.server === "string"
  ? backendConfig.server
  : "https://default.example.com";
// Use serverUrl in your backend...
```

## Configuration

End users configure each notification plugin through its own config file:

```
~/.config/opencode/notification-<backendConfigKey>.json
```

For example, if your plugin uses `backendConfigKey: "webhook"`, users create `~/.config/opencode/notification-webhook.json`.

### Config file structure

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "backend": {
    "server": "https://hooks.example.com",
    "apiKey": "secret-key"
  }
}
```

### Key config options

| Field | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Global kill switch for all notifications |
| `events` | `object` | (all enabled) | Per-event enable/disable toggles |
| `events.<type>.enabled` | `boolean` | `true` | Per-event enable/disable toggle |
| `backend` | `object` | `{}` | Backend-specific configuration (your plugin reads this) |

When the config file does not exist, all defaults are used (everything enabled, empty backend config).

### Adding backend-specific config

Tell your users to add their backend settings under the `backend` key in the plugin's config file:

```json
{
  "backend": {
    "server": "https://hooks.example.com",
    "apiKey": "your-api-key"
  }
}
```

The SDK does not interpret or validate your backend's config section -- it passes it through as-is for your backend to consume.

## Complete Example

Here is a full, minimal working example of a webhook notification plugin:

### `src/index.ts`

```typescript
import type { NotificationBackend, NotificationContext } from "opencode-notification-sdk";
import {
  createNotificationPlugin,
  loadConfig,
  getBackendConfig,
  renderTemplate,
} from "opencode-notification-sdk";

// 1. Define the backend
const webhookBackend: NotificationBackend = {
  async send(context: NotificationContext): Promise<void> {
    // Read backend-specific config
    const config = loadConfig("webhook");
    const backendConfig = getBackendConfig(config, "webhook");

    const url = typeof backendConfig.url === "string"
      ? backendConfig.url
      : "https://hooks.example.com/notify";

    const apiKey = typeof backendConfig.apiKey === "string"
      ? backendConfig.apiKey
      : "";

    // Use content utilities to produce notification content
    const title = renderTemplate("OpenCode: {event}", context);
    const message = renderTemplate(
      "Project {project} - session {session_id} at {time}",
      context,
    );

    // Send the notification
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        title,
        message,
        event: context.event,
        project: context.metadata.projectName,
        session: context.metadata.sessionId,
        timestamp: context.metadata.timestamp,
        error: context.metadata.error,
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  },
};

// 2. Create the plugin using the factory
const plugin = createNotificationPlugin(webhookBackend, {
  backendConfigKey: "webhook",
});

// 3. Export the plugin as the default export
export default plugin;
```

### User configuration (`~/.config/opencode/notification-webhook.json`)

```json
{
  "enabled": true,
  "events": {
    "session.idle": { "enabled": true },
    "session.error": { "enabled": true },
    "permission.asked": { "enabled": true }
  },
  "backend": {
    "url": "https://hooks.myserver.com/opencode",
    "apiKey": "my-secret-key"
  }
}
```

## Testing Tips

You can test your backend implementation in isolation without running OpenCode. Construct `NotificationContext` objects directly and pass them to your `send()` method:

```typescript
import { describe, it, expect } from "vitest";
import type { NotificationContext } from "opencode-notification-sdk";

// Import your backend
import { webhookBackend } from "./my-backend.js";

describe("webhook backend", () => {
  it("should POST the notification to the configured URL", async () => {
    // Create a test context
    const context: NotificationContext = {
      event: "session.idle",
      metadata: {
        sessionId: "test-session-123",
        projectName: "my-project",
        timestamp: new Date().toISOString(),
      },
    };

    // Call send() and verify your backend's behavior
    // (use network-level interception like MSW rather than vi.mock/vi.spyOn)
    await webhookBackend.send(context);
  });

  it("should include error metadata for session.error events", async () => {
    const context: NotificationContext = {
      event: "session.error",
      metadata: {
        sessionId: "err-session-456",
        projectName: "my-project",
        timestamp: new Date().toISOString(),
        error: "Connection timeout",
      },
    };

    await webhookBackend.send(context);

    // Verify your backend handled the error metadata correctly
  });
});
```

### Testing tips summary

- **Test `send()` directly** -- you don't need the full plugin lifecycle to test your delivery logic.
- **Use network-level interception** -- libraries like [MSW](https://mswjs.io/) let you intercept HTTP requests at the network boundary without coupling tests to implementation details. Avoid `vi.mock()`, `vi.spyOn()`, or `vi.fn()` for mocking production dependencies.
- **Test all event types** -- construct contexts for each `NotificationEvent` type (`session.idle`, `session.error`, `permission.asked`) to verify your backend handles them all correctly.
- **Test error scenarios** -- verify your backend handles network failures, auth errors, and invalid responses gracefully.
- **Use the SDK's types** -- import `NotificationContext` and `NotificationEvent` from the SDK to ensure type safety in your tests.
