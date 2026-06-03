# Weekly GitHub Stars: Skills and MCP

这个项目每天生成两类榜单：

- `reports/weekly-stars-skills-mcp.md`：Skills 和 MCP 仓库周新增 Star 榜。
- `reports/daily-stars-skills-mcp.md`：Skills 和 MCP 仓库近 24 小时新增 Star 榜。

每个榜单都包含：

- Overall Top 10
- Skill Top 10
- MCP Top 10
- 仓库总 Star
- GitHub / Star History 链接
- 每个项目的简短介绍

## 数据来源

- Weekly stars：Star History API 的 `weekly_activity.new_stars`。
- Daily stars：GitHub Stargazers API，从生成时间往前 24 小时计数。
- 简介：Star History 返回的仓库 description，缺失时用 topics 兜底。

## 本地更新

```powershell
npm run update
```

只更新 daily：

```powershell
npm run update:daily
```

只更新 weekly：

```powershell
npm run update:weekly
```

建议设置 `GITHUB_TOKEN`，否则本地 GitHub API 未认证限额较低：

```powershell
$env:GITHUB_TOKEN = "<your_token>"
npm run update
```

## 候选仓库

候选仓库在 `src/repositories.mjs` 维护。新增仓库时添加：

```js
{ kind: "skill", repo: "owner/name" }
{ kind: "mcp", repo: "owner/name" }
```

## 自动更新

`.github/workflows/update-stars.yml` 会每天运行一次，并在报告变化时自动提交更新。

## Windows 本地每日更新

如果这个项目还没有放到 GitHub 仓库，也可以用 Windows 任务计划程序每天更新。

先确保用户环境变量里有 `GITHUB_TOKEN`，否则 daily stars 可能被 GitHub API 限流。

注册每天 08:30 运行：

```powershell
.\scripts\register-daily-task.ps1 -At "08:30"
```

手动运行一次：

```powershell
.\scripts\update-stars.ps1
```
