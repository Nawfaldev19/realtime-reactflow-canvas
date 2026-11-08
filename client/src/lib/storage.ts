// localStorage can throw (private mode, blocked storage) or be absent. Every
// access goes through these helpers so the app still works without persistence.
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Persistence is a convenience; the in-memory session still works.
  }
}
