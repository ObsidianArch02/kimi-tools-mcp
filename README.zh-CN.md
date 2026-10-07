# kimi-tools-mcp

[English](README.md) | [简体中文](README.zh-CN.md)

把 Kimi Code 的**官方托管工具**——联网搜索、网页抓取，以及
`kimi-datasource` 背后的 25+ 专业数据源（Wind、SEC EDGAR、S&P Capital
IQ、世界银行、IMF、FRED、天眼查、arXiv、Google Scholar、中国法律法规与
标准、WHO/FAO/OECD、新华财经、财新……）——带给**任何支持 MCP 的
Agent**，用**你自己的 Kimi 账号**登录使用。

这是一个独立的、MIT 许可的 MCP 桥接。它与官方 Kimi Code 客户端使用同一
组托管端点（`POST /coding/v1/search`、`/fetch`、`/tools`）、同一种 OAuth
设备授权流程、同一个标识 Kimi Code 产品族的公开 OAuth client id。它与
Moonshot AI 没有隶属关系。

## 它给你的 Agent 带来什么

| 工具 | 作用 |
| --- | --- |
| `web_search` | 托管联网搜索：`{text_query}` → 标题、URL、摘要、来源站点与日期。 |
| `fetch_url` | 托管网页抽取：一个 URL → 正文 markdown。 |
| `get_data_source_desc` | 查看某个数据源的 API 文档（与官方插件同一入口）。 |
| `call_data_source_tool` | 对某个数据源发起一次调用（`data_source_name`、`api_name`、`params`）。 |

后两个工具背后的数据源目录包括：
`stock_finance_data`、`yahoo_finance`、`world_bank_open_data`、
`tianyancha`、`arxiv`、`scholar`、`yuandian_law`、`wind`、`imf`、
`gildata`、`sec_edgar`、`sp_data`、`china_nda`、`china_nbs`、
`china_standards`、`who`、`fao`、`unsd`、`ecb`、`eurostat`、`unicef`、
`oecd`、`fred`、`xhcj`、`caixin`。

## 环境要求

- Node.js ≥ 18.17（零依赖，`npx` 直接运行）。
- 一个**包含 Kimi Code 权益的 Kimi 会员**（Plus / Moderato 及以上）。
  只有*你本人*用*自己的*账号登录后，工具才可用。

## 登录（每台机器一次）

```bash
npx -y kimi-tools-mcp login
```

这会启动 OAuth 设备流：浏览器打开
`kimi.com/code/authorize_device`，你用自己的 Kimi 账号批准，CLI 会把
得到的令牌保存在本地。完成。

```bash
npx -y kimi-tools-mcp status    # 查看登录状态（永不打印 token）
npx -y kimi-tools-mcp logout    # 删除本地登录
npx -y kimi-tools-mcp login --region global   # 改用 auth.kimi.ai（国际区）
```

## 接入你的 Agent

### <img src="https://usemagpie.ai/favicon.png" width="16" height="16" alt="" valign="middle"> magpie

```bash
magpie library mcp add kimi-tools -- npx -y kimi-tools-mcp
magpie library sync
```

然后执行一次 `npx -y kimi-tools-mcp login`。你在 Library 里把 server
分发给哪些 agent（Library 页面或 `agents=...` 选择），哪些 agent 就能
调用这些工具，共享你的登录态——agent 永远看不到你的 token。

### <img src="https://avatars.githubusercontent.com/u/14957082?s=32" width="16" height="16" alt="" valign="middle"> Codex（OpenAI）

```bash
codex mcp add kimi-tools -- npx -y kimi-tools-mcp
```

然后在终端执行一次 `npx -y kimi-tools-mcp login`。（`codex mcp login`
仅支持 streamable HTTP 类 OAuth server；stdio server 统一用上面的 CLI
登录，凭据是同一份。）

### <img src="https://avatars.githubusercontent.com/u/207902832?s=32" width="16" height="16" alt="" valign="middle"> pi

```bash
pi mcp add kimi-tools -- npx -y kimi-tools-mcp
```

然后 `npx -y kimi-tools-mcp login`。（`pi mcp login` 同样仅支持 HTTP
OAuth server。）

### <img src="https://claude.ai/favicon.ico" width="16" height="16" alt="" valign="middle"> Claude Code

```bash
claude mcp add kimi-tools -- npx -y kimi-tools-mcp
```

然后在终端执行一次 `npx -y kimi-tools-mcp login`。

### <img src="https://www.kimi.com/favicon.ico" width="16" height="16" alt="" valign="middle"> Kimi Code CLI

```bash
kimi mcp add kimi-tools -- npx -y kimi-tools-mcp
```

### <img src="https://opencode.ai/favicon.ico" width="16" height="16" alt="" valign="middle"> OpenCode

写入 `~/.config/opencode/opencode.json`（或项目内
`.opencode/opencode.json`）：

```json
{
  "mcp": {
    "kimi-tools": {
      "type": "local",
      "command": ["npx", "-y", "kimi-tools-mcp"],
      "enabled": true
    }
  }
}
```

### <img src="https://cursor.com/favicon.ico" width="16" height="16" alt="" valign="middle"> Cursor · <img src="https://code.visualstudio.com/favicon.ico" width="16" height="16" alt="" valign="middle"> VS Code · 其他 MCP 宿主

注册一个 stdio MCP server：命令 `npx`，参数
`["-y", "kimi-tools-mcp"]`，然后执行一次
`npx -y kimi-tools-mcp login`。

## 范围、条款与责任

使用前请阅读本节。

**本软件是什么。** 一个客户端 MCP 桥接：它把来自你 agent 的工具调用
转发到 Kimi 的托管端点，使用的是**你**在这台机器上为**自己的** Kimi
账号签发的 OAuth 令牌。它完全运行在你的电脑上，只与 Kimi 自己的服务
器通信，没有任何自己的服务端组件。

**它不是什么。** 它不是共享、转售或放大访问权限的手段。每一次调用
消耗的配额都来自登录用户自己的会员，与官方客户端发起完全相同。请
不要用它让他人使用你的会员、不要在 Kimi Code 之上搭建付费或免费的
服务、不要用它驱动非交互的批量/自动化负载。

**使用条款。** Kimi 的
[社区准则](https://www.kimi.com/code/docs/en/kimi-code/community-guidelines.html)
允许在第三方工具中使用会员权益，同时要求：

- 仅限**个人、交互式**使用（不要脚本批量执行、不要数据管线）；
- 不要转售账号、API 访问，或把 Kimi Code 重新包装成服务；
- 不要伪造或篡改客户端身份。

本桥接在设计上就保持在这些规则之内：它以真实身份自我标识
（`User-Agent: kimi-tools-mcp/<版本>`、`X-Msh-Platform:
kimi-tools-mcp`，**不**冒充官方客户端），要求每位用户用自己的账号
登录，且不含任何定时、批量、缓存代理或账号池逻辑。**你**对如何使用
它负责；对于因误用导致 Kimi 可能采取的账号措施，作者不承担责任
（见 MIT 许可）。如果 Kimi 的条款发生变化，以条款为准——在冲突
之处请停止使用本桥接。

## 凭据存储与安全性

- **位置。** `$KIMI_TOOLS_HOME`，否则 `$XDG_CONFIG_HOME/kimi-tools`，
  否则 `~/.config/kimi-tools`。
- **权限。** 目录以 `0700` 创建；`credentials.json` 与 `device_id`
  以 `0600` 写入（仅所有者可读写）。写入是原子的（临时文件 +
  rename），崩溃不会损坏你的 token。
- **内容。** OAuth `access_token` + `refresh_token`、过期时间、区域
  与端点——仅此而已。无使用数据、无遥测、无分析。唯一的网络流量发
  往 Kimi 自己的 OAuth 与 API 主机。
- **令牌生命周期。** access token 短寿命；桥接会自动刷新（每个进程
  最多一个在途刷新）并持久化轮换后的令牌对。收到 401 时只强制刷新
  并重试一次；仍失败则提示重新登录。
- **可选系统钥匙串。** 设置 `KIMI_TOOLS_STORE=keychain` 可把长寿命的
  refresh token 移出 `credentials.json`、存入操作系统钥匙串（macOS
  钥匙串走 `security`；Linux libsecret 走 `secret-tool`）。默认关闭
  以保持零依赖可移植性——短寿命 access token 与非敏感元数据仍留在
  文件里。带着该变量登录（或重新登录）一次即迁移；取消设置并重新登
  录则迁回。钥匙串不可用时桥接会响亮报错并给出指引，而不是静默把
  秘密写回磁盘。
- **卫生。** token 永不打印、不写日志、不写入项目目录、不出现在工
  具输出或错误文本中。`logout`（或删除目录）即从机器上彻底移除。
- **你的部分。** 像对待密码一样对待 `credentials.json`：不要把它复
  制到仓库、共享的备份或别人的机器。在某台机器上登录会在你的 Kimi
  账号页注册一台设备；不再使用的设备请在该页面移除。

## 工作原理（供审阅）

零依赖，约 750 行，全部在 `src/`：

| 文件 | 职责 |
| --- | --- |
| `src/server.mjs` | 换行分隔 JSON-RPC 2.0 的 MCP stdio server（`initialize`、`tools/list`、`tools/call`、`ping`） |
| `src/tools.mjs` | 四个工具的 schema（与官方 `kimi-datasource` 同形） |
| `src/oauth.mjs` | RFC 8628 设备流 + 刷新，与官方客户端一致 |
| `src/credentials.mjs` | 权限安全的凭据存储 + 刷新去重 |
| `src/store.mjs` | 可选的操作系统钥匙串后端（存 refresh token） |
| `src/api.mjs` | `POST {base}/tools`、`/search`、`/fetch`，401 时刷新重试一次 |
| `src/identity.mjs` | 真实的 `X-Msh-*` 设备身份头 |

运行测试：`npm test`（node:test，无网络）。

## 常见问题

**这会和别人共享我的配额吗？**
不会。只有这台机器上以你的 OS 用户身份运行的进程能读到凭据文件，
且每次调用都计入你自己会员的配额。

**可以同时在多个 agent 里用吗？**
可以——这正是目的。Codex、pi、经 magpie 分发的 agent 等都可以调用
同一个本地 server 定义；它们共享的是你的登录态，而不是你的 token。

**Kimi 更换端点怎么办？**
`KIMI_TOOLS_BASE_URL` / `KIMI_TOOLS_OAUTH_HOST` 可以不改代码覆盖默认
值；区域设为 `global` 则切换到 `kimi.ai` 主机。

**这与 Moonshot AI / Kimi 有隶属关系吗？**
没有。它使用与官方客户端相同的公开 OAuth client 与托管端点，方式
与其他第三方集成相同。
