const { spawnSync } = require("node:child_process");
const { buildConfig, configToKeyValue, configValueSource } = require("./config");
const { discoverAgentSkillTargets, listInstalledVviLogSkills } = require("./skills");
const pkg = require("../package.json");

function commandExists(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return {
    available: result.status === 0,
    version: result.status === 0 ? String(result.stdout || result.stderr || "").trim().split(/\r?\n/)[0] : "",
  };
}

function doctor(options = {}) {
  const { config } = buildConfig();
  const configView = configToKeyValue(config);
  const required = ["api_key", "api_base_url", "manage_base_url"];
  const missing = required.filter((key) => !configView[key]);
  const installedSkills = safeInstalledSkills(options);
  const agents = discoverAgentSkillTargets().map((target) => ({
    agent: target.agent,
    detected: target.detected,
    skillsDir: target.path,
  }));
  return {
    ok: missing.length === 0,
    package: pkg.name,
    version: pkg.version,
    node: commandExists("node"),
    npm: commandExists("npm"),
    git: commandExists("git"),
    configPath: config.configPath,
    config: configView,
    configSources: Object.fromEntries(
      Object.keys(configView).map((key) => [key, configValueSource(key, config.configPath)]),
    ),
    missingConfig: missing,
    skills: {
      installed: installedSkills.items,
      installedCount: installedSkills.items.length,
      source: installedSkills.source,
    },
    agents,
    nextSteps: missing.length
      ? [
        "vvilog config set api_key <key>",
        "vvilog config set api_base_url https://example.com/api",
        "vvilog config set manage_base_url https://example.com/manage",
      ]
      : [],
  };
}

function safeInstalledSkills(options) {
  try {
    return listInstalledVviLogSkills(options);
  } catch (error) {
    return {
      ok: false,
      source: null,
      error: error.message,
      items: [],
    };
  }
}

module.exports = {
  doctor,
};
