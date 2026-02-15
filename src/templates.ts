import type { BunShell } from "@opencode-ai/plugin/shell";

export async function resolveField(
  $: BunShell,
  commandTemplate: string | null | undefined,
  _variables: Record<string, string>,
  fallback: string,
): Promise<string> {
  if (commandTemplate == null) {
    return fallback;
  }

  const result = await $`${{ raw: commandTemplate }}`.nothrow().quiet();
  const output = result.text().trim();

  if (result.exitCode !== 0 || output === "") {
    return fallback;
  }

  return output;
}
