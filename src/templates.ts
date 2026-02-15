import type { BunShell } from "@opencode-ai/plugin/shell";

export async function resolveField(
  _$: BunShell,
  commandTemplate: string | null | undefined,
  _variables: Record<string, string>,
  fallback: string,
): Promise<string> {
  if (commandTemplate == null) {
    return fallback;
  }
  return fallback;
}
