# VviLog CLI

面向 Codex 和本机调试的 `vvilog` 命令。当前只保留配置、更新、Skills 管理和后端请求能力；业务分析、Adjust 等能力后续通过 skills 或 CLI 更新补充。

## 安装

```bash
cd /path/to/vvilog-cli
cargo build --release
```

也可以通过以下命令一键在线安装：

```bash
curl -fsSL https://raw.githubusercontent.com/liam798/vvilog-cli/main/install.sh | sh
```

## 配置

优先读取环境变量：

```bash
export VVILOG_API_KEY=clk_xxx
export VVILOG_API_BASE_URL=https://analytics.example.com/api
export VVILOG_MANAGE_BASE_URL=https://analytics.example.com/manage
export VVILOG_DEFAULT_PROJECT=demo
```

也可以写入 `~/.vvilog/config.toml`：

```bash
vvilog init \
  --api-key clk_xxx \
  --api-url https://analytics.example.com/api \
  --manage-url https://analytics.example.com/manage \
  --default-project demo
```

新版默认写入 TOML 配置；为了兼容旧版本，仍会在没有 TOML 文件时读取 `~/.vvilog/config.json`。

## JSON 策略

`--json` 下输出稳定 JSON。读接口默认透传服务端响应；CLI 自身错误输出：

```json
{
  "ok": false,
  "error": "错误说明",
  "status": 500,
  "body": {}
}
```

## 常用命令

```bash
vvilog update --dry-run
vvilog config show
vvilog skills list
vvilog skills find api
vvilog skills add vvilog-api --dry-run
vvilog --json api-request post /flow/getFlow --body '{"projectName":"demo"}'
vvilog --json manage-request get '/project/getlist?pageNum=1&pageSize=10'
```

## 后端请求

`vvilog api-request` 请求 `apiBaseUrl`，用于分析侧 API；`vvilog manage-request` 请求 `manageBaseUrl`，用于管理侧 API。两个命令都参考 MemHub CLI 的 raw request 形态：

```bash
vvilog api-request get /health
vvilog api-request post /flow/getFlow --body '{"projectName":"demo"}'
vvilog manage-request get '/project/getlist?pageNum=1&pageSize=10'
vvilog manage-request patch /project/demo --body-file ./payload.json
vvilog manage-request delete /project/demo
```

支持的方法：`get`、`post`、`put`、`patch`、`delete`。请求会自动带上 `x-api-key`，路径可以省略开头的 `/`。

## 更新

`vvilog update` 默认从公开 `vvilog-cli` GitHub Release 检查最新版本；版本相同则不安装，发现新版本时才下载 `install.sh` 并覆盖本机 `~/.local/bin/vvilog`。安装脚本下载对应平台的预编译二进制，不要求用户本地安装 Rust。更新命令只更新 CLI 二进制，不下载 skills；skills 由 `vvilog skills` 独立管理。

```bash
vvilog update --dry-run
vvilog update
vvilog update --force
vvilog update --url https://raw.githubusercontent.com/liam798/vvilog-cli/main/install.sh
```

## Skills

`vvilog skills` 默认从公开 `vvilog-skills` 仓库同步技能到 `~/.vvilog/skills`，并可安装到本机 Codex skills 目录：

```bash
vvilog skills list
vvilog skills find api
vvilog skills add vvilog-api
vvilog skills add --all
vvilog skills remove vvilog-api
```

默认安装目录为 `${CODEX_HOME:-~/.codex}/skills`。`add` 支持传技能名或本地技能目录；`--all` 安装全部已同步技能；已安装时需要加 `--force` 才会覆盖。需要使用本地 skills 源时，可设置 `VVILOG_SKILLS_DIR=/path/to/vvilog-skills`。
