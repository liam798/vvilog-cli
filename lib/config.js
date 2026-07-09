const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { VviLogCliError } = require("./errors");

const CONFIG_KEYS = {
  api_key: {
    field: "apiKey",
    env: "VVILOG_API_KEY",
    secret: true,
    defaultValue: "",
  },
  api_base_url: {
    field: "apiBaseUrl",
    env: "VVILOG_API_BASE_URL",
    defaultValue: "",
    normalize: (value) => normalizeBaseUrl(value, "/api"),
  },
  manage_base_url: {
    field: "manageBaseUrl",
    env: "VVILOG_MANAGE_BASE_URL",
    defaultValue: "",
    normalize: (value) => normalizeBaseUrl(value, "/manage"),
  },
  default_project: {
    field: "defaultProject",
    env: "VVILOG_DEFAULT_PROJECT",
    defaultValue: "",
  },
};

function expandHome(inputPath) {
  if (!inputPath) {
    return inputPath;
  }
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

class JsonStore {
  constructor(configPath) {
    this.path = path.resolve(expandHome(configPath));
  }

  load() {
    if (!fs.existsSync(this.path)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(this.path, "utf8"));
  }

  save(payload) {
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    fs.writeFileSync(this.path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}

function defaultConfigPath() {
  return path.join(os.homedir(), ".config", "vvilog", "config.json");
}

function normalizeBaseUrl(value, suffix) {
  const trimmed = String(value || "").replace(/\/+$/, "");
  if (!trimmed || trimmed.endsWith(suffix)) {
    return trimmed;
  }
  return `${trimmed}${suffix}`;
}

function normalizeConfigValue(key, value) {
  const definition = CONFIG_KEYS[key];
  if (!definition) {
    throw new VviLogCliError(`未知配置项: ${key}`);
  }
  const text = String(value);
  return definition.normalize ? definition.normalize(text) : text;
}

function buildConfig(overrides = {}) {
  const store = new JsonStore(overrides.configPath || process.env.VVILOG_CONFIG || defaultConfigPath());
  const saved = store.load();
  const config = {
    configPath: store.path,
  };
  for (const [key, definition] of Object.entries(CONFIG_KEYS)) {
    const envValue = process.env[definition.env];
    const raw = overrides[definition.field] ?? envValue ?? saved[key] ?? saved[definition.field] ?? definition.defaultValue;
    config[definition.field] = definition.normalize ? definition.normalize(raw) : raw;
  }
  return { config, store };
}

function configValueSource(key, configPath = defaultConfigPath()) {
  const definition = CONFIG_KEYS[key];
  if (!definition) {
    throw new VviLogCliError(`未知配置项: ${key}`);
  }
  if (process.env[definition.env]) {
    return "env";
  }
  const store = new JsonStore(configPath);
  const saved = store.load();
  if (Object.prototype.hasOwnProperty.call(saved, key) || Object.prototype.hasOwnProperty.call(saved, definition.field)) {
    return "config";
  }
  return "missing";
}

function configToKeyValue(config, { maskSecrets = true } = {}) {
  const output = {};
  for (const [key, definition] of Object.entries(CONFIG_KEYS)) {
    const value = config[definition.field] || "";
    output[key] = definition.secret && maskSecrets ? maskSecret(value) : value;
  }
  return output;
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`;
  }
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
}

module.exports = {
  CONFIG_KEYS,
  JsonStore,
  buildConfig,
  configToKeyValue,
  configValueSource,
  defaultConfigPath,
  expandHome,
  maskSecret,
  normalizeBaseUrl,
  normalizeConfigValue,
};
