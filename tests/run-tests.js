const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { doctor } = require("../lib/doctor");
const { normalizeBaseUrl } = require("../lib/config");
const { normalizeRequestPath } = require("../lib/request");
const { installSkillToTargets, listAvailableSkills, removeSkillFromTargets } = require("../lib/skills");

const CLI = path.resolve(__dirname, "../bin/vvilog.js");

function runCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end();
  });
}

function createSkillRepo(root) {
  const skillDir = path.join(root, "vvilog-api");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), `---
name: vvilog-api
description: VviLog API Skill
---

# VviLog API
`, "utf8");
  return root;
}

async function main() {
  assert.equal(normalizeBaseUrl("https://demo.test", "/api"), "https://demo.test/api");
  assert.equal(normalizeBaseUrl("https://demo.test/api", "/api"), "https://demo.test/api");
  assert.equal(normalizeRequestPath("health"), "/health");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vvilog-cli-test-"));
  const source = createSkillRepo(path.join(tempRoot, "skills"));
  fs.mkdirSync(path.join(tempRoot, ".codex"), { recursive: true });
  const result = installSkillToTargets({ sourceDir: source, homeDir: tempRoot });
  assert.equal(result.ok, true);
  assert.ok(fs.existsSync(path.join(tempRoot, ".codex", "skills", "vvilog-api", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(tempRoot, ".agents", "skills", "vvilog-api", "SKILL.md")));

  const available = listAvailableSkills({ sourceDir: source });
  assert.equal(available.items.length, 1);
  assert.equal(available.items[0].name, "vvilog-api");
  assert.equal(available.items[0].installed, true);
  assert.ok(available.items[0].installations.some((item) => item.agent === "codex" && item.installed));

  const doctorPayload = doctor({ sourceDir: source });
  assert.equal(doctorPayload.package, "vvilog");
  assert.ok(Array.isArray(doctorPayload.missingConfig));
  assert.ok(Array.isArray(doctorPayload.agents));

  const cliResult = await runCli(["--json", "init", "--source-dir", source], {
    env: { HOME: tempRoot, USERPROFILE: tempRoot },
  });
  assert.equal(cliResult.code, 0, cliResult.stderr);
  assert.equal(JSON.parse(cliResult.stdout).skill, "vvilog-api");

  const check = await runCli(["--json", "update", "--check", "--spec", "file:."], {
    env: process.env,
  });
  assert.equal(check.code, 0, check.stderr);
  assert.equal(JSON.parse(check.stdout).package, "vvilog");

  const removeResult = removeSkillFromTargets({ skill: "vvilog-api", homeDir: tempRoot });
  assert.equal(removeResult.ok, true);
  assert.ok(!fs.existsSync(path.join(tempRoot, ".codex", "skills", "vvilog-api", "SKILL.md")));

  fs.rmSync(tempRoot, { recursive: true, force: true });
  process.stdout.write("所有测试通过。\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
