#!/usr/bin/env node
// License audit for every installed third-party package (THIRD_PARTY_NOTICES.md).
//
//   node scripts/license-audit.mjs            summary, exceptions and problems
//   node scripts/license-audit.mjs --list     also every package with its license
//
// Client: every entry of client/package-lock.json (the lockfile records each
// package's declared license), marked runtime or development.
// Server: every gem in server/Gemfile.lock, with the license declared in its
// installed gemspec under server/vendor/bundle (run bin/dev or bundle install first).
//
// A package passes when its license expression is satisfied by the permissive
// allow-list (for "A OR B" one side is enough; for "A AND B" both are needed).
// Anything else must be listed in EXCEPTIONS with the reason it is acceptable;
// an unexplained package makes the script exit with status 1.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PERMISSIVE = new Set([
  "MIT",
  "MIT-0",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "BlueOak-1.0.0",
  "CC0-1.0",
  "Unlicense",
  "Python-2.0",
  // Ruby's own license: "the 2-clause BSDL, or the conditions below" (permissive either way).
  "Ruby",
  "BSD-2-Clause-Ruby",
]);

/** Packages outside the allow-list, with why they are acceptable. Keys are package names. */
export const EXCEPTIONS = {
  "caniuse-lite":
    "CC-BY-4.0 browser-support data read by the build tooling (Browserslist); development only, not shipped in the app bundle.",
};

/** Whether an SPDX-style expression is satisfied by the allow-list. */
export function permissive(expression) {
  if (!expression) return false;
  const text = expression.trim().replace(/^\((.*)\)$/, "$1");
  if (/ OR /i.test(text)) return text.split(/ OR /i).some((part) => permissive(part));
  if (/ AND /i.test(text)) return text.split(/ AND /i).every((part) => permissive(part));
  return PERMISSIVE.has(text);
}

/** npm packages from a lockfile object: name, version, license, runtime or development. */
export function npmPackages(lock) {
  return Object.entries(lock.packages ?? {})
    .filter(([path]) => path.startsWith("node_modules/"))
    .map(([path, entry]) => ({
      name: path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length),
      version: entry.version,
      license: typeof entry.license === "string" ? entry.license : (entry.license?.type ?? null),
      scope: entry.dev ? "development" : "runtime",
    }));
}

/** Gem names and versions from a Gemfile.lock, platform variants collapsed. */
export function lockedGems(lockfile) {
  const section = lockfile.split(/^GEM$/m)[1]?.split(/^[A-Z]/m)[0] ?? "";
  const gems = new Map();
  for (const match of section.matchAll(/^ {4}([A-Za-z0-9_.-]+) \(([^)]+)\)$/gm)) {
    gems.set(match[1], match[2].replace(/-(?:x86|arm|aarch64|universal|java)[\w-]*$/, ""));
  }
  return [...gems].map(([name, version]) => ({ name, version }));
}

/** The licenses declared in a gemspec's source, joined with OR (gems list alternatives). */
export function gemspecLicense(source) {
  const match = /\.licenses? = \[?([^\n\]]*)\]?/.exec(source);
  if (!match) return null;
  const names = [...match[1].matchAll(/"([^"]+)"/g)].map((name) => name[1]);
  return names.length > 0 ? names.join(" OR ") : null;
}

function serverGems() {
  const lockfile = join(root, "server/Gemfile.lock");
  const bundle = join(root, "server/vendor/bundle/ruby");
  if (!existsSync(bundle)) throw new Error("server/vendor/bundle is missing: run `bundle install` in server/ first");
  const specDirs = readdirSync(bundle).map((version) => join(bundle, version, "specifications"));
  return lockedGems(readFileSync(lockfile, "utf8")).map(({ name, version }) => {
    const spec = specDirs.map((dir) => join(dir, `${name}-${version}.gemspec`)).find((path) => existsSync(path));
    const platformVariant = (dir) =>
      readdirSync(dir)
        .filter((file) => file.startsWith(`${name}-${version}-`))
        .map((file) => join(dir, file));
    const variant = spec ?? specDirs.flatMap(platformVariant)[0];
    return { name, version, license: variant ? gemspecLicense(readFileSync(variant, "utf8")) : null, scope: "gem" };
  });
}

function clientPackages() {
  return npmPackages(JSON.parse(readFileSync(join(root, "client/package-lock.json"), "utf8")));
}

function tally(packages) {
  const counts = new Map();
  for (const { license } of packages) counts.set(license ?? "(none declared)", (counts.get(license ?? "(none declared)") ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([license, count]) => `${license} ${String(count)}`).join(", ");
}

function main() {
  const groups = [
    ["Client runtime (npm)", clientPackages().filter((pkg) => pkg.scope === "runtime")],
    ["Client development (npm)", clientPackages().filter((pkg) => pkg.scope === "development")],
    ["Server (gems)", serverGems()],
  ];
  const list = process.argv.includes("--list");
  const excepted = [];
  const problems = [];
  for (const [title, packages] of groups) {
    console.log(`${title}: ${String(packages.length)} packages: ${tally(packages)}`);
    for (const pkg of packages) {
      if (list) console.log(`  ${pkg.name} ${pkg.version}: ${pkg.license ?? "(none declared)"}`);
      if (permissive(pkg.license)) continue;
      if (EXCEPTIONS[pkg.name]) excepted.push(`${pkg.name} ${pkg.version} (${pkg.license ?? "none declared"}): ${EXCEPTIONS[pkg.name]}`);
      else problems.push(`${pkg.name} ${pkg.version} (${pkg.license ?? "none declared"}, ${pkg.scope})`);
    }
  }
  console.log(`\nExceptions (${String(excepted.length)}):`);
  for (const line of excepted) console.log(`  ${line}`);
  console.log(`\nNot permitted (${String(problems.length)}):`);
  for (const line of problems) console.log(`  ${line}`);
  process.exitCode = problems.length > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
