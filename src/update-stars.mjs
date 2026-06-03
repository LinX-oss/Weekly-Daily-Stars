import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { repositories } from "./repositories.mjs";
import { writeReports } from "./report.mjs";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const dataDir = join(rootDir, "data");
const defaultSleepMs = 250;

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i];
  const value = process.argv[i + 1];
  if (!key?.startsWith("--")) continue;
  args.set(key.slice(2), value ?? "true");
}

const requestedWindow = args.get("window") ?? "all";
const maxRepos = args.has("max-repos") ? Number(args.get("max-repos")) : null;
const sleepMs = args.has("sleep-ms") ? Number(args.get("sleep-ms")) : defaultSleepMs;

if (!["all", "daily", "weekly"].includes(requestedWindow)) {
  throw new Error(`Unsupported --window value: ${requestedWindow}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isoDate = (date) => date.toISOString();
const now = new Date();
const dailySince = new Date(now.getTime() - 24 * 60 * 60 * 1000);

function githubHeaders(accept = "application/vnd.github+json") {
  const headers = {
    Accept: accept,
    "User-Agent": "weekly-github-stars-skills-mcp",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function requestJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function fetchStarHistory(kind, repoName) {
  const url = `https://api.star-history.com/repo/${repoName}`;
  const payload = await requestJson(url, {
    "User-Agent": "weekly-github-stars-skills-mcp",
  });
  const repo = payload.repo ?? {};
  return {
    kind,
    name: repo.name ?? repoName,
    github: `https://github.com/${repoName}`,
    starHistory: `https://www.star-history.com/${repo.name ?? repoName}`,
    weeklyStars: repo.weekly_activity?.new_stars ?? null,
    weeklyPushes: repo.weekly_activity?.pushes ?? null,
    totalStars: repo.stars_total ?? null,
    description: repo.description ?? "",
    intro: summarizeRepo(repo.description, repo.topics),
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    language: repo.language ?? "",
    source: "star-history.com",
  };
}

async function countStarsSince(repoName, totalStars, since) {
  if (!totalStars) return { stars: 0, scannedPages: 0 };

  let page = Math.max(1, Math.ceil(totalStars / 100));
  let count = 0;
  let scannedPages = 0;

  while (page >= 1) {
    const url = `https://api.github.com/repos/${repoName}/stargazers?per_page=100&page=${page}`;
    const stars = await requestJson(url, githubHeaders("application/vnd.github.star+json"));
    scannedPages += 1;

    if (!Array.isArray(stars) || stars.length === 0) break;

    let hasOlder = false;
    for (let i = stars.length - 1; i >= 0; i--) {
      const starredAt = stars[i]?.starred_at;
      if (starredAt && starredAt >= since) count += 1;
      else hasOlder = true;
    }

    if (hasOlder) break;
    page -= 1;
    await sleep(sleepMs);
  }

  return { stars: count, scannedPages };
}

function summarizeRepo(description, topics = []) {
  const clean = String(description ?? "").replace(/\s+/g, " ").trim();
  if (clean) return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;

  const topicText = Array.isArray(topics) && topics.length ? `Topics: ${topics.slice(0, 6).join(", ")}` : "";
  return topicText || "No repository description provided.";
}

function topRows(rows, metric, kind = null) {
  return rows
    .filter((row) => (kind ? row.kind === kind : true))
    .filter((row) => Number.isFinite(row[metric]))
    .slice()
    .sort((a, b) => (b[metric] ?? -1) - (a[metric] ?? -1) || (b.totalStars ?? -1) - (a.totalStars ?? -1))
    .slice(0, 10);
}

async function collect() {
  await mkdir(dataDir, { recursive: true });

  const selected = maxRepos ? repositories.slice(0, maxRepos) : repositories;
  const rows = [];

  for (const [index, candidate] of selected.entries()) {
    try {
      const row = await fetchStarHistory(candidate.kind, candidate.repo);

      if (requestedWindow === "all" || requestedWindow === "daily") {
        try {
          const daily = await countStarsSince(candidate.repo, row.totalStars, isoDate(dailySince));
          row.dailyStars = daily.stars;
          row.dailyScannedPages = daily.scannedPages;
          row.dailySource = "github.com stargazers API";
          row.dailySince = isoDate(dailySince);
        } catch (error) {
          row.dailyStars = null;
          row.dailyScannedPages = 0;
          row.dailySource = "github.com stargazers API";
          row.dailySince = isoDate(dailySince);
          row.dailyError = error.message;
          console.error(`DAILY FAILED ${candidate.repo}: ${error.message}`);
        }
      }

      rows.push(row);
      console.error(`${index + 1}/${selected.length} ${candidate.kind} ${candidate.repo} daily=${row.dailyStars ?? "skip"} weekly=${row.weeklyStars ?? "n/a"}`);
      await sleep(sleepMs);
    } catch (error) {
      console.error(`FAILED ${candidate.kind} ${candidate.repo}: ${error.message}`);
      rows.push({
        kind: candidate.kind,
        name: candidate.repo,
        github: `https://github.com/${candidate.repo}`,
        starHistory: `https://www.star-history.com/${candidate.repo}`,
        dailyStars: null,
        weeklyStars: null,
        totalStars: null,
        description: "",
        intro: "Fetch failed; see data file for the error.",
        error: error.message,
      });
      await sleep(sleepMs * 2);
    }
  }

  const dataset = {
    generatedAt: isoDate(now),
    dailySince: isoDate(dailySince),
    requestedWindow,
    sources: {
      weeklyStars: "Star History API weekly_activity.new_stars",
      dailyStars: "GitHub stargazers API, counted from generatedAt minus 24 hours",
      descriptions: "Star History repository metadata, with GitHub links retained",
    },
    rows,
    top: {
      dailyOverall: topRows(rows, "dailyStars"),
      dailySkills: topRows(rows, "dailyStars", "skill"),
      dailyMcp: topRows(rows, "dailyStars", "mcp"),
      weeklyOverall: topRows(rows, "weeklyStars"),
      weeklySkills: topRows(rows, "weeklyStars", "skill"),
      weeklyMcp: topRows(rows, "weeklyStars", "mcp"),
    },
  };

  const dataPath = join(dataDir, "stars-skills-mcp.json");
  await writeFile(dataPath, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");
  await writeReports(dataset, rootDir);
  console.error(`Wrote ${dataPath}`);
}

await collect();
