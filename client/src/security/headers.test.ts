import { cableUrlFor, contentSecurityPolicy, DEFAULT_API_URL, securityHeaders } from "./headers";

const options = { apiUrl: "https://api.example.com/graphql", cableUrl: "wss://api.example.com/cable" };

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split("; ").map((part) => {
      const [name = "", ...sources] = part.split(" ");
      return [name, sources];
    }),
  );
}

describe("security headers", () => {
  it("derives the socket URL from the API URL", () => {
    expect(cableUrlFor(DEFAULT_API_URL)).toBe("ws://localhost:3000/cable");
    expect(cableUrlFor("https://api.example.com/graphql")).toBe("wss://api.example.com/cable");
  });

  it("allows scripts and workers only from the app itself", () => {
    const policy = directives(contentSecurityPolicy(options));

    expect(policy.get("script-src")).toEqual(["'self'"]);
    expect(policy.get("worker-src")).toEqual(["'self'"]);
    expect(policy.get("default-src")).toEqual(["'self'"]);
    expect(contentSecurityPolicy(options)).not.toMatch(/unsafe-eval/);
  });

  it("connects only to the API, its socket and the font host", () => {
    expect(directives(contentSecurityPolicy(options)).get("connect-src")).toEqual([
      "'self'",
      "https://api.example.com",
      "wss://api.example.com",
      "https://fonts.googleapis.com",
      "https://fonts.gstatic.com",
    ]);
  });

  it("lists an origin once when the API and the socket share it", () => {
    const sources = directives(
      contentSecurityPolicy({ apiUrl: "http://localhost:3000/graphql", cableUrl: "http://localhost:3000/cable" }),
    ).get("connect-src");

    expect(sources?.filter((source) => source === "http://localhost:3000")).toHaveLength(1);
  });

  it("forbids framing, plugins and foreign forms", () => {
    const policy = directives(contentSecurityPolicy(options));

    expect(policy.get("frame-ancestors")).toEqual(["'none'"]);
    expect(policy.get("object-src")).toEqual(["'none'"]);
    expect(policy.get("form-action")).toEqual(["'self'"]);
    expect(policy.get("base-uri")).toEqual(["'self'"]);
  });

  it("lets export draw data and blob images and load the web fonts", () => {
    const policy = directives(contentSecurityPolicy(options));

    expect(policy.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(policy.get("font-src")).toEqual(["'self'", "data:", "https://fonts.gstatic.com"]);
    expect(policy.get("style-src")).toContain("https://fonts.googleapis.com");
  });

  it("sends the policy with the other headers", () => {
    const headers = securityHeaders(options);

    expect(headers["Content-Security-Policy"]).toBe(contentSecurityPolicy(options));
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });
});
