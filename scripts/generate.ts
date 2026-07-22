import fs from "fs";

const USERNAME = "devsw-prayas";

// ----------------------------
// METEOR × CRT-TERMINAL THEME
// ----------------------------
const T = {
  bg:          "#05060a",
  panel:       "#0a0c10",
  teal:        "rgb(45,217,200)",
  purple:      "rgb(139,77,255)",
  pink:        "rgb(196,103,158)",
  blue:        "rgb(45,120,160)",
  textPrimary: "#f4f6fa",
  textSection: "#d9e6ea",
  textBody:    "#9aa3b8",
  textLabel:   "#6b7488",
  textMeta:    "#4a5164",
  accentBright:"rgb(120,235,220)",
};

const s = {
  stat:        `font-family:'JetBrains Mono',monospace;font-size:24px;fill:${T.accentBright};font-weight:700;letter-spacing:1px;`,
  label:       `font-family:'JetBrains Mono',monospace;font-size:13px;fill:${T.textLabel};font-weight:400;letter-spacing:0.5px;`,
  accent:      `font-family:'JetBrains Mono',monospace;font-size:13px;fill:${T.teal};font-weight:600;letter-spacing:0.5px;`,
  promptSm:    `font-family:'JetBrains Mono',monospace;font-size:13px;fill:${T.teal};font-weight:700;letter-spacing:0.5px;`,
  bar:         `font-family:'JetBrains Mono',monospace;font-size:15px;fill:${T.teal};font-weight:400;letter-spacing:-0.5px;`,
};

function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starfield(count: number, w: number, h: number): string {
  const rnd = mulberry32(1337);
  let out = "";
  for (let i = 0; i < count; i++) {
    const x = (rnd() * w).toFixed(1);
    const y = (rnd() * h).toFixed(1);
    const r = (rnd() * 1.2 + 0.3).toFixed(1);
    const o = (rnd() * 0.35 + 0.1).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${r}" fill="#dfe6f5" opacity="${o}"/>`;
  }
  return out;
}

// every panel is a CRT terminal window: flat border, command-prompt title bar
function terminalPanel(x: number, y: number, w: number, h: number, titleBarH: number, cmd: string): string {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${T.panel}" stroke="url(#auroraBorder)" stroke-width="2"/>
    <line x1="${x}" y1="${y + titleBarH}" x2="${x + w}" y2="${y + titleBarH}" stroke="url(#auroraBorder)" stroke-width="2"/>
    <text x="${x + 20}" y="${y + titleBarH / 2 + 5}" style="${s.promptSm}">${cmd}</text>
  `;
}

function asciiBar(percent: number, totalChars: number): string {
  const filled = Math.max(0, Math.min(totalChars, Math.round((percent / 100) * totalChars)));
  return "█".repeat(filled) + "░".repeat(totalChars - filled);
}

const TERM_TITLE_H = 40;

async function main(): Promise<void> {
  const STATS_Y = 60;
  const STATS_H = 280;

  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };

  const userRes = await fetch(`https://api.github.com/users/${USERNAME}`, { headers });
  const user = await userRes.json();
  const reposCount: number = user.public_repos ?? 0;
  const followers: number = user.followers ?? 0;

  const reposRes = await fetch(`https://api.github.com/users/${USERNAME}/repos?per_page=100`, { headers });
  const repos = await reposRes.json();

  const ownedRepos = repos.filter((repo: any) => !repo.fork);

  const totalStars: number = ownedRepos.reduce(
    (sum: number, repo: any) => sum + repo.stargazers_count, 0
  );

  const languageResponses = await Promise.all(
    ownedRepos.map((repo: any) =>
      fetch(repo.languages_url, { headers }).then((res) => res.json())
    )
  );

  const languageBytes: Record<string, number> = {};
  for (const langs of languageResponses) {
    for (const [lang, bytes] of Object.entries(langs)) {
      languageBytes[lang] = (languageBytes[lang] || 0) + (bytes as number);
    }
  }

  const totalBytes = Object.values(languageBytes).reduce((a, b) => a + b, 0);

  const languages = Object.entries(languageBytes)
    .map(([lang, bytes]) => ({
      lang,
      percent: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);

  const languageLines = languages
    .map((l, i) => {
      const y = STATS_Y + TERM_TITLE_H + 46 + i * 42;
      return `
        <text x="1090" y="${y}" style="${s.label}">${l.lang.toUpperCase()}</text>
        <text x="1090" y="${y + 20}" style="${s.bar}">${asciiBar(l.percent, 24)}</text>
        <text x="1470" y="${y + 20}" style="${s.label}" text-anchor="end">${l.percent.toFixed(1)}%</text>
      `;
    })
    .join("");

  const graphQLQuery = {
    query: `{
      user(login: "${USERNAME}") {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
      }
    }`,
  };

  const graphRes = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify(graphQLQuery),
  });

  const graphData = await graphRes.json();
  const calendar = graphData?.data?.user?.contributionsCollection?.contributionCalendar;
  const totalContributions = calendar?.totalContributions ?? 0;

  const allDays =
    calendar?.weeks
      ?.flatMap((w: any) => w.contributionDays)
      ?.sort((a: any, b: any) => (new Date(a.date) > new Date(b.date) ? 1 : -1)) ?? [];

  let currentStreak = 0;
  let longestStreak = 0;
  let tempStreak = 0;

  for (const day of allDays) {
    if (day.contributionCount > 0) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 0;
    }
  }

  for (let i = allDays.length - 1; i >= 0; i--) {
    if (allDays[i].contributionCount > 0) currentStreak++;
    else break;
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayData = allDays.find((d: any) => d.date === today);
  const commitsToday: number = todayData?.contributionCount ?? 0;

  const SVG_HEIGHT = STATS_Y + STATS_H + 80;

  const svg = `<svg width="1600" height="${SVG_HEIGHT}" viewBox="0 0 1600 ${SVG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">

  <defs>
    <linearGradient id="auroraBorder" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="${T.teal}"/>
      <stop offset="50%" stop-color="${T.purple}"/>
      <stop offset="100%" stop-color="${T.pink}"/>
    </linearGradient>
  </defs>

  <rect width="1600" height="${SVG_HEIGHT}" fill="${T.bg}"/>
  ${starfield(120, 1600, SVG_HEIGHT)}

  <!-- ── GITHUB STATS ───────────────────────────────────── -->
  ${terminalPanel(100, STATS_Y, 460, STATS_H, TERM_TITLE_H, "$ cat account.stats")}
  <text x="128" y="${STATS_Y + TERM_TITLE_H + 44}" style="${s.accent}">PUBLIC REPOS</text>
  <text x="128" y="${STATS_Y + TERM_TITLE_H + 72}" style="${s.stat}">${reposCount}</text>
  <text x="128" y="${STATS_Y + TERM_TITLE_H + 116}" style="${s.accent}">FOLLOWERS</text>
  <text x="128" y="${STATS_Y + TERM_TITLE_H + 144}" style="${s.stat}">${followers}</text>
  <text x="320" y="${STATS_Y + TERM_TITLE_H + 44}" style="${s.accent}">STARS EARNED</text>
  <text x="320" y="${STATS_Y + TERM_TITLE_H + 72}" style="${s.stat}">${totalStars.toLocaleString()}</text>
  <text x="320" y="${STATS_Y + TERM_TITLE_H + 116}" style="${s.accent}">CONTRIBUTIONS</text>
  <text x="320" y="${STATS_Y + TERM_TITLE_H + 144}" style="${s.stat}">${totalContributions.toLocaleString()}</text>
  <text x="128" y="${STATS_Y + STATS_H - 24}" style="${s.label}">github.com/${USERNAME}</text>

  ${terminalPanel(580, STATS_Y, 460, STATS_H, TERM_TITLE_H, "$ uptime --contrib")}
  <text x="608" y="${STATS_Y + TERM_TITLE_H + 44}" style="${s.accent}">COMMITS TODAY</text>
  <text x="608" y="${STATS_Y + TERM_TITLE_H + 72}" style="${s.stat}">${commitsToday}</text>
  <text x="608" y="${STATS_Y + TERM_TITLE_H + 116}" style="${s.accent}">CURRENT STREAK</text>
  <text x="608" y="${STATS_Y + TERM_TITLE_H + 144}" style="${s.stat}">${currentStreak}d</text>
  <text x="808" y="${STATS_Y + TERM_TITLE_H + 116}" style="${s.accent}">LONGEST STREAK</text>
  <text x="808" y="${STATS_Y + TERM_TITLE_H + 144}" style="${s.stat}">${longestStreak}d</text>
  <text x="608" y="${STATS_Y + STATS_H - 24}" style="${s.label}">last 365 days</text>

  ${terminalPanel(1060, STATS_Y, 460, STATS_H, TERM_TITLE_H, "$ cloc --top4")}
  ${languageLines}

</svg>`;

  fs.writeFileSync("readme.svg", svg);
  console.log("SVG updated successfully.");
}

main();
