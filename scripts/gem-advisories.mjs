#!/usr/bin/env node
// Checks every gem in server/Gemfile.lock against the OSV advisory database
// (https://osv.dev, which includes the RubySec advisories that bundler-audit
// reads). Used instead of bundler-audit because that tool needs a git checkout
// of its database. Prints one line per advisory; exits 1 if any gem is affected.
//
//   node scripts/gem-advisories.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Gem names and versions from the lockfile's GEM section, platform suffixes removed, one entry per gem. */
export function lockedGems(lockfile) {
  const section = lockfile.split(/^GEM$/m)[1]?.split(/^[A-Z]/m)[0] ?? "";
  const gems = new Map();
  for (const match of section.matchAll(/^ {4}([A-Za-z0-9_.-]+) \(([^)]+)\)$/gm)) {
    const version = match[2].replace(/-(?:x86|arm|aarch64|universal|java)[\w-]*$/, "");
    gems.set(match[1], version);
  }
  return [...gems].map(([name, version]) => ({ name, version }));
}

async function main() {
  const gems = lockedGems(readFileSync(join(root, "server/Gemfile.lock"), "utf8"));
  const response = await fetch("https://api.osv.dev/v1/querybatch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: gems.map(({ name, version }) => ({ package: { ecosystem: "RubyGems", name }, version })) }),
  });
  if (!response.ok) throw new Error(`OSV answered ${response.status}`);
  const { results } = await response.json();
  let affected = 0;
  results.forEach((result, index) => {
    for (const vuln of result.vulns ?? []) {
      affected += 1;
      console.log(`${gems[index].name} ${gems[index].version}: ${vuln.id}`);
    }
  });
  console.log(`${gems.length} gems checked, ${affected} advisories`);
  process.exitCode = affected > 0 ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
