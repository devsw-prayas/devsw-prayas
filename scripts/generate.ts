import fs from "fs";

const USERNAME = "devsw-prayas";

// ----------------------------
// SPECTRA DARK THEME
// ----------------------------
const T = {
  bg:           "#120a00",
  panel:        "#180f00",
  panelBorder:  "#2a1800",
  accent:       "#f0b43c",
  accentDim:    "#b78a36",
  accentMuted:  "#5a4010",
  barTrack:     "#2a1800",
  textPrimary:  "#fff7e4",
  textSection:  "#f5dfa0",
  textBody:     "#c8a87a",
  textLabel:    "#8a6a30",
  textMeta:     "#5a4010",
  watermark:    "#f0b43c",
};

// Inline style helpers
const s = {
  studioName:   `font-family: 'Orbitron', monospace; font-size: 48px; fill: ${T.textPrimary}; font-weight: 900; letter-spacing: 2px;`,
  studioSub:    `font-family: 'Orbitron', monospace; font-size: 22px; fill: ${T.accentDim}; font-weight: 700; letter-spacing: 3px;`,
  watermark:    `font-family: 'Orbitron', monospace; font-size: 180px; fill: ${T.watermark}; font-weight: 900; letter-spacing: 20px; opacity: 0.04;`,
  watermarkSm:  `font-family: 'Orbitron', monospace; font-size: 11px; fill: ${T.accentMuted}; font-weight: 700; letter-spacing: 1px;`,
  stat:         `font-family: 'Orbitron', monospace; font-size: 22px; fill: ${T.accent}; font-weight: 700; letter-spacing: 1px;`,
  title:        `font-family: 'JetBrains Mono', monospace; font-size: 32px; fill: ${T.textPrimary}; font-weight: 600;`,
  section:      `font-family: 'JetBrains Mono', monospace; font-size: 22px; fill: ${T.textSection}; font-weight: 600;`,
  body:         `font-family: 'JetBrains Mono', monospace; font-size: 15px; fill: ${T.textBody}; font-weight: 400;`,
  label:        `font-family: 'JetBrains Mono', monospace; font-size: 13px; fill: ${T.textLabel}; font-weight: 400; letter-spacing: 0.5px;`,
  highlight:    `font-family: 'JetBrains Mono', monospace; font-size: 15px; fill: ${T.accent}; font-weight: 600;`,
  accent:       `font-family: 'JetBrains Mono', monospace; font-size: 13px; fill: ${T.accent}; font-weight: 600; letter-spacing: 0.5px;`,
  meta:         `font-family: 'JetBrains Mono', monospace; font-size: 10px; fill: ${T.textMeta}; font-weight: 400; letter-spacing: 0.5px;`,
};

async function main(): Promise<void> {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };

  // ----------------------------
  // USER DATA
  // ----------------------------
  const userRes = await fetch(`https://api.github.com/users/${USERNAME}`, { headers });
  const user = await userRes.json();
  const reposCount: number = user.public_repos ?? 0;
  const followers: number = user.followers ?? 0;

  // ----------------------------
  // REPO DATA
  // ----------------------------
  const reposRes = await fetch(`https://api.github.com/users/${USERNAME}/repos?per_page=100`, { headers });
  const repos = await reposRes.json();

  const totalStars: number = repos.reduce(
    (sum: number, repo: any) => sum + repo.stargazers_count, 0
  );

  const ownedRepos = repos.filter((repo: any) => !repo.fork);

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

  const languageBars = languages
    .map((l, i) => {
      const baseY = 735;
      const y = baseY + i * 32;
      const barWidth = (l.percent / 100) * 200;
      return `
        <text x="1090" y="${y}" style="${s.label}">${l.lang}</text>
        <rect x="1190" y="${y - 10}" width="220" height="8" fill="${T.barTrack}" />
        <rect x="1190" y="${y - 10}" width="${barWidth}" height="8" fill="${T.accent}" />
        <text x="1470" y="${y}" style="${s.label}" text-anchor="end">${l.percent.toFixed(1)}%</text>
      `;
    })
    .join("");

  // ----------------------------
  // CONTRIBUTIONS
  // ----------------------------
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

  // ----------------------------
  // TODAY'S COMMITS
  // ----------------------------
  const today = new Date().toISOString().slice(0, 10);
  const todayData = allDays.find((d: any) => d.date === today);
  const commitsToday: number = todayData?.contributionCount ?? 0;

  // ----------------------------
  // SVG OUTPUT
  // ----------------------------
  const svg = `<svg width="1600" height="3700" viewBox="0 0 1600 3700" xmlns="http://www.w3.org/2000/svg">

  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="#070400"/>
      <stop offset="60%"  stop-color="#1a0e00"/>
      <stop offset="100%" stop-color="#3d2000"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${T.panelBorder}" stroke-width="0.5"/>
    </pattern>
  </defs>

  <!-- Background: gradient via linearGradient (local) + stepped rects (GitHub fallback) -->
  <rect width="1600" height="3700" fill="#070400"/>
  <rect width="1600" height="370"  y="0"    fill="#0a0600" opacity="0.6"/>
  <rect width="1600" height="370"  y="370"  fill="#0e0800" opacity="0.6"/>
  <rect width="1600" height="370"  y="740"  fill="#120a00" opacity="0.6"/>
  <rect width="1600" height="370"  y="1110" fill="#171000" opacity="0.6"/>
  <rect width="1600" height="370"  y="1480" fill="#1e1400" opacity="0.6"/>
  <rect width="1600" height="370"  y="1850" fill="#261800" opacity="0.6"/>
  <rect width="1600" height="370"  y="2220" fill="#2e1c00" opacity="0.6"/>
  <rect width="1600" height="370"  y="2590" fill="#361f00" opacity="0.6"/>
  <rect width="1600" height="370"  y="2960" fill="#3a2200" opacity="0.6"/>
  <rect width="1600" height="370"  y="3330" fill="#3d2400" opacity="0.6"/>
  <!-- linearGradient overlay (works locally, stripped by GitHub) -->
  <rect width="1600" height="3700" fill="url(#bgGrad)" opacity="0.7"/>

  <!-- Grid overlay -->
  <rect width="1600" height="3700" fill="url(#grid)" opacity="0.6"/>

  <!-- Left accent line -->
  <line x1="80" y1="0" x2="80" y2="3700" stroke="${T.accent}" stroke-width="1.5" opacity="0.3"/>

  <!-- Watermark -->
  <text x="1400" y="1750" style="${s.watermark}" text-anchor="end" transform="rotate(-90 1400 1750)">STORMWEAVER</text>

  <!-- ── HEADER ─────────────────────────────────────────── -->
  <text x="100" y="100"  style="${s.studioName}">PRAYAS BHARADWAJ</text>
  <text x="100" y="135"  style="${s.studioSub}">STORMWEAVER STUDIOS</text>
  <text x="100" y="158"  style="${s.label}">RESEARCH &amp; DEVELOPMENT LABORATORY</text>
  <line x1="100" y1="195" x2="1520" y2="195" stroke="${T.panelBorder}" stroke-width="1"/>

  <!-- ── OVERVIEW ───────────────────────────────────────── -->
  <text x="100" y="275" style="${s.title}">LABORATORY OVERVIEW</text>

  <text x="100" y="320" style="${s.body}">StormWeaver Studios is an independent research and development laboratory</text>
  <text x="100" y="340" style="${s.body}">focused on high-performance computing, physically accurate rendering systems,</text>
  <text x="100" y="360" style="${s.body}">and deterministic deep learning infrastructure. The studio operates with a</text>
  <text x="100" y="380" style="${s.body}">research-first methodology and production-grade engineering standards.</text>

  <text x="100" y="420" style="${s.body}">Core areas of investigation include massively parallel multithreading, wavelength-</text>
  <text x="100" y="440" style="${s.body}">accurate spectral light transport, principled memory management systems, and</text>
  <text x="100" y="460" style="${s.body}">deterministic neural inference engines. All systems are engineered for</text>
  <text x="100" y="480" style="${s.body}">reproducibility, correctness, and measurable performance under rigorous conditions.</text>

  <line x1="100" y1="520" x2="1520" y2="520" stroke="${T.panelBorder}" stroke-width="1"/>

  <!-- ── GITHUB STATS ───────────────────────────────────── -->
  <text x="100" y="580" style="${s.title}">GITHUB ACTIVITY METRICS</text>

  <!-- Account Stats Panel -->
  <rect x="100" y="615" width="460" height="240" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="1"/>
  <rect x="100" y="615" width="4"   height="240" fill="${T.accent}"/>
  <text x="130" y="650" style="${s.section}">ACCOUNT STATS</text>
  <text x="130" y="670" style="${s.label}">github.com/devsw-prayas</text>
  <text x="130" y="705" style="${s.accent}">PUBLIC REPOS</text>
  <text x="130" y="725" style="${s.stat}">${reposCount}</text>
  <text x="130" y="760" style="${s.accent}">FOLLOWERS</text>
  <text x="130" y="780" style="${s.stat}">${followers}</text>
  <text x="330" y="705" style="${s.accent}">STARS EARNED</text>
  <text x="330" y="725" style="${s.stat}">${totalStars.toLocaleString()}</text>
  <text x="330" y="760" style="${s.accent}">CONTRIBUTIONS</text>
  <text x="330" y="780" style="${s.stat}">${totalContributions.toLocaleString()}</text>
  <text x="130" y="825" style="${s.label}">Member since 2020 · Active contributor</text>

  <!-- Contribution Activity Panel -->
  <rect x="580" y="615" width="460" height="240" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="1"/>
  <rect x="580" y="615" width="4"   height="240" fill="${T.accent}"/>
  <text x="610" y="650" style="${s.section}">CONTRIBUTION ACTIVITY</text>
  <text x="610" y="670" style="${s.label}">Last 365 days</text>
  <text x="610" y="705" style="${s.accent}">COMMITS TODAY</text>
  <text x="610" y="725" style="${s.stat}">${commitsToday}</text>
  <text x="610" y="760" style="${s.accent}">CURRENT STREAK</text>
  <text x="610" y="780" style="${s.stat}">${currentStreak} days</text>
  <text x="830" y="760" style="${s.accent}">LONGEST STREAK</text>
  <text x="830" y="780" style="${s.stat}">${longestStreak} days</text>

  <!-- Language Distribution Panel -->
  <rect x="1060" y="615" width="460" height="240" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="1"/>
  <rect x="1060" y="615" width="4"   height="240" fill="${T.accent}"/>
  <text x="1090" y="650" style="${s.section}">LANGUAGE DISTRIBUTION</text>
  <text x="1090" y="670" style="${s.label}">Aggregated across owned repositories</text>
  <text x="1090" y="705" style="${s.accent}">LANG</text>
  <text x="1240" y="705" style="${s.accent}">UTILIZATION</text>
  <text x="1470" y="705" style="${s.accent}" text-anchor="end">%</text>
  ${languageBars}

  <line x1="100" y1="895" x2="1520" y2="895" stroke="${T.panelBorder}" stroke-width="1"/>

  <!-- ── RESEARCH DIVISIONS ─────────────────────────────── -->
  <text x="100" y="955" style="${s.title}">RESEARCH DIVISIONS</text>

  <!-- Division 01 -->
  <text x="100" y="1010" style="${s.section}">01 · HIGH-PERFORMANCE COMPUTING DIVISION</text>
  <line x1="100" y1="1020" x2="680" y2="1020" stroke="${T.accent}" stroke-width="1" opacity="0.4"/>

  <text x="100" y="1055" style="${s.body}">Dedicated to the design and implementation of compute infrastructure that is</text>
  <text x="100" y="1075" style="${s.body}">correct, performant, and reproducible. Systems are engineered to eliminate data</text>
  <text x="100" y="1095" style="${s.body}">races, memory unsafety, and non-deterministic execution at every level of the stack.</text>

  <text x="100" y="1130" style="${s.label}">FOCUS AREAS</text>
  <text x="100" y="1155" style="${s.body}">· Parallel multithreading with full utilisation of available hardware concurrency</text>
  <text x="100" y="1175" style="${s.body}">· Memory subsystems with shadow tracking, lifetime enforcement, and sanitisation</text>
  <text x="100" y="1195" style="${s.body}">· Cache-coherent data structures respecting hardware memory hierarchy</text>
  <text x="100" y="1215" style="${s.body}">· SIMD kernel development for vectorised throughput-critical workloads</text>
  <text x="100" y="1235" style="${s.body}">· Lock-free concurrency primitives with formal correctness guarantees</text>
  <text x="100" y="1255" style="${s.body}">· Deterministic execution semantics across all runtime configurations</text>

  <text x="100" y="1290" style="${s.label}">ACTIVE PROJECTS</text>
  <text x="100" y="1315" style="${s.accent}">StormSTL</text>
  <text x="210" y="1315" style="${s.body}">— data structures, allocators, and memory primitives</text>
  <text x="100" y="1335" style="${s.accent}">Corium</text>
  <text x="180" y="1335" style="${s.body}">— parallel runtime and task scheduler</text>
  <text x="100" y="1355" style="${s.accent}">Stratum</text>
  <text x="195" y="1355" style="${s.body}">— deterministic execution tracing and instrumentation</text>
  <text x="100" y="1375" style="${s.accent}">Kerbecs</text>
  <text x="195" y="1375" style="${s.body}">— shadow-memory sanitiser and lifetime analyser</text>
  <text x="100" y="1395" style="${s.accent}">Leibniz</text>
  <text x="185" y="1395" style="${s.body}">— SIMD-optimised mathematics library</text>
  <text x="100" y="1415" style="${s.accent}">Hades-Benchmark</text>
  <text x="265" y="1415" style="${s.body}">— statistically rigorous HPC microbenchmarking pipeline</text>
  <text x="100" y="1435" style="${s.accent}">Helios-DLX</text>
  <text x="220" y="1435" style="${s.body}">— deep learning runtime (HPC + DL)</text>

  <line x1="100" y1="1475" x2="1520" y2="1475" stroke="${T.panelBorder}" stroke-width="1"/>

  <!-- Division 02 -->
  <text x="100" y="1530" style="${s.section}">02 · GRAPHICS &amp; RENDERING RESEARCH DIVISION</text>
  <line x1="100" y1="1540" x2="720" y2="1540" stroke="${T.accent}" stroke-width="1" opacity="0.4"/>

  <text x="100" y="1575" style="${s.body}">Focused on physically accurate simulation of light transport across the visible</text>
  <text x="100" y="1595" style="${s.body}">spectrum. Research spans RGB and spectral rendering paradigms, with active</text>
  <text x="100" y="1615" style="${s.body}">investigation into neural-assisted reconstruction and denoising pipelines.</text>

  <text x="100" y="1650" style="${s.label}">FOCUS AREAS</text>
  <text x="100" y="1675" style="${s.body}">· Path tracing: unidirectional, bidirectional, and Metropolis-based variants</text>
  <text x="100" y="1695" style="${s.body}">· RGB rendering pipelines for standard display-referred output workflows</text>
  <text x="100" y="1715" style="${s.body}">· Spectral rendering with wavelength-accurate material and illuminant models</text>
  <text x="100" y="1735" style="${s.body}">· Light transport theory and Monte Carlo estimator variance reduction</text>
  <text x="100" y="1755" style="${s.body}">· Neural rendering and learned reconstruction for production-grade output</text>

  <text x="100" y="1790" style="${s.label}">ACTIVE PROJECTS</text>
  <text x="100" y="1815" style="${s.accent}">Spectra</text>
  <text x="180" y="1815" style="${s.body}">— research-oriented physically based rendering engine</text>
  <text x="100" y="1835" style="${s.accent}">Spectral &amp; Neural Transport Modules</text>
  <text x="450" y="1835" style="${s.body}">— wavelength-domain extensions integrated into Spectra</text>

  <line x1="100" y1="1875" x2="1520" y2="1875" stroke="${T.panelBorder}" stroke-width="1"/>

  <!-- Division 03 -->
  <text x="100" y="1930" style="${s.section}">03 · DEEP LEARNING SYSTEMS DIVISION</text>
  <line x1="100" y1="1940" x2="640" y2="1940" stroke="${T.accent}" stroke-width="1" opacity="0.4"/>

  <text x="100" y="1975" style="${s.body}">Concerned with the engineering of neural inference systems built to the same</text>
  <text x="100" y="1995" style="${s.body}">correctness and performance standards as the broader compute infrastructure.</text>
  <text x="100" y="2015" style="${s.body}">Deterministic output and numerical reproducibility are non-negotiable requirements.</text>

  <text x="100" y="2050" style="${s.label}">FOCUS AREAS</text>
  <text x="100" y="2075" style="${s.body}">· Native deep learning inference without external framework dependencies</text>
  <text x="100" y="2095" style="${s.body}">· Inference kernels optimised for latency and throughput under constrained resources</text>
  <text x="100" y="2115" style="${s.body}">· SIMD-accelerated neural arithmetic for CPU-bound execution environments</text>
  <text x="100" y="2135" style="${s.body}">· Deterministic execution with bit-exact reproducibility across runs</text>
  <text x="100" y="2155" style="${s.body}">· Custom operator development for workloads not addressed by existing frameworks</text>

  <text x="100" y="2190" style="${s.label}">ACTIVE PROJECTS</text>
  <text x="100" y="2215" style="${s.accent}">Helios-DLX</text>
  <text x="220" y="2215" style="${s.body}">— in-house deep learning inference engine</text>
  <text x="100" y="2235" style="${s.accent}">Neural Transport Models</text>
  <text x="330" y="2235" style="${s.body}">— learned reconstruction models integrated into Spectra</text>

  <line x1="100" y1="2275" x2="1520" y2="2275" stroke="${T.panelBorder}" stroke-width="1"/>

  <!-- Division 04 -->
  <text x="100" y="2330" style="${s.section}">04 · TOOLING &amp; DEVELOPER INFRASTRUCTURE DIVISION</text>
  <line x1="100" y1="2340" x2="800" y2="2340" stroke="${T.accent}" stroke-width="1" opacity="0.4"/>

  <text x="100" y="2375" style="${s.body}">Focused on the construction of developer-facing tools that close the gap between</text>
  <text x="100" y="2395" style="${s.body}">high-performance systems code and the inspection, profiling, and validation</text>
  <text x="100" y="2415" style="${s.body}">workflows required to reason about it rigorously.</text>

  <text x="100" y="2450" style="${s.label}">FOCUS AREAS</text>
  <text x="100" y="2475" style="${s.body}">· Native compiler tooling with direct integration into local toolchains</text>
  <text x="100" y="2495" style="${s.body}">· Source-to-assembly inspection with bidirectional mapping and inline annotation</text>
  <text x="100" y="2515" style="${s.body}">· Statistically rigorous microbenchmarking with convergence-driven termination</text>
  <text x="100" y="2535" style="${s.body}">· Determinism validation and jitter rejection in benchmark execution pipelines</text>
  <text x="100" y="2555" style="${s.body}">· Multi-compiler comparative analysis and per-instruction throughput modelling</text>

  <text x="100" y="2590" style="${s.label}">ACTIVE PROJECTS</text>
  <text x="100" y="2615" style="${s.accent}">Caldera</text>
  <text x="185" y="2615" style="${s.body}">— native Windows C++ to ASM inspection IDE with live source mapping,</text>
  <text x="185" y="2635" style="${s.body}">    llvm-mca integration, opcode reference, and multi-compiler diff</text>
  <text x="100" y="2660" style="${s.accent}">Hades-Benchmark</text>
  <text x="265" y="2660" style="${s.body}">— low-overhead benchmarking pipeline with Welford convergence,</text>
  <text x="265" y="2680" style="${s.body}">    jitter rejection, determinism validation, and work-stealing fan-out</text>

  <!-- ── RESEARCH HIGHLIGHT ─────────────────────────────── -->
  <line x1="100" y1="2750" x2="1520" y2="2750" stroke="${T.accent}" stroke-width="1.5" opacity="0.5"/>
  <text x="100" y="2830" style="${s.title}">RESEARCH HIGHLIGHT</text>

  <rect x="100" y="2865" width="1420" height="500" fill="${T.panel}" stroke="${T.panelBorder}" stroke-width="1"/>
  <rect x="100" y="2865" width="4"    height="500" fill="${T.accent}"/>

  <text x="140" y="2910" style="${s.section}">Basis-Space Spectral Path Tracing (BsSPT)</text>
  <text x="140" y="2930" style="${s.label}">DETERMINISTIC SPECTRAL TRANSPORT VIA LINEAR BASIS DECOMPOSITION</text>

  <text x="140" y="2970" style="${s.body}">A formal framework for deterministic spectral light transport in which spectral</text>
  <text x="140" y="2990" style="${s.body}">power distributions are decomposed over a fixed global basis. The spectral shape</text>
  <text x="140" y="3010" style="${s.body}">&#x3C6; is represented as a basis-space vector, with scalar throughput T tracked</text>
  <text x="140" y="3030" style="${s.body}">independently. Spectral evolution reduces to a sequence of linear operator</text>
  <text x="140" y="3050" style="${s.body}">transforms in basis space, eliminating per-path stochastic wavelength sampling.</text>

  <text x="140" y="3090" style="${s.label}">TECHNICAL PROPERTIES</text>
  <text x="140" y="3115" style="${s.body}">· Fully deterministic: identical inputs produce identical outputs across all runs</text>
  <text x="140" y="3135" style="${s.body}">· SIMD-compatible operator structure with natural cache coherence properties</text>
  <text x="140" y="3155" style="${s.body}">· Eliminates per-path wavelength variance without sacrificing spectral fidelity</text>

  <text x="140" y="3190" style="${s.label}">INTEGRATION CAPABILITIES</text>
  <text x="140" y="3215" style="${s.body}">The framework interfaces directly with neural reconstruction pipelines, providing</text>
  <text x="140" y="3235" style="${s.body}">a structured bridge between high-performance compute, physically accurate spectral</text>
  <text x="140" y="3255" style="${s.body}">physics, and learned inference. Suitable for deployment in production rendering</text>
  <text x="140" y="3275" style="${s.body}">contexts where correctness and reproducibility are primary engineering constraints.</text>

  <text x="140" y="3310" style="${s.label}">IMPLEMENTATION STATUS</text>
  <text x="140" y="3335" style="${s.highlight}">Integrated into the Spectra rendering engine as the primary spectral transport backend</text>
  <text x="140" y="3355" style="${s.highlight}">Operator formalism enables deterministic GPU execution without architectural compromise</text>

  <!-- ── FOOTER ─────────────────────────────────────────── -->
  <line x1="100" y1="3430" x2="1520" y2="3430" stroke="${T.accent}" stroke-width="1.5" opacity="0.5"/>

  <text x="100" y="3490" style="${s.body}">CORE RESEARCH FOCUS</text>
  <text x="100" y="3515" style="${s.section}">Deterministic Compute · Spectral Transport · Neural Acceleration · Developer Tooling</text>
  <text x="100" y="3560" style="${s.label}">LABORATORY LEADERSHIP</text>
  <text x="100" y="3585" style="${s.body}">Prayas Bharadwaj — Founder, Lead Engineer, Principal Investigator</text>
  <text x="100" y="3650" style="${s.meta}">Research Document v1.0 · Established 2025 · Deterministic Compute Systems</text>
  <text x="1520" y="3640" style="${s.watermarkSm}" text-anchor="end">STORMWEAVER STUDIOS</text>

</svg>`;

  fs.writeFileSync("readme.svg", svg);
  console.log("SVG updated successfully.");
}

main();
