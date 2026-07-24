import { rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
rmSync(resolve(root, ".core-test"), { recursive: true, force: true });
const tsc = resolve(root, "node_modules", "typescript", "bin", "tsc");
const compile = spawnSync(process.execPath, [tsc, "-p", "tsconfig.core-test.json"], {
  cwd: root,
  stdio: "inherit",
});
if (compile.status !== 0) process.exit(compile.status ?? 1);
const test = spawnSync(process.execPath, [resolve(root, ".core-test", "tests", "core-regression.js")], {
  cwd: root,
  stdio: "inherit",
});
process.exit(test.status ?? 1);
