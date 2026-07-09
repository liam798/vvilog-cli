const { buildConfig } = require("./config");
const { VviLogCliError } = require("./errors");

function normalizeRequestPath(value) {
  return String(value || "").startsWith("/") ? value : `/${value}`;
}

async function requestCommand(kind, method, args) {
  const { config } = buildConfig();
  if (!config.apiKey) {
    throw new VviLogCliError("缺少配置: api_key");
  }
  const base = kind === "api" ? config.apiBaseUrl : config.manageBaseUrl;
  if (!base) {
    throw new VviLogCliError(`缺少配置: ${kind === "api" ? "api_base_url" : "manage_base_url"}`);
  }
  const body = args.bodyFile ? require("node:fs").readFileSync(args.bodyFile, "utf8") : args.body;
  const response = await fetch(`${base}${normalizeRequestPath(args.path)}`, {
    method,
    headers: {
      "x-api-key": config.apiKey,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body || undefined,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = { status: response.status, body: text };
  }
  if (!response.ok) {
    throw new VviLogCliError(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

module.exports = {
  normalizeRequestPath,
  requestCommand,
};
