const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { expandHome } = require("./config");
const { VviLogCliError } = require("./errors");

const DEFAULT_SKILLS_REPO = "https://github.com/liam798/vvilog-skills.git";
const DEFAULT_SKILLS_REF = "main";

const AGENT_SKILL_TARGETS = [
  { agent: "codex", home: ".codex", skills: ["skills"] },
  { agent: "cursor", home: ".cursor", skills: ["skills"] },
  { agent: "trae", home: ".trae", skills: ["skills"] },
  { agent: "claude-code", home: ".claude", skills: ["skills"] },
  { agent: "gemini", home: ".gemini", skills: ["skills"] },
  { agent: "kiro", home: ".kiro", skills: ["skills"] },
  { agent: "openclaw", home: ".openclaw", skills: ["skills"] },
  { agent: "opencode", home: ".config/opencode", skills: ["skills"] },
  { agent: "windsurf", home: ".codeium/windsurf", skills: ["skills"] },
];

function copyDir(sourceDir, targetDir) {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });
  fs.cpSync(sourceDir, targetDir, {
    recursive: true,
    filter: (source) => {
      const base = path.basename(source);
      return base !== ".git" && base !== ".DS_Store" && base !== "node_modules";
    },
  });
}

function parseSkillMetadata(skillFile) {
  if (!fs.existsSync(skillFile)) {
    return {};
  }
  const content = fs.readFileSync(skillFile, "utf8");
  if (!content.startsWith("---\n")) {
    return {};
  }
  const end = content.indexOf("\n---", 4);
  if (end < 0) {
    return {};
  }
  const lines = content.slice(4, end).split(/\r?\n/);
  const meta = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const colon = line.indexOf(":");
    if (colon < 0) {
      continue;
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ([">", ">-", "|", "|-"].includes(value)) {
      const parts = [];
      while (lines[index + 1] && /^\s/.test(lines[index + 1])) {
        index += 1;
        parts.push(lines[index].trim());
      }
      value = parts.join(" ");
    } else {
      value = value.replace(/^["']|["']$/g, "");
    }
    meta[key] = value;
  }
  return meta;
}

function cloneSkillsRepo(options = {}) {
  const gitCheck = spawnSync("git", ["--version"], { encoding: "utf8" });
  if (gitCheck.status !== 0) {
    throw new VviLogCliError("未找到 git，无法下载 vvilog-skills。请安装 git 或使用 --source-dir 指定本地 skills 目录。");
  }
  const checkoutDir = fs.mkdtempSync(path.join(options.tempRoot || os.tmpdir(), "vvilog-skills-"));
  const result = spawnSync("git", ["clone", "--depth", "1", "--branch", options.ref || DEFAULT_SKILLS_REF, options.repo || DEFAULT_SKILLS_REPO, checkoutDir], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    fs.rmSync(checkoutDir, { recursive: true, force: true });
    throw new VviLogCliError(`下载 vvilog-skills 失败：${result.stderr || result.stdout || "unknown error"}`);
  }
  return checkoutDir;
}

function withSkillsSource(options, callback) {
  const sourceDir = options.sourceDir || process.env.VVILOG_SKILLS_SOURCE_DIR;
  const resolvedSource = sourceDir ? path.resolve(expandHome(sourceDir)) : null;
  const checkoutDir = resolvedSource ? null : cloneSkillsRepo(options);
  const root = resolvedSource || checkoutDir;
  try {
    return callback(root, resolvedSource || options.repo || DEFAULT_SKILLS_REPO);
  } finally {
    if (checkoutDir) {
      fs.rmSync(checkoutDir, { recursive: true, force: true });
    }
  }
}

function listAvailableSkills(options = {}) {
  const homeDir = options.homeDir ? path.resolve(expandHome(options.homeDir)) : os.homedir();
  const targets = discoverAgentSkillTargets(homeDir);
  return withSkillsSource(options, (root, source) => {
    const items = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const skillDir = path.join(root, entry.name);
        const skillFile = path.join(skillDir, "SKILL.md");
        if (!fs.existsSync(skillFile)) {
          return null;
        }
        const meta = parseSkillMetadata(skillFile);
        const name = meta.name || entry.name;
        const installations = targets.map((target) => ({
          agent: target.agent,
          detected: target.detected,
          skillsDir: target.path,
          installPath: path.join(target.path, name),
          installed: fs.existsSync(path.join(target.path, name, "SKILL.md")),
        }));
        const primary = installations.find((item) => item.agent === "codex") || installations[0];
        return {
          name,
          description: meta.description || "",
          path: skillDir,
          installed: installations.some((item) => item.installed),
          installedPath: primary ? primary.installPath : path.join(defaultAgentSkillsDir(homeDir), name),
          installations,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ok: true, source, items };
  });
}

function defaultAgentSkillsDir(homeDir = os.homedir()) {
  if (process.env.CODEX_HOME) {
    return path.join(process.env.CODEX_HOME, "skills");
  }
  return path.join(homeDir, ".codex", "skills");
}

function discoverAgentSkillTargets(homeDir = os.homedir()) {
  const targets = [];
  for (const item of AGENT_SKILL_TARGETS) {
    const agentHome = path.join(homeDir, item.home);
    if (!fs.existsSync(agentHome)) {
      continue;
    }
    targets.push({
      agent: item.agent,
      path: path.join(agentHome, ...item.skills),
      detected: true,
    });
  }
  targets.push({
    agent: "fallback",
    path: path.join(homeDir, ".agents", "skills"),
    detected: false,
  });
  return targets;
}

function resolveSkillDir(root, name) {
  const direct = path.join(root, name);
  if (fs.existsSync(path.join(direct, "SKILL.md"))) {
    return direct;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const skillDir = path.join(root, entry.name);
    const meta = parseSkillMetadata(path.join(skillDir, "SKILL.md"));
    if (meta.name === name) {
      return skillDir;
    }
  }
  throw new VviLogCliError(`未找到 VviLog skill: ${name}`);
}

function installSkillToTargets(options = {}) {
  const skillName = options.skill || "vvilog-api";
  const homeDir = options.homeDir ? path.resolve(expandHome(options.homeDir)) : os.homedir();
  const dryRun = Boolean(options.dryRun);
  return withSkillsSource(options, (root, source) => {
    const skillDir = resolveSkillDir(root, skillName);
    const meta = parseSkillMetadata(path.join(skillDir, "SKILL.md"));
    const name = meta.name || path.basename(skillDir);
    const targets = options.target
      ? [{ agent: "custom", path: path.resolve(expandHome(options.target)), detected: true }]
      : discoverAgentSkillTargets(homeDir);
    const installations = [];
    for (const target of targets) {
      const installPath = path.join(target.path, name);
      if (!dryRun) {
        copyDir(skillDir, installPath);
      }
      installations.push({
        agent: target.agent,
        detected: target.detected,
        skillsDir: target.path,
        installPath,
        installed: !dryRun,
      });
    }
    return {
      ok: true,
      source,
      skill: name,
      dryRun,
      fallbackUsed: installations.some((item) => item.agent === "fallback"),
      installations,
    };
  });
}

function installAllSkillsToTargets(options = {}) {
  return withSkillsSource(options, (root, source) => {
    const skills = fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(root, entry.name))
      .filter((skillDir) => fs.existsSync(path.join(skillDir, "SKILL.md")));
    const items = skills.map((skillDir) => {
      const meta = parseSkillMetadata(path.join(skillDir, "SKILL.md"));
      return installSkillToTargets({
        ...options,
        sourceDir: root,
        skill: meta.name || path.basename(skillDir),
      });
    });
    return {
      ok: items.every((item) => item.ok),
      source,
      all: true,
      dryRun: Boolean(options.dryRun),
      items,
    };
  });
}

function listInstalledVviLogSkills(options = {}) {
  const available = listAvailableSkills(options);
  return {
    ok: true,
    source: available.source,
    items: available.items.filter((item) => item.installed),
  };
}

function removeSkillFromTargets(options = {}) {
  const skillName = options.skill || "vvilog-api";
  const homeDir = options.homeDir ? path.resolve(expandHome(options.homeDir)) : os.homedir();
  const dryRun = Boolean(options.dryRun);
  const targets = options.target
    ? [{ agent: "custom", path: path.resolve(expandHome(options.target)), detected: true }]
    : discoverAgentSkillTargets(homeDir);
  const removals = targets.map((target) => {
    const installPath = path.join(target.path, skillName);
    const existed = fs.existsSync(installPath);
    if (!dryRun && existed) {
      fs.rmSync(installPath, { recursive: true, force: true });
    }
    return {
      agent: target.agent,
      detected: target.detected,
      skillsDir: target.path,
      installPath,
      existed,
      removed: existed && !dryRun,
    };
  });
  return {
    ok: true,
    skill: skillName,
    dryRun,
    removals,
  };
}

module.exports = {
  AGENT_SKILL_TARGETS,
  DEFAULT_SKILLS_REF,
  DEFAULT_SKILLS_REPO,
  cloneSkillsRepo,
  discoverAgentSkillTargets,
  installAllSkillsToTargets,
  installSkillToTargets,
  listAvailableSkills,
  listInstalledVviLogSkills,
  parseSkillMetadata,
  removeSkillFromTargets,
};
