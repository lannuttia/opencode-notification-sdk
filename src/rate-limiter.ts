import { parse, toSeconds } from "iso8601-duration";

export function parseISO8601Duration(duration: string): number {
  const parsed = parse(duration);
  return toSeconds(parsed) * 1000;
}
