// The web app's security headers (docs/SECURITY.md). Framework-free, so the
// Vite config can serve them with the production build and tests can check
// every directive. The API sets its own, stricter set (server/config/application.rb).

export const DEFAULT_API_URL = "http://localhost:3000/graphql";

/** Fonts: the stylesheet and the font files (export also fetches both to embed them). */
const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"] as const;

/** ws(s)://host/cable next to the GraphQL endpoint. */
export function cableUrlFor(apiUrl: string): string {
  return apiUrl.replace(/^http/, "ws").replace(/\/graphql$/, "/cable");
}

export interface HeaderOptions {
  apiUrl: string;
  cableUrl: string;
}

/**
 * Directives, one per concern:
 * - scripts and workers only from the app's own origin (no inline script, no eval);
 * - styles also inline, because React Flow and our node renderers position
 *   elements with style attributes;
 * - images from data: and blob: URLs, which export and html-to-image create;
 * - connections only to the API, its socket and the font host;
 * - nothing may frame the app, no plugins, forms and <base> stay on this origin.
 */
export function contentSecurityPolicy({ apiUrl, cableUrl }: HeaderOptions): string {
  const directives: [string, string[]][] = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'"]],
    ["worker-src", ["'self'"]],
    ["style-src", ["'self'", "'unsafe-inline'", FONT_ORIGINS[0]]],
    ["font-src", ["'self'", "data:", FONT_ORIGINS[1]]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["connect-src", unique(["'self'", new URL(apiUrl).origin, new URL(cableUrl).origin, ...FONT_ORIGINS])],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(" ")}`).join("; ");
}

export function securityHeaders(options: HeaderOptions): Record<string, string> {
  return {
    "Content-Security-Policy": contentSecurityPolicy(options),
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
