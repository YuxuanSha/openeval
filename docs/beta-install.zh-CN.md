# OpenEval 0.2.0 · build 11 r1 内测安装

这是 Apple 芯片 Mac 的本地桌面应用。r1 是 build 11 的运行时打包修订：包含官方 Node.js 24.22.1，评测业务和 trace v2 保持 build 11 基线。不是公开发行版。

## 安装与打开

1. 确认使用 Apple M 系列芯片、macOS 13.5 或更新版本。本包不支持 Intel Mac、Windows 或 Linux。
2. 双击 ZIP 解压。先阅读同目录的 `BUILD.json` 和本说明；需要时用 `shasum -a 256 <ZIP路径>` 对照随包交付的 SHA256 文件。
3. 将文件夹中的 `OpenEval.app` 拖到自己的“应用程序”文件夹；若同名应用已存在，先退出并保留旧应用，再决定是否替换。不要合并应用包。也可先从解压目录试用。
4. 双击 `OpenEval.app`。它会打开自己的窗口，自动启动本机服务，无需打开浏览器或终端启动后台。
5. 执行任务前，按 [Codex 官方安装说明](https://learn.chatgpt.com/docs/codex/cli) 安装 Codex CLI，在终端运行一次 `codex`，用测试者自己的 ChatGPT 账号登录；随后重开 OpenEval。仅 API key 登录不会被本应用采用。首次打开可以先查看和导入本地资料。

本包为 **ad-hoc 签名，没有 Apple Developer ID 签名或公证**。macOS 可能阻止从网络下载的包打开；校验哈希不等于 Apple 公证。若出现安全阻止、损坏或权限提示，请保留准确提示并联系维护者，或等待签名公证版；本说明不要求关闭 Gatekeeper、移除隔离标记或授予完全磁盘访问权限。企业管理策略也可能阻止运行。

## 数据、退出与升级

- 首次默认数据目录：`~/Library/Application Support/OpenEval/data`，包含数据库、附件和任务工作区。应用包不含示例用户的数据或账号。
- 退出用 `⌘Q` 或关闭最后一个窗口。应用会停止当前执行、保存已有产物并退出服务；重开不会自动重跑评测。
- 需要旧数据时，使用“窗口 → 选择已有工作区…”，选择同时含 `openeval.sqlite` 和 `blobs` 的目录；原数据不复制、不合并。macOS 对“文稿”等目录的访问请求需要用户自己处理。
- 升级前先退出应用，备份完整数据目录，保留旧应用。删除应用不会自动删除数据。需要回滚时退出新版，再打开保留的旧版；跨版本恢复必要时使用完整备份，不只复制 SQLite 单文件。
- 端口 `127.0.0.1:4318` 被占用时会明确报错，不会结束其他程序。不要同时运行桌面和命令行服务来打开同一份数据。
- “窗口 → 显示数据文件夹”可定位日志：`desktop-logs/window.log`。反馈时先审查日志，避免附带私有内容或凭据。

## 内测功能与依赖

- 标准、评测集、结果、报告、模板、skills、记忆和版本引用均保存在本地；实际模型请求通过本机 Codex CLI 发送到 OpenAI，并非本地离线推理。
- 已包含 Node 运行时；不需要安装 ChatGPT、npm 或 Xcode 来打开应用。Codex CLI 安装方式自身可能有额外要求，请以官方说明为准。内置 Node 未作为系统级 `node` 或 `npm` 安装。
- Skill ZIP 导入目前调用 `/usr/bin/python3`。若本机不可用，此项会报错；单文件 `SKILL.md` 和 `.openeval.json` 分享包导入不依赖 Python。飞书等第三方能力需自行配置合法的本机连接，本包不附送任何个人连接。
- “文件分享”中先选择版本与附件并检查，再下载 `.openeval.json`；接收方在同一入口导入并检查后确认。它是 JSON 离线内容包，不是应用安装包，也不是公网链接。不会自动发布、分享账号或运行导入的 skill。
- CLI/MCP 属于另行交付的 npm 包，未随此桌面 ZIP 安装到系统；需要时参考项目 `docs/cli-mcp.md`。没有自动更新或公网分享托管服务。

## 本包验证范围

`VALIDATION.txt` 记录这次实际测试。当前只在一台 Apple 芯片 Mac 上验证；隔离 PATH、空数据目录和解压后启动不能替代全新 Mac、全新 macOS 用户或经过下载隔离的 Gatekeeper 验收。最低系统版本依据内置 Node 官方要求及 Mach-O 标记，未在 macOS 13.5 实机跑过。

许可：OpenEval 自有代码为 MIT；实际第三方许可及 OpenDesign 来源说明在应用 `Contents/Resources/runtime/` 内。Node 完整许可和来源哈希在 `Contents/Resources/Node-LICENSE.txt`、`node-provenance.json`。本包不包含用户私有业务评测、登录态或原始会话。
