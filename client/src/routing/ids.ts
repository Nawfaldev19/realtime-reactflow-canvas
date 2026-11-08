// Deterministic short ids for route points. An "add point" handle gets the
// id its point will have once created (derived from the ids of the two
// neighbours), so the element under the pointer keeps its React key and
// never remounts mid-drag. Ids stay short enough for the server's
// identifier rule (letters, digits, "_" and "-", at most 64 characters).

/** 32-bit FNV-1a hash of a string. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** A short id derived from its parts, for example "p1a2b3c4d". */
export function derivedId(prefix: string, ...parts: readonly string[]): string {
  return `${prefix}${fnv1a(parts.join("|")).toString(16).padStart(8, "0")}`;
}

/** The id of the point that would be inserted between two neighbours ("source" and "target" stand for the anchors). */
export const pointIdBetween = (previous: string, next: string): string => derivedId("p", previous, next);

/** An id that is not yet used in `taken`, derived from `seed`. */
export function freshId(seed: string, taken: ReadonlySet<string>): string {
  let candidate = derivedId("v", seed);
  for (let attempt = 1; taken.has(candidate); attempt += 1) candidate = derivedId("v", seed, String(attempt));
  return candidate;
}
