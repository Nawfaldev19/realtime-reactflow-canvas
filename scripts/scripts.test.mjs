// Unit tests for the audit scripts: node --test scripts/
import assert from "node:assert/strict";
import { test } from "node:test";
import { gemspecLicense, lockedGems as licenseLockedGems, npmPackages, permissive } from "./license-audit.mjs";
import { lockedGems } from "./gem-advisories.mjs";

const LOCKFILE = `GEM
  remote: https://rubygems.org/
  specs:
    nokogiri (1.19.4-arm64-darwin)
      racc (~> 1.4)
    nokogiri (1.19.4-x86_64-linux-gnu)
    rack (3.2.7)

PLATFORMS
  arm64-darwin
`;

test("permissive accepts the allow-list and SPDX alternatives", () => {
  assert.equal(permissive("MIT"), true);
  assert.equal(permissive("(MIT OR CC0-1.0)"), true);
  assert.equal(permissive("Ruby OR GPL-2.0-only"), true);
  assert.equal(permissive("MIT AND Apache-2.0"), true);
  assert.equal(permissive("MIT AND GPL-3.0"), false);
  assert.equal(permissive("GPL-3.0"), false);
  assert.equal(permissive("CC-BY-4.0"), false);
  assert.equal(permissive(null), false);
});

test("gemspec licenses are read and joined as alternatives", () => {
  assert.equal(gemspecLicense('  s.licenses = ["Ruby".freeze, "BSD-2-Clause".freeze]\n'), "Ruby OR BSD-2-Clause");
  assert.equal(gemspecLicense('  s.license = "MIT"\n'), "MIT");
  assert.equal(gemspecLicense("  s.name = \"json\"\n"), null);
});

test("lockfile gems lose their platform suffix and appear once", () => {
  const expected = [
    { name: "nokogiri", version: "1.19.4" },
    { name: "rack", version: "3.2.7" },
  ];
  assert.deepEqual(lockedGems(LOCKFILE), expected);
  assert.deepEqual(licenseLockedGems(LOCKFILE), expected);
});

test("npm lockfile entries keep their scope and nested names", () => {
  const packages = npmPackages({
    packages: {
      "": { name: "app" },
      "node_modules/react": { version: "18.3.1", license: "MIT" },
      "node_modules/vite/node_modules/esbuild": { version: "0.21.5", license: "MIT", dev: true },
      "node_modules/old": { version: "1.0.0", license: { type: "BSD-3-Clause" } },
    },
  });
  assert.deepEqual(packages, [
    { name: "react", version: "18.3.1", license: "MIT", scope: "runtime" },
    { name: "esbuild", version: "0.21.5", license: "MIT", scope: "development" },
    { name: "old", version: "1.0.0", license: "BSD-3-Clause", scope: "runtime" },
  ]);
});
