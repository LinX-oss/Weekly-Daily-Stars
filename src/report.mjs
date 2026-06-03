import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const fmt = (value) => (value == null || Number.isNaN(Number(value)) ? "" : Number(value).toLocaleString("en-US"));
const mdLink = (row) => `[${row.name}](${row.github})`;
const csvEscape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;

function sortedRows(rows, metric, kind = null) {
  return rows
    .filter((row) => (kind ? row.kind === kind : true))
    .filter((row) => row[metric] != null)
    .slice()
    .sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || (b.totalStars ?? -1) - (a.totalStars ?? -1));
}

function table(title, rows, metric, metricLabel) {
  const lines = [
    `## ${title}`,
    "",
    `| Rank | Type | Repo | ${metricLabel} | Total stars | Intro | Star History |`,
    "|---:|---|---|---:|---:|---|---|",
  ];

  if (rows.length === 0) {
    lines.push("|  |  | No data available for this window. |  |  | Check `data/stars-skills-mcp.json` for fetch errors or run with `GITHUB_TOKEN`. |  |");
    return lines.join("\n");
  }

  rows.slice(0, 10).forEach((row, index) => {
    lines.push(`| ${index + 1} | ${row.kind} | ${mdLink(row)} | ${fmt(row[metric])} | ${fmt(row.totalStars)} | ${escapeTable(row.intro || row.description)} | [source](${row.starHistory}) |`);
  });

  return lines.join("\n");
}

function escapeTable(value) {
  return String(value ?? "").replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function markdownReport(dataset, window) {
  const metric = window === "daily" ? "dailyStars" : "weeklyStars";
  const metricLabel = window === "daily" ? "New stars in last 24h" : "New stars this week";
  const title = window === "daily" ? "Daily GitHub Stars: Skills and MCP" : "Weekly GitHub Stars: Skills and MCP";

  return [
    `# ${title}`,
    "",
    `Generated at: ${dataset.generatedAt}`,
    window === "daily"
      ? `Window: ${dataset.dailySince} to ${dataset.generatedAt}.`
      : "Window: Star History's current weekly activity window at generation time.",
    `Source: ${window === "daily" ? dataset.sources.dailyStars : dataset.sources.weeklyStars}.`,
    "Intro: repository metadata description, shortened for table display.",
    "",
    table("Overall Top 10", sortedRows(dataset.rows, metric), metric, metricLabel),
    "",
    table("Skill Top 10", sortedRows(dataset.rows, metric, "skill"), metric, metricLabel),
    "",
    table("MCP Top 10", sortedRows(dataset.rows, metric, "mcp"), metric, metricLabel),
    "",
    "Note: Candidate repositories are curated in `src/repositories.mjs`; failed fetches are retained in `data/stars-skills-mcp.json` with an `error` field.",
    "",
  ].join("\n");
}

function csvReport(dataset, window) {
  const metric = window === "daily" ? "dailyStars" : "weeklyStars";
  const rows = sortedRows(dataset.rows, metric);
  const header = [
    "rank_overall",
    "kind",
    "name",
    window === "daily" ? "daily_stars" : "weekly_stars",
    "total_stars",
    "github",
    "star_history",
    "intro",
    "description",
    "topics",
    "language",
  ];

  return [
    header.map(csvEscape).join(","),
    ...rows.map((row, index) => [
      index + 1,
      row.kind,
      row.name,
      row[metric],
      row.totalStars,
      row.github,
      row.starHistory,
      row.intro,
      row.description,
      Array.isArray(row.topics) ? row.topics.join(";") : row.topics,
      row.language,
    ].map(csvEscape).join(",")),
  ].join("\n");
}

export async function writeReports(dataset, baseDir = rootDir) {
  const reportDir = join(baseDir, "reports");
  await mkdir(reportDir, { recursive: true });
  await writeFile(join(reportDir, "daily-stars-skills-mcp.md"), markdownReport(dataset, "daily"), "utf8");
  await writeFile(join(reportDir, "daily-stars-skills-mcp.csv"), csvReport(dataset, "daily"), "utf8");
  await writeFile(join(reportDir, "weekly-stars-skills-mcp.md"), markdownReport(dataset, "weekly"), "utf8");
  await writeFile(join(reportDir, "weekly-stars-skills-mcp.csv"), csvReport(dataset, "weekly"), "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const dataPath = join(rootDir, "data", "stars-skills-mcp.json");
  const dataset = JSON.parse(await readFile(dataPath, "utf8"));
  await writeReports(dataset, rootDir);
}
