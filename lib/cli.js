const { formatJson, formatText } = require("./formatter");
const { buildConfig, configToKeyValue, normalizeConfigValue } = require("./config");
const { VviLogCliError } = require("./errors");
const { requestCommand } = require("./request");
const { installAllSkillsToTargets, installSkillToTargets, listAvailableSkills, listInstalledVviLogSkills } = require("./skills");
const { updateVviLogCli } = require("./update");
const pkg = require("../package.json");

function rootHelp() {
  return `VviLog CLI

用法:
  vvilog [全局选项] <命令> [子命令] [选项]

全局选项:
  --json / --no-json
  -h, --help
  -V, --version

命令:
  init
  update
  config list|get|set|unset
  skills list|releases|find|add|remove
  api-request get|post|put|patch|delete
  manage-request get|post|put|patch|delete`;
}

function parseGlobalOptions(argv) {
  const options = {};
  const remaining = [];
  let parsingGlobals = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (parsingGlobals && !arg.startsWith("-")) {
      parsingGlobals = false;
      remaining.push(arg);
      continue;
    }
    if (!parsingGlobals) {
      remaining.push(arg);
      continue;
    }
    if (arg === "--json") {
      options.jsonOutput = true;
    } else if (arg === "--no-json") {
      options.jsonOutput = false;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else if (arg === "-V" || arg === "--version") {
      options.version = true;
    } else {
      throw new VviLogCliError(`未知全局选项: ${arg}`);
    }
  }
  return { options, remaining };
}

function parseOptions(argv, schema = {}) {
  const options = { _: [] };
  for (const [name, config] of Object.entries(schema)) {
    if (config.default !== undefined) {
      options[name] = config.default;
    }
    if (config.multiple) {
      options[name] = [];
    }
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }
    if (!arg.startsWith("-")) {
      options._.push(arg);
      continue;
    }
    const entry = Object.entries(schema).find(([, config]) => config.flag === arg || config.noFlag === arg);
    if (!entry) {
      throw new VviLogCliError(`未知选项: ${arg}`);
    }
    const [name, config] = entry;
    if (config.type === "boolean") {
      options[name] = arg === config.noFlag ? false : true;
      continue;
    }
    const value = argv[++index];
    if (value === undefined) {
      throw new VviLogCliError(`选项 ${arg} 缺少值。`);
    }
    if (config.multiple) {
      options[name].push(value);
    } else {
      options[name] = value;
    }
  }
  return options;
}

function emit(jsonOutput, payload) {
  process.stdout.write(`${jsonOutput ? formatJson(payload) : formatText(payload)}\n`);
}

async function main(argv) {
  const { options: globalOptions, remaining } = parseGlobalOptions(argv);
  if (globalOptions.version) {
    emit(Boolean(globalOptions.jsonOutput), globalOptions.jsonOutput ? { version: pkg.version } : pkg.version);
    return;
  }
  if (globalOptions.help || !remaining.length) {
    emit(Boolean(globalOptions.jsonOutput), rootHelp());
    return;
  }
  const jsonOutput = Boolean(globalOptions.jsonOutput);
  const [command, subcommand, ...rest] = remaining;
  if (command === "init") {
    const options = parseOptions([subcommand, ...rest].filter(Boolean), {
      sourceDir: { flag: "--source-dir" },
      target: { flag: "--target" },
      dryRun: { flag: "--dry-run", type: "boolean", default: false },
    });
    const payload = installSkillToTargets({
      skill: "vvilog-api",
      sourceDir: options.sourceDir,
      target: options.target,
      dryRun: options.dryRun,
    });
    emit(jsonOutput, payload);
    return;
  }
  if (command === "update") {
    const options = parseOptions([subcommand, ...rest].filter(Boolean), {
      checkOnly: { flag: "--check", type: "boolean", default: false },
      spec: { flag: "--spec" },
      verbose: { flag: "--verbose", type: "boolean", default: false },
    });
    emit(jsonOutput, updateVviLogCli(options));
    return;
  }
  if (command === "config") {
    await handleConfig(subcommand, rest, jsonOutput);
    return;
  }
  if (command === "skills") {
    await handleSkills(subcommand, rest, jsonOutput);
    return;
  }
  if (command === "api-request" || command === "manage-request") {
    await handleRequest(command === "api-request" ? "api" : "manage", subcommand, rest, jsonOutput);
    return;
  }
  throw new VviLogCliError(`未知命令: ${command}`);
}

async function handleConfig(subcommand, argv, jsonOutput) {
  const { config, store } = buildConfig();
  if (subcommand === "list" || !subcommand) {
    emit(jsonOutput, configToKeyValue(config));
    return;
  }
  if (subcommand === "get") {
    const [key] = argv;
    if (!key) throw new VviLogCliError("缺少配置项 key。");
    emit(jsonOutput, { key, value: configToKeyValue(config)[key] || "" });
    return;
  }
  const saved = store.load();
  if (subcommand === "set") {
    const [key, value] = argv;
    if (!key || value === undefined) throw new VviLogCliError("用法: vvilog config set <key> <value>");
    saved[key] = normalizeConfigValue(key, value);
    store.save(saved);
    emit(jsonOutput, { ok: true, key, value: saved[key], configPath: store.path });
    return;
  }
  if (subcommand === "unset") {
    const [key] = argv;
    if (!key) throw new VviLogCliError("缺少配置项 key。");
    delete saved[key];
    store.save(saved);
    emit(jsonOutput, { ok: true, key, configPath: store.path });
    return;
  }
  throw new VviLogCliError(`未知 config 子命令: ${subcommand}`);
}

async function handleSkills(subcommand, argv, jsonOutput) {
  if (subcommand === "list" || !subcommand) {
    emit(jsonOutput, listInstalledVviLogSkills());
    return;
  }
  if (subcommand === "releases") {
    emit(jsonOutput, listAvailableSkills());
    return;
  }
  if (subcommand === "find") {
    const [keyword] = argv;
    if (!keyword) throw new VviLogCliError("缺少搜索关键字。");
    const query = keyword.toLowerCase();
    const releases = listAvailableSkills();
    emit(jsonOutput, {
      ...releases,
      query,
      items: releases.items.filter((item) => item.name.toLowerCase().includes(query) || item.description.toLowerCase().includes(query)),
    });
    return;
  }
  if (subcommand === "add") {
    const options = parseOptions(argv, {
      all: { flag: "--all", type: "boolean", default: false },
      sourceDir: { flag: "--source-dir" },
      target: { flag: "--target" },
      dryRun: { flag: "--dry-run", type: "boolean", default: false },
    });
    if (options.all) {
      emit(jsonOutput, installAllSkillsToTargets({ sourceDir: options.sourceDir, target: options.target, dryRun: options.dryRun }));
      return;
    }
    const skill = options._[0] || "vvilog-api";
    emit(jsonOutput, installSkillToTargets({ skill, sourceDir: options.sourceDir, target: options.target, dryRun: options.dryRun }));
    return;
  }
  if (subcommand === "remove") {
    const [name] = argv;
    if (!name) throw new VviLogCliError("缺少 skill 名称。");
    const target = require("node:path").join(require("node:os").homedir(), ".codex", "skills", name);
    require("node:fs").rmSync(target, { recursive: true, force: true });
    emit(jsonOutput, { ok: true, name, target });
    return;
  }
  throw new VviLogCliError(`未知 skills 子命令: ${subcommand}`);
}

async function handleRequest(kind, method, argv, jsonOutput) {
  const normalizedMethod = String(method || "").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) {
    throw new VviLogCliError(`未知请求方法: ${method}`);
  }
  const options = parseOptions(argv, {
    body: { flag: "--body" },
    bodyFile: { flag: "--body-file" },
  });
  const path = options._[0];
  if (!path) {
    throw new VviLogCliError("缺少请求路径。");
  }
  emit(jsonOutput, await requestCommand(kind, normalizedMethod, { path, body: options.body, bodyFile: options.bodyFile }));
}

module.exports = {
  main,
  parseGlobalOptions,
  parseOptions,
};
