use anyhow::{anyhow, bail, Context, Result};
use clap::{Args, Parser, Subcommand};
use reqwest::blocking::Client;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const DEFAULT_CLI_INSTALL_URL: &str =
    "https://raw.githubusercontent.com/liam798/vvilog-cli/main/install.sh";
const DEFAULT_CLI_MANIFEST_URL: &str =
    "https://raw.githubusercontent.com/liam798/vvilog-cli/main/Cargo.toml";
const DEFAULT_SKILLS_REPO_URL: &str = "https://github.com/liam798/vvilog-skills.git";

#[derive(Parser)]
#[command(
    name = "vvilog",
    version,
    about = "VviLog 配置、更新、Skills 与 API 辅助 CLI"
)]
struct Cli {
    #[arg(long, global = true, help = "输出稳定 JSON")]
    json: bool,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    #[command(about = "写入本地配置")]
    Init(InitArgs),
    #[command(about = "更新本地 vvilog CLI")]
    Update(UpdateArgs),
    #[command(about = "配置命令")]
    Config(ConfigCommand),
    #[command(about = "管理技能")]
    Skills(SkillsCommand),
    #[command(about = "请求 VviLog 分析 API")]
    ApiRequest(RequestCommand),
    #[command(about = "请求 VviLog 管理 API")]
    ManageRequest(RequestCommand),
}

#[derive(Args)]
struct InitArgs {
    #[arg(long, help = "VviLog API Key")]
    api_key: String,
    #[arg(long, help = "分析 API 地址，可传基础域名或 /api 地址")]
    api_url: String,
    #[arg(long, help = "管理 API 地址，可传基础域名或 /manage 地址")]
    manage_url: String,
    #[arg(long, help = "默认项目编码")]
    default_project: Option<String>,
}

#[derive(Args)]
struct UpdateArgs {
    #[arg(
        long,
        help = "安装脚本 URL；不传时使用公开 vvilog-cli 仓库的 install.sh"
    )]
    url: Option<String>,
    #[arg(long, help = "只显示将执行的更新动作")]
    dry_run: bool,
    #[arg(long, help = "即使版本相同也强制重新安装")]
    force: bool,
}

#[derive(Args)]
struct ConfigCommand {
    #[command(subcommand)]
    command: ConfigCommands,
}

#[derive(Subcommand)]
enum ConfigCommands {
    #[command(about = "显示脱敏后的有效配置")]
    Show,
}

#[derive(Args)]
struct SkillsCommand {
    #[command(subcommand)]
    command: SkillsCommands,
}

#[derive(Subcommand)]
enum SkillsCommands {
    #[command(about = "安装技能")]
    Add(SkillsAddArgs),
    #[command(about = "移除技能")]
    Remove(SkillsRemoveArgs),
    #[command(about = "列出可用技能")]
    List(SkillsListArgs),
    #[command(about = "按关键字查找技能")]
    Find(SkillsFindArgs),
}

#[derive(Args)]
struct SkillsAddArgs {
    #[arg(help = "内置技能名或本地技能目录")]
    skill: Option<String>,
    #[arg(long, help = "安装全部内置技能")]
    all: bool,
    #[arg(long, help = "覆盖已安装技能")]
    force: bool,
    #[arg(long, help = "只显示将执行的安装动作")]
    dry_run: bool,
}

#[derive(Args)]
struct SkillsRemoveArgs {
    #[arg(help = "已安装技能名")]
    name: String,
    #[arg(long, help = "只显示将执行的移除动作")]
    dry_run: bool,
}

#[derive(Args)]
struct SkillsListArgs {
    #[arg(long, help = "只显示已安装的内置技能")]
    installed: bool,
}

#[derive(Args)]
struct SkillsFindArgs {
    #[arg(help = "搜索关键字")]
    keyword: String,
}

#[derive(Args)]
struct RequestCommand {
    #[command(subcommand)]
    command: RequestCommands,
}

#[derive(Subcommand)]
enum RequestCommands {
    #[command(about = "发送 GET 请求")]
    Get(RequestArgs),
    #[command(about = "发送 POST 请求")]
    Post(RequestArgs),
    #[command(about = "发送 PUT 请求")]
    Put(RequestArgs),
    #[command(about = "发送 PATCH 请求")]
    Patch(RequestArgs),
    #[command(about = "发送 DELETE 请求")]
    Delete(RequestArgs),
}

#[derive(Args)]
struct RequestArgs {
    #[arg(help = "API 路径，如 /flow/getFlow，可包含查询参数")]
    path: String,
    #[arg(long, help = "JSON 请求体字符串")]
    body: Option<String>,
    #[arg(long, help = "从文件读取 JSON 请求体")]
    body_file: Option<PathBuf>,
}

#[derive(Copy, Clone)]
enum RequestBase {
    Api,
    Manage,
}

#[derive(Default, Serialize, Deserialize, Clone)]
struct StoredConfig {
    #[serde(rename = "apiKey", default)]
    api_key: String,
    #[serde(rename = "apiBaseUrl", default)]
    api_base_url: String,
    #[serde(rename = "manageBaseUrl", default)]
    manage_base_url: String,
    #[serde(rename = "defaultProject", default)]
    default_project: String,
}

#[derive(Serialize, Clone)]
struct EffectiveConfig {
    api_key: String,
    api_base_url: String,
    manage_base_url: String,
    default_project: String,
}

fn main() {
    let cli = Cli::parse();
    if let Err(error) = run(cli) {
        if error.downcast_ref::<clap::Error>().is_none() {
            let payload = json!({
                "ok": false,
                "error": error.to_string()
            });
            if env::args().any(|arg| arg == "--json") {
                eprintln!("{}", serde_json::to_string_pretty(&payload).unwrap());
            } else {
                eprintln!("错误: {error}");
            }
        }
        std::process::exit(1);
    }
}

fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::Init(args) => init(args, cli.json),
        Commands::Update(args) => update(args, cli.json),
        Commands::Config(cmd) => match cmd.command {
            ConfigCommands::Show => config_show(cli.json),
        },
        Commands::Skills(cmd) => match cmd.command {
            SkillsCommands::Add(args) => skills_add(args, cli.json),
            SkillsCommands::Remove(args) => skills_remove(args, cli.json),
            SkillsCommands::List(args) => skills_list(args, cli.json),
            SkillsCommands::Find(args) => skills_find(args, cli.json),
        },
        Commands::ApiRequest(cmd) => request_command(RequestBase::Api, cmd, cli.json),
        Commands::ManageRequest(cmd) => request_command(RequestBase::Manage, cmd, cli.json),
    }
}

fn init(args: InitArgs, json_output: bool) -> Result<()> {
    let stored = StoredConfig {
        api_key: args.api_key,
        api_base_url: normalize_base_url(&args.api_url, "/api"),
        manage_base_url: normalize_base_url(&args.manage_url, "/manage"),
        default_project: args.default_project.unwrap_or_default(),
        ..StoredConfig::default()
    };
    let path = config_toml_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, toml::to_string_pretty(&stored)?)?;
    output(
        json!({
            "ok": true,
            "configPath": path,
            "config": masked_config(&stored),
        }),
        json_output,
    )
}

fn update(args: UpdateArgs, json_output: bool) -> Result<()> {
    let url = args
        .url
        .unwrap_or_else(|| DEFAULT_CLI_INSTALL_URL.to_string());
    let version_url = cli_manifest_url_from_install_url(&url);
    let command = format!("download {url} and run with sh");
    if args.dry_run {
        return output(
            json!({
                "ok": true,
                "dryRun": true,
                "url": url,
                "versionUrl": version_url,
                "command": command,
            }),
            json_output,
        );
    }
    if !json_output {
        println!("Checking for updates...");
    }
    let client = Client::builder().build()?;
    let latest_version = remote_cli_version(&client, &version_url)?;
    if latest_version == VERSION && !args.force {
        if json_output {
            return output(
                json!({
                    "ok": true,
                    "status": "up_to_date",
                    "currentVersion": VERSION,
                    "latestVersion": latest_version,
                    "url": url,
                    "versionUrl": version_url,
                }),
                true,
            );
        }
        println!("Already up-to-date with version {VERSION}.");
        return Ok(());
    }
    if !json_output {
        if latest_version == VERSION && args.force {
            println!("Version {VERSION} is already installed; forcing reinstall...");
        } else {
            println!("Updating VviLog CLI from {VERSION} to {latest_version}...");
        }
    }
    let response = client
        .get(&url)
        .send()
        .with_context(|| format!("下载安装脚本失败: {url}"))?;
    let status_code = response.status();
    if !status_code.is_success() {
        bail!("下载安装脚本失败: HTTP {}", status_code.as_u16());
    }
    let script = response.text().context("读取安装脚本失败")?;
    let mut child = Command::new("sh")
        .arg("-s")
        .env("VVILOG_INSTALL_MODE", "update")
        .stdin(Stdio::piped())
        .stdout(if json_output {
            Stdio::piped()
        } else {
            Stdio::inherit()
        })
        .stderr(if json_output {
            Stdio::piped()
        } else {
            Stdio::inherit()
        })
        .spawn()
        .with_context(|| "启动安装脚本失败")?;
    child
        .stdin
        .as_mut()
        .context("打开安装脚本 stdin 失败")?
        .write_all(script.as_bytes())
        .context("写入安装脚本失败")?;
    let result = child
        .wait_with_output()
        .with_context(|| "执行安装脚本失败")?;
    if json_output {
        output(
            json!({
                "ok": result.status.success(),
                "status": if result.status.success() { "updated" } else { "failed" },
                "currentVersion": VERSION,
                "latestVersion": latest_version,
                "url": url,
                "versionUrl": version_url,
                "command": command,
                "exitCode": result.status.code(),
                "stdout": String::from_utf8_lossy(&result.stdout),
                "stderr": String::from_utf8_lossy(&result.stderr),
            }),
            true,
        )?;
    }
    if !result.status.success() {
        bail!("update failed");
    }
    if !json_output {
        if latest_version == VERSION && args.force {
            println!("Reinstalled VviLog CLI {latest_version}.");
        } else {
            println!("Updated VviLog CLI to version {latest_version}.");
        }
    }
    Ok(())
}

fn config_show(json_output: bool) -> Result<()> {
    let config = load_effective_config()?;
    output(
        json!({
            "apiKey": mask_secret(&config.api_key),
            "apiBaseUrl": config.api_base_url,
            "manageBaseUrl": config.manage_base_url,
            "defaultProject": config.default_project,
        }),
        json_output,
    )
}

fn request_command(base: RequestBase, cmd: RequestCommand, json_output: bool) -> Result<()> {
    match cmd.command {
        RequestCommands::Get(args) => request_call(base, Method::GET, args, json_output),
        RequestCommands::Post(args) => request_call(base, Method::POST, args, json_output),
        RequestCommands::Put(args) => request_call(base, Method::PUT, args, json_output),
        RequestCommands::Patch(args) => request_call(base, Method::PATCH, args, json_output),
        RequestCommands::Delete(args) => request_call(base, Method::DELETE, args, json_output),
    }
}

fn request_call(
    base_kind: RequestBase,
    method: Method,
    args: RequestArgs,
    json_output: bool,
) -> Result<()> {
    let required = match base_kind {
        RequestBase::Api => ["api_key", "api_base_url"],
        RequestBase::Manage => ["api_key", "manage_base_url"],
    };
    let config = require_config(&required)?;
    let base = match base_kind {
        RequestBase::Api => config.api_base_url,
        RequestBase::Manage => config.manage_base_url,
    };
    let body = request_body(args.body, args.body_file)?;
    let path = normalize_request_path(&args.path);
    let value = request_json(&method, &format!("{base}{path}"), &config.api_key, body)?;
    output(value, json_output)
}

fn skills_list(args: SkillsListArgs, json_output: bool) -> Result<()> {
    let skills = list_bundled_skills()?;
    let items: Vec<_> = skills
        .into_iter()
        .filter(|skill| !args.installed || skill.installed)
        .collect();
    output(
        json!({
            "bundledSkillsDir": bundled_skills_dir(),
            "installedSkillsDir": installed_skills_dir(),
            "items": items,
        }),
        json_output,
    )
}

fn skills_find(args: SkillsFindArgs, json_output: bool) -> Result<()> {
    let query = args.keyword.to_lowercase();
    let items: Vec<_> = list_bundled_skills()?
        .into_iter()
        .filter(|skill| {
            let path = skill.path.to_string_lossy();
            skill.name.to_lowercase().contains(&query)
                || skill.description.to_lowercase().contains(&query)
                || path.to_lowercase().contains(&query)
        })
        .collect();
    output(
        json!({
            "query": query,
            "bundledSkillsDir": bundled_skills_dir(),
            "installedSkillsDir": installed_skills_dir(),
            "items": items,
        }),
        json_output,
    )
}

fn skills_add(args: SkillsAddArgs, json_output: bool) -> Result<()> {
    if args.all {
        let items: Result<Vec<_>> = list_bundled_skills()?
            .iter()
            .map(|skill| install_skill(&skill.path, args.force, args.dry_run))
            .collect();
        let items = items?;
        return output(
            json!({
                "ok": items.iter().all(|item| item["ok"].as_bool().unwrap_or(false)),
                "dryRun": args.dry_run,
                "all": true,
                "bundledSkillsDir": bundled_skills_dir(),
                "installedSkillsDir": installed_skills_dir(),
                "items": items,
            }),
            json_output,
        );
    }
    let skill = args
        .skill
        .ok_or_else(|| anyhow!("缺少参数: <skill> 或 --all"))?;
    let source = resolve_skill_source(&skill)?;
    let value = install_skill(&source, args.force, args.dry_run)?;
    output(value, json_output)
}

fn skills_remove(args: SkillsRemoveArgs, json_output: bool) -> Result<()> {
    let target = installed_skills_dir().join(&args.name);
    let existed = target.exists();
    if !args.dry_run && existed {
        fs::remove_dir_all(&target)?;
    }
    output(
        json!({
            "ok": true,
            "dryRun": args.dry_run,
            "name": args.name,
            "target": target,
            "existed": existed,
        }),
        json_output,
    )
}

fn request_body(body: Option<String>, body_file: Option<PathBuf>) -> Result<Option<Value>> {
    match (body, body_file) {
        (Some(_), Some(_)) => bail!("--body 和 --body-file 只能使用一个"),
        (Some(value), None) => Ok(Some(
            serde_json::from_str(&value).context("--body 不是合法 JSON")?,
        )),
        (None, Some(path)) => {
            let content = fs::read_to_string(&path)
                .with_context(|| format!("读取请求体文件失败: {}", path.display()))?;
            Ok(Some(
                serde_json::from_str(&content).context("--body-file 不是合法 JSON")?,
            ))
        }
        (None, None) => Ok(None),
    }
}

fn normalize_request_path(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

fn request_json(method: &Method, url: &str, api_key: &str, body: Option<Value>) -> Result<Value> {
    let client = Client::builder().build()?;
    let mut request = client
        .request(method.clone(), url)
        .header("x-api-key", api_key);
    if let Some(body) = body {
        request = request
            .header("content-type", "application/json")
            .json(&body);
    }
    let response = request.send().with_context(|| format!("请求失败: {url}"))?;
    let status = response.status();
    let text = response.text().context("读取响应失败")?;
    let value: Value = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str(&text).unwrap_or_else(|_| {
            json!({
                "status": status.as_u16(),
                "body": text,
            })
        })
    };
    if !status.is_success() {
        bail!("HTTP {}: {}", status.as_u16(), value);
    }
    Ok(value)
}

fn cli_manifest_url_from_install_url(url: &str) -> String {
    if url == DEFAULT_CLI_INSTALL_URL {
        return DEFAULT_CLI_MANIFEST_URL.to_string();
    }
    if let Some((base, filename)) = url.rsplit_once('/') {
        if filename == "install.sh" {
            return format!("{base}/Cargo.toml");
        }
    }
    DEFAULT_CLI_MANIFEST_URL.to_string()
}

fn remote_cli_version(client: &Client, url: &str) -> Result<String> {
    let content = download_text(client, url)?;
    let value: toml::Value = toml::from_str(&content).context("解析远端 Cargo.toml 失败")?;
    value
        .get("package")
        .and_then(|package| package.get("version"))
        .and_then(|version| version.as_str())
        .map(ToString::to_string)
        .filter(|version| !version.is_empty())
        .ok_or_else(|| anyhow!("无法解析远端 CLI 版本"))
}

fn download_text(client: &Client, url: &str) -> Result<String> {
    let response = client
        .get(url)
        .send()
        .with_context(|| format!("下载失败: {url}"))?;
    let status = response.status();
    if !status.is_success() {
        bail!("下载失败: HTTP {}", status.as_u16());
    }
    response.text().context("读取下载内容失败")
}

fn load_effective_config() -> Result<EffectiveConfig> {
    let file = load_stored_config()?;
    Ok(EffectiveConfig {
        api_key: env::var("VVILOG_API_KEY").unwrap_or_else(|_| file.api_key.clone()),
        api_base_url: normalize_base_url(
            &env::var("VVILOG_API_BASE_URL").unwrap_or_else(|_| file.api_base_url.clone()),
            "/api",
        ),
        manage_base_url: normalize_base_url(
            &env::var("VVILOG_MANAGE_BASE_URL").unwrap_or_else(|_| file.manage_base_url.clone()),
            "/manage",
        ),
        default_project: env::var("VVILOG_DEFAULT_PROJECT")
            .unwrap_or_else(|_| file.default_project.clone()),
    })
}

fn require_config(fields: &[&str]) -> Result<EffectiveConfig> {
    let config = load_effective_config()?;
    for field in fields {
        match *field {
            "api_key" if config.api_key.is_empty() => bail!("缺少配置: apiKey"),
            "api_base_url" if config.api_base_url.is_empty() => bail!("缺少配置: apiBaseUrl"),
            "manage_base_url" if config.manage_base_url.is_empty() => {
                bail!("缺少配置: manageBaseUrl")
            }
            _ => {}
        }
    }
    Ok(config)
}

fn load_stored_config() -> Result<StoredConfig> {
    let toml_path = config_toml_path();
    if toml_path.exists() {
        let content = fs::read_to_string(&toml_path)?;
        return Ok(toml::from_str(&content)?);
    }
    let json_path = config_json_path();
    if json_path.exists() {
        let content = fs::read_to_string(&json_path)?;
        return Ok(serde_json::from_str(&content)?);
    }
    Ok(StoredConfig::default())
}

fn home_dir() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn config_dir() -> PathBuf {
    home_dir().join(".vvilog")
}

fn config_toml_path() -> PathBuf {
    config_dir().join("config.toml")
}

fn config_json_path() -> PathBuf {
    config_dir().join("config.json")
}

fn bundled_skills_dir() -> PathBuf {
    if let Some(path) = env::var_os("VVILOG_SKILLS_DIR") {
        return PathBuf::from(path);
    }
    config_dir().join("skills")
}

fn installed_skills_dir() -> PathBuf {
    env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join(".codex"))
        .join("skills")
}

#[derive(Serialize, Clone)]
struct SkillInfo {
    name: String,
    description: String,
    path: PathBuf,
    installed: bool,
    #[serde(rename = "installedPath")]
    installed_path: PathBuf,
}

fn list_bundled_skills() -> Result<Vec<SkillInfo>> {
    ensure_skills_cache()?;
    let root = bundled_skills_dir();
    if !root.exists() {
        return Ok(Vec::new());
    }
    let mut items = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let skill_dir = entry.path();
        let skill_file = skill_dir.join("SKILL.md");
        if !skill_file.exists() {
            continue;
        }
        let meta = read_skill_metadata(&skill_file)?;
        let name = meta
            .get("name")
            .cloned()
            .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
        let installed_path = installed_skills_dir().join(&name);
        items.push(SkillInfo {
            name,
            description: meta.get("description").cloned().unwrap_or_default(),
            path: skill_dir,
            installed: installed_path.exists(),
            installed_path,
        });
    }
    items.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(items)
}

fn resolve_skill_source(input: &str) -> Result<PathBuf> {
    ensure_skills_cache()?;
    let candidates = [PathBuf::from(input), bundled_skills_dir().join(input)];
    for candidate in candidates {
        let path = if candidate.is_absolute() {
            candidate
        } else {
            env::current_dir()?.join(candidate)
        };
        if path.join("SKILL.md").exists() {
            return Ok(path);
        }
    }
    bail!("找不到技能: {input}")
}

fn ensure_skills_cache() -> Result<()> {
    if env::var_os("VVILOG_SKILLS_DIR").is_some() {
        return Ok(());
    }
    let root = bundled_skills_dir();
    if root.join(".git").exists() || root.join("vvilog-api/SKILL.md").exists() {
        return Ok(());
    }
    if root.exists() {
        bail!(
            "skills 缓存目录已存在但不是有效的 vvilog-skills 仓库: {}",
            root.display()
        );
    }
    if let Some(parent) = root.parent() {
        fs::create_dir_all(parent)?;
    }
    let status = Command::new("git")
        .args(["clone", "--depth", "1", DEFAULT_SKILLS_REPO_URL])
        .arg(&root)
        .status()
        .with_context(|| "同步 skills 失败：缺少 git 或无法启动 git clone")?;
    if !status.success() {
        bail!("同步 skills 失败: git clone 退出码 {:?}", status.code());
    }
    Ok(())
}

fn read_skill_metadata(path: &Path) -> Result<std::collections::BTreeMap<String, String>> {
    let content = fs::read_to_string(path)?;
    let mut map = std::collections::BTreeMap::new();
    let Some(rest) = content.strip_prefix("---\n") else {
        return Ok(map);
    };
    let Some((frontmatter, _)) = rest.split_once("\n---") else {
        return Ok(map);
    };
    for line in frontmatter.lines() {
        if let Some((key, value)) = line.split_once(':') {
            map.insert(
                key.trim().to_string(),
                value
                    .trim()
                    .trim_matches('"')
                    .trim_matches('\'')
                    .to_string(),
            );
        }
    }
    Ok(map)
}

fn install_skill(source: &Path, force: bool, dry_run: bool) -> Result<Value> {
    let meta = read_skill_metadata(&source.join("SKILL.md"))?;
    let name = meta.get("name").cloned().unwrap_or_else(|| {
        source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    });
    let target = installed_skills_dir().join(&name);
    let exists = target.exists();
    if exists && !force {
        return Ok(json!({
            "ok": true,
            "skipped": true,
            "reason": "already_installed",
            "name": name,
            "source": source,
            "target": target,
            "overwritten": false,
        }));
    }
    if !dry_run {
        if exists {
            fs::remove_dir_all(&target)?;
        }
        copy_dir(source, &target)?;
    }
    Ok(json!({
        "ok": true,
        "dryRun": dry_run,
        "name": name,
        "source": source,
        "target": target,
        "overwritten": exists,
    }))
}

fn copy_dir(source: &Path, target: &Path) -> Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        if entry.file_name() == ".DS_Store" {
            continue;
        }
        let from = entry.path();
        let to = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&from, &to)?;
        } else if entry.file_type()?.is_file() {
            fs::copy(&from, &to)?;
        }
    }
    Ok(())
}

fn masked_config(config: &StoredConfig) -> Value {
    json!({
        "apiKey": mask_secret(&config.api_key),
        "apiBaseUrl": config.api_base_url,
        "manageBaseUrl": config.manage_base_url,
        "defaultProject": config.default_project,
    })
}

fn normalize_base_url(value: &str, suffix: &str) -> String {
    let url = trim_trailing_slash(value);
    if url.is_empty() || url.ends_with(suffix) {
        url
    } else {
        format!("{url}{suffix}")
    }
}

fn trim_trailing_slash(value: &str) -> String {
    value.trim_end_matches('/').to_string()
}

fn mask_secret(value: &str) -> String {
    if value.is_empty() {
        return String::new();
    }
    if value.len() <= 8 {
        return format!("{}***", &value[..value.len().min(2)]);
    }
    format!("{}...{}", &value[..6], &value[value.len() - 4..])
}

fn output(value: Value, json_output: bool) -> Result<()> {
    if json_output {
        println!("{}", serde_json::to_string_pretty(&value)?);
    } else if let Some(s) = value.as_str() {
        println!("{s}");
    } else {
        println!("{}", serde_json::to_string_pretty(&value)?);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_secret() {
        assert_eq!(mask_secret("clk_1234567890"), "clk_12...7890");
    }

    #[test]
    fn normalizes_base_urls() {
        assert_eq!(
            normalize_base_url("https://example.com", "/api"),
            "https://example.com/api"
        );
        assert_eq!(
            normalize_base_url("https://example.com/api", "/api"),
            "https://example.com/api"
        );
    }

    #[test]
    fn normalizes_request_paths() {
        assert_eq!(
            normalize_request_path("project/getlist"),
            "/project/getlist"
        );
        assert_eq!(
            normalize_request_path("/project/getlist"),
            "/project/getlist"
        );
    }

    #[test]
    fn rejects_multiple_request_body_sources() {
        let error = request_body(Some("{}".to_string()), Some(PathBuf::from("payload.json")))
            .expect_err("body and body_file should be mutually exclusive");
        assert!(error.to_string().contains("只能使用一个"));
    }
}
