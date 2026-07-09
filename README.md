# VviLog CLI

面向 AI Agent、工程师和本机调试的一方 Node CLI。当前保留配置、更新、Skills 管理和后端请求能力；业务分析、Adjust 等能力通过 skills 或后续 CLI 更新补充。

## 安装

```bash
npm install -g git+https://github.com/liam798/vvilog-cli.git
```

也可以通过以下命令一键在线安装：

```bash
curl -fsSL https://raw.githubusercontent.com/liam798/vvilog-cli/main/install.sh | sh
```

开发者本地安装：

```bash
cd /path/to/vvilog-cli
npm install -g .
```

## 配置

优先读取环境变量：

```bash
export VVILOG_API_KEY=clk_xxx
export VVILOG_API_BASE_URL=https://analytics.example.com/api
export VVILOG_MANAGE_BASE_URL=https://analytics.example.com/manage
export VVILOG_DEFAULT_PROJECT=demo
```

也可以写入 `~/.config/vvilog/config.json`：

```bash
vvilog config set api_key clk_xxx
vvilog config set api_base_url https://analytics.example.com/api
vvilog config set manage_base_url https://analytics.example.com/manage
vvilog config set default_project demo
```

`init` 用于初始化 Agent skills，不写服务配置。

## JSON 策略

`--json` 下输出稳定 JSON。读接口默认透传服务端响应；CLI 自身错误输出：

```json
{
  "ok": false,
  "error": {
    "type": "VviLogCliError",
    "message": "错误说明"
  }
}
```

## 常用命令

```bash
vvilog --json doctor
vvilog update --check
vvilog config list
vvilog init
vvilog skills list
vvilog skills releases
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

`vvilog update` 参考 `testclaw-cli`，默认通过 npm 从公开 GitHub 仓库检查并更新：

```bash
vvilog update --check
vvilog update
vvilog update --spec git+https://github.com/liam798/vvilog-cli.git
```

更新命令只更新 CLI 包，不自动安装 skills；skills 由 `vvilog init` 或 `vvilog skills add` 管理。

## 诊断

`doctor` 只检查环境和配置，不写配置、不安装 skills。缺少配置时会返回 `missingConfig` 和建议命令：

```bash
vvilog --json doctor
```

`doctor` 会检查：

- Node/npm/git 是否可用
- CLI 版本
- `api_key`、`api_base_url`、`manage_base_url` 是否配置
- VviLog skills 在各 Agent 目录中的安装状态
- 已检测到的 Agent skills 目录

## Skills

`vvilog skills` 用于查看和安装 VviLog skills。`list` 只列出已安装到当前 Codex Agent 的 VviLog 技能，`releases` 在线查询公开 `vvilog-skills` 仓库并列出全部可用技能：

```bash
vvilog skills list              # 已安装技能
vvilog skills releases          # 全部可用技能
vvilog skills find api          # 按关键字搜索可用技能
vvilog skills add vvilog-api    # 安装指定技能
vvilog skills add --all         # 安装全部可用技能
vvilog skills remove vvilog-api # 从检测到的 Agent 目录移除技能
```

`releases` 和 `find` 默认在线查询 GitHub。`init` 和 `skills add` 会下载公开 `vvilog-skills` 仓库，并把 `vvilog-api` 安装到本机已检测到的 AI Agent skills 目录，例如 `~/.codex/skills/vvilog-api`、`~/.cursor/skills/vvilog-api`、`~/.claude/skills/vvilog-api`，同时安装到兜底目录 `~/.agents/skills/vvilog-api`。

离线或开发场景可指定本地 skills 仓库：

```bash
vvilog init --source-dir ./vvilog-skills
vvilog skills add vvilog-api --source-dir ./vvilog-skills
```
