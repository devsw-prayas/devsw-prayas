import fs from "fs";

// ─────────────────────────── config ───────────────────────────
const USERNAME    = "devsw-prayas";
const PINNED: string | null = "Spectra"; // always gets the accent colour; null to disable
const WINDOW_DAYS = 60;                  // < 100 so per-repo contributions never need paging
const TOP_N       = 4;                   // coloured repos (incl. pinned)
const STATE_FILE  = "colors.json";       // sticky repo → colour slot, committed by the bot
const FONT_FILE   = "fonts/JetBrainsMono-subset.woff2"; // optional; embedded if present
const OUT_FILE    = "readme.svg";

const C = {
  bg: "#0b0d10", border: "#21262d", rule: "#30363d",
  text: "#e6e8eb", dim: "#7d8590", legend: "#9aa3ad",
};
const PALETTE = ["#2dd9c8", "#1f9c90", "#9fece3", "#16655e"]; // one teal ramp, slot 0 = accent (pinned)
const LANG_COLORS = ["#c9d1d9", "#8b949e", "#6e7681", "#484f58"]; // greys: no clash with repo teals
const LANG_OTHER  = "#30363d";
const OTHER   = "#4b525c"; // public repos outside the top N
const PRIVATE = "#2a2f36"; // calendar total − public commits

// ─────────────────────────── layout ───────────────────────────
const W = 880, PAD = 36, SEC = 296, H = SEC + 100; // SEC = top of the languages/stats section
const FS_SMALL = 12, CHAR_W = 0.6 * FS_SMALL; // JetBrains Mono advance = 0.6em
const CHART_TOP = 108, CHART_BOT = 248, FILL = 0.5; // bar width as a fraction of the pitch

// ─────────────────────────── helpers ──────────────────────────
const headers = {
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  "Content-Type": "application/json",
};

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST", headers, body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json();
  // fail the run instead of committing an SVG full of zeros
  if (!res.ok || json.errors || !json.data?.user) {
    throw new Error(`GraphQL failed: ${JSON.stringify(json.errors ?? json)}`);
  }
  return json.data as T;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const clip = (s: string, n = 10) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const day = (d: Date) => d.toISOString().slice(0, 10);
const fmtAxis = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleString("en-US", { month: "short", day: "2-digit", timeZone: "UTC" });

type Day = { date: string; contributionCount: number };
type Cal = { weeks: { contributionDays: Day[] }[] };
const flatten = (c: Cal): Day[] =>
  c.weeks.flatMap((w) => w.contributionDays).sort((a, b) => a.date.localeCompare(b.date));

// ─────────────────────────── query ────────────────────────────
const QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC, first: 100) {
      totalCount
      nodes {
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
      }
    }
    year: contributionsCollection {
      contributionYears
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
    win: contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 100) {
        repository { name isPrivate }
        contributions(first: 100) { nodes { occurredAt commitCount } }
      }
    }
  }
}`;

type Resp = {
  user: {
    followers: { totalCount: number };
    repositories: {
      totalCount: number;
      nodes: { stargazerCount: number; languages: { edges: { size: number; node: { name: string } }[] } }[];
    };
    year: { contributionYears: number[]; contributionCalendar: Cal };
    win: {
      contributionCalendar: Cal;
      commitContributionsByRepository: {
        repository: { name: string; isPrivate: boolean };
        contributions: { nodes: { occurredAt: string; commitCount: number }[] };
      }[];
    };
  };
};

async function main(): Promise<void> {
  // window: WINDOW_DAYS whole UTC days ending today
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (WINDOW_DAYS - 1)));
  const dates = Array.from({ length: WINDOW_DAYS }, (_, k) => day(new Date(start.getTime() + k * 864e5)));

  const { user } = await gql<Resp>(QUERY, { login: USERNAME, from: start.toISOString(), to: now.toISOString() });

  // ── all-time commits: contributionsCollection spans ≤ 1 year, so one alias per year ──
  // restrictedContributionsCount = private contributions (can include a few non-commit ones)
  const yearsQ = user.year.contributionYears.map((y) =>
    `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { totalCommitContributions restrictedContributionsCount }`
  ).join("\n");
  const allTime = await gql<{ user: Record<string, { totalCommitContributions: number; restrictedContributionsCount: number }> }>(
    `query($login: String!) { user(login: $login) { ${yearsQ} } }`, { login: USERNAME });
  const allTimeCommits = Object.values(allTime.user)
    .reduce((a, y) => a + y.totalCommitContributions + y.restrictedContributionsCount, 0);

  // ── streaks (full year) ──
  const year = flatten(user.year.contributionCalendar);
  let longest = 0, run = 0;
  for (const d of year) { run = d.contributionCount > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = year.length - 1;
  if (i >= 0 && year[i].contributionCount === 0) i--; // today isn't over: don't break the streak on it
  let current = 0;
  for (; i >= 0 && year[i].contributionCount > 0; i--) current++;

  // ── per-day, per-repo commits (public only; private is derived) ──
  const dayTotal = new Map(flatten(user.win.contributionCalendar).map((d) => [d.date, d.contributionCount]));
  const perRepo = new Map<string, Map<string, number>>();
  const repoTotal = new Map<string, number>();
  for (const r of user.win.commitContributionsByRepository) {
    if (r.repository.isPrivate) continue; // folded into the grey "private" section
    const m = new Map<string, number>();
    let t = 0;
    for (const n of r.contributions.nodes) {
      const d = n.occurredAt.slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + n.commitCount);
      t += n.commitCount;
    }
    perRepo.set(r.repository.name, m);
    repoTotal.set(r.repository.name, t);
  }

  // ── sticky colour slots ──
  const prev: Record<string, number> =
    fs.existsSync(STATE_FILE) ? (JSON.parse(fs.readFileSync(STATE_FILE, "utf8")).slots ?? {}) : {};
  const free = PINNED ? [1, 2, 3].slice(0, TOP_N - 1) : [0, 1, 2, 3].slice(0, TOP_N);
  const ranked = [...repoTotal].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const contenders = ranked.filter((r) => r !== PINNED).slice(0, free.length);

  const slots: Record<string, number> = {};
  const taken = new Set<number>();
  for (const r of contenders) {                       // keep existing colours
    const s = prev[r];
    if (s !== undefined && free.includes(s) && !taken.has(s)) { slots[r] = s; taken.add(s); }
  }
  for (const r of contenders) {                       // newcomers take a freed slot
    if (slots[r] === undefined) { const s = free.find((x) => !taken.has(x))!; slots[r] = s; taken.add(s); }
  }
  if (PINNED) slots[PINNED] = 0;                      // reserved even when inactive
  fs.writeFileSync(STATE_FILE, JSON.stringify({ slots }, null, 2) + "\n");

  const coloured = Object.entries(slots)
    .filter(([r]) => (repoTotal.get(r) ?? 0) > 0)
    .sort((a, b) => a[1] - b[1])
    .map(([r, s]) => ({ name: r, color: PALETTE[s] }));
  const colouredSet = new Set(coloured.map((c) => c.name));

  // series, bottom → top
  const series = [...coloured, { name: "other", color: OTHER }, { name: "private", color: PRIVATE }];
  const totals = series.map(() => 0);
  const grid = dates.map((d) => {
    const row = coloured.map((c) => perRepo.get(c.name)?.get(d) ?? 0);
    let other = 0, pub = 0;
    for (const [r, m] of perRepo) {
      const n = m.get(d) ?? 0;
      pub += n;
      if (!colouredSet.has(r)) other += n;
    }
    row.push(other, Math.max(0, (dayTotal.get(d) ?? 0) - pub));
    row.forEach((n, j) => (totals[j] += n));
    return row;
  });
  const totalCommits = totals.reduce((a, b) => a + b, 0);

  // ── languages (bytes, public non-fork repos) + account stats ──
  const langBytes = new Map<string, number>();
  let stars = 0;
  for (const r of user.repositories.nodes) {
    stars += r.stargazerCount;
    for (const e of r.languages.edges) langBytes.set(e.node.name, (langBytes.get(e.node.name) ?? 0) + e.size);
  }
  const langTotal = [...langBytes.values()].reduce((a, b) => a + b, 0) || 1;
  const langSorted = [...langBytes].sort((a, b) => b[1] - a[1]);
  const langs = langSorted.slice(0, LANG_COLORS.length)
    .map(([name, b], i) => ({ name, pct: (b / langTotal) * 100, color: LANG_COLORS[i] }));
  const restPct = (langSorted.slice(LANG_COLORS.length).reduce((a, [, b]) => a + b, 0) / langTotal) * 100;
  if (restPct >= 0.1) langs.push({ name: "other", pct: restPct, color: LANG_OTHER });

  // ── render ──
  const pitch = (W - 2 * PAD) / WINDOW_DAYS;
  const barW = pitch * FILL;
  const maxDay = Math.max(1, ...grid.map((r) => r.reduce((a, b) => a + b, 0)));
  const scale = (CHART_BOT - CHART_TOP - 2) / maxDay;

  let bars = "";
  grid.forEach((row, k) => {
    const x = (PAD + k * pitch + (pitch - barW) / 2).toFixed(2);
    let y = CHART_BOT;
    row.forEach((n, j) => {
      if (n <= 0) return;
      const h = Math.max(1.5, n * scale);
      y -= h;
      bars += `<rect x="${x}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${h.toFixed(2)}" fill="${series[j].color}"/>`;
    });
  });

  // legend, right-aligned, skipping empty series
  let legend = "", lx = W - PAD;
  series.map((s, j) => ({ ...s, n: totals[j] })).filter((s) => s.n > 0).reverse().forEach((s) => {
    const label = `${clip(s.name)} `, num = `${s.n}`;
    const w = 10 + 6 + (label.length + num.length) * CHAR_W;
    const x0 = lx - w;
    legend += `<rect x="${x0.toFixed(1)}" y="77" width="10" height="10" fill="${s.color}"/>` +
      `<text x="${(x0 + 16).toFixed(1)}" y="86" class="s" fill="${C.legend}">${esc(label)}<tspan fill="${C.text}">${num}</tspan></text>`;
    lx = x0 - 16;
  });

  const axis = [
    [0, "start"], [Math.round(WINDOW_DAYS / 3), "middle"], [Math.round((2 * WINDOW_DAYS) / 3), "middle"],
  ].map(([k, a]) => {
    const x = PAD + (k as number) * pitch + (a === "middle" ? pitch / 2 : 0);
    return `<text x="${x.toFixed(1)}" y="268" class="s" font-size="11" fill="${C.dim}" text-anchor="${a}">${fmtAxis(dates[k as number])}</text>`;
  }).join("") + `<text x="${W - PAD}" y="268" class="s" font-size="11" fill="${C.dim}" text-anchor="end">today</text>`;

  // bottom section: language bar (left), account stats (right)
  const LX1 = 520, barLen = LX1 - PAD;
  let lbar = "", bx = PAD;
  langs.forEach((l, i) => {
    const w = (barLen * l.pct) / 100;
    const vis = Math.max(0, w - (i < langs.length - 1 ? 2 : 0));
    lbar += `<rect x="${bx.toFixed(2)}" y="${SEC + 38}" width="${vis.toFixed(2)}" height="8" fill="${l.color}"/>`;
    bx += w;
  });
  let llegend = "", gx = PAD;
  for (const l of langs) {
    const label = `${clip(l.name, 12)} `, num = `${l.pct.toFixed(l.pct < 10 ? 1 : 0)}%`;
    const w = 16 + (label.length + num.length) * CHAR_W;
    if (gx + w > LX1) break;
    llegend += `<rect x="${gx}" y="${SEC + 61}" width="10" height="10" fill="${l.color}"/>` +
      `<text x="${(gx + 16).toFixed(1)}" y="${SEC + 70}" class="s" fill="${C.legend}">${esc(label)}<tspan fill="${C.text}">${num}</tspan></text>`;
    gx += w + 12;
  }
  const STAT_X = [560, 644, 708, 772];
  const stats = ([[allTimeCommits, "commits"], [user.repositories.totalCount, "repos"], [stars, "stars"], [user.followers.totalCount, "followers"]] as const)
    .map(([n, label], i) => {
      const x = STAT_X[i];
      return `<text x="${x}" y="${SEC + 48}" font-size="20" font-weight="700" fill="${C.text}">${n.toLocaleString("en-US")}</text>` +
        `<text x="${x}" y="${SEC + 70}" class="s" fill="${C.dim}">${label}</text>`;
    }).join("");

  const fontFace = fs.existsSync(FONT_FILE)
    ? `@font-face{font-family:'JBM';font-weight:100 800;src:url(data:font/woff2;base64,${fs.readFileSync(FONT_FILE).toString("base64")}) format('woff2');}`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<style>${fontFace}
text{font-family:'JBM','JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.s{font-size:${FS_SMALL}px}
</style>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="${C.bg}" stroke="${C.border}"/>
<text x="${PAD}" y="46" class="s" fill="${C.dim}">${USERNAME} · commits · last ${WINDOW_DAYS} days · streak <tspan fill="${PALETTE[0]}">${current}d</tspan> (max ${longest}d)</text>
<text x="${PAD}" y="86" font-size="36" font-weight="700" fill="${C.text}">${totalCommits.toLocaleString("en-US")}</text>
${legend}
${bars}
<line x1="${PAD}" y1="${CHART_BOT + 0.5}" x2="${W - PAD}" y2="${CHART_BOT + 0.5}" stroke="${C.rule}"/>
${axis}
<line x1="${PAD}" y1="${SEC + 0.5}" x2="${W - PAD}" y2="${SEC + 0.5}" stroke="${C.border}"/>
<text x="${PAD}" y="${SEC + 24}" class="s" fill="${C.dim}">languages · public repos</text>
${lbar}
${llegend}
<text x="560" y="${SEC + 24}" class="s" fill="${C.dim}">all time</text>
${stats}
</svg>`;

  fs.writeFileSync(OUT_FILE, svg);
  console.log(`readme.svg: ${totalCommits} commits, ${coloured.length} coloured repos, streak ${current}/${longest}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
