import fs from "fs";

const USERNAME = "devsw-prayas";

async function main(): Promise<void> {
  const headers = {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };

  // ----------------------------
  // USER DATA
  // ----------------------------
  const userRes = await fetch(
    `https://api.github.com/users/${USERNAME}`,
    { headers }
  );

  const user = await userRes.json();

  const reposCount: number = user.public_repos ?? 0;
  const followers: number = user.followers ?? 0;

  // ----------------------------
  // REPO DATA
  // ----------------------------
  const reposRes = await fetch(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100`,
    { headers }
  );

  const repos = await reposRes.json();

  const totalStars: number = repos.reduce(
    (sum: number, repo: any) => sum + repo.stargazers_count,
    0
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
      languageBytes[lang] =
        (languageBytes[lang] || 0) + (bytes as number);
    }
  }

  const totalBytes = Object.values(languageBytes).reduce(
    (a, b) => a + b,
    0
  );

  const languages = Object.entries(languageBytes)
    .map(([lang, bytes]) => ({
      lang,
      percent: totalBytes > 0
        ? (bytes / totalBytes) * 100
        : 0,
    }))
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 4);

  const languageBars = languages
    .map((l, i) => {
      const baseY = 735;
      const y = baseY + i * 32;
      const barWidth = (l.percent / 100) * 200;

      return `
        <text x="1090" y="${y}" class="mono-label">${l.lang}</text>
        <rect x="1190" y="${y - 10}" width="220" height="8" fill="#2a1a1a" />
        <rect x="1190" y="${y - 10}" width="${barWidth}" height="8" fill="#ff4757" />
        <text x="1470" y="${y}" class="mono-label" text-anchor="end">
          ${l.percent.toFixed(1)}%
        </text>
      `;
    })
    .join("");

  // ----------------------------
  // CONTRIBUTIONS
  // ----------------------------
  const graphQLQuery = {
    query: `
      {
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
      }
    `,
  };

  const graphRes = await fetch(
    "https://api.github.com/graphql",
    {
      method: "POST",
      headers,
      body: JSON.stringify(graphQLQuery),
    }
  );

  const graphData = await graphRes.json();

  const calendar =
    graphData?.data?.user?.contributionsCollection?.contributionCalendar;

  const totalContributions =
    calendar?.totalContributions ?? 0;

  const allDays =
    calendar?.weeks
      ?.flatMap((w: any) => w.contributionDays)
      ?.sort((a: any, b: any) =>
        new Date(a.date) > new Date(b.date) ? 1 : -1
      ) ?? [];

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
    if (allDays[i].contributionCount > 0) {
      currentStreak++;
    } else {
      break;
    }
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
 const svg = ` <svg width="1600" height="3200" viewBox="0 0 1600 3200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Deep Dark Red Background Gradient -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a0a0a"/>
      <stop offset="50%" stop-color="#2a0f0f"/>
      <stop offset="100%" stop-color="#1f0d0d"/>
    </linearGradient>
    
    <!-- Highlight Panel Gradient (Darker Red) -->
    <linearGradient id="panelGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#150808"/>
      <stop offset="50%" stop-color="#1d0a0a"/>
      <stop offset="100%" stop-color="#180909"/>
    </linearGradient>
    
    <!-- Coral Red Accent (Primary) -->
    <linearGradient id="blueAccent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ff4757"/>
      <stop offset="100%" stop-color="#ff6b7a"/>
    </linearGradient>
    
    <!-- Muted Gold for Theoretical Highlights -->
    <linearGradient id="goldAccent" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d4a574"/>
      <stop offset="100%" stop-color="#e6b887"/>
    </linearGradient>
    
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&amp;display=swap');
      @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&amp;display=swap');
      
      .studio-name {
        font-family: 'Orbitron', sans-serif;
        font-size: 48px;
        fill: #ffffff;
        font-weight: 900;
        letter-spacing: 2px;
      }
      .studio-sub {
        font-family: 'Orbitron', sans-serif;
        font-size: 22px;
        fill: #cc3344;
        font-weight: 700;
        letter-spacing: 3px;
      }
      .watermark {
        font-family: 'Orbitron', sans-serif;
        font-size: 180px;
        fill: #ffffff;
        font-weight: 900;
        letter-spacing: 20px;
        opacity: 0.05;
      }
      .watermark-small {
        font-family: 'Orbitron', sans-serif;
        font-size: 11px;
        fill: #5a4049;
        font-weight: 700;
        letter-spacing: 1px;
      }
      .orbitron-stat {
        font-family: 'Orbitron', sans-serif;
        font-size: 22px;
        fill: #d4a574;
        font-weight: 700;
        letter-spacing: 1px;
      }
      .mono-title {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 32px;
        fill: #f5e8e8;
        font-weight: 600;
        letter-spacing: 0px;
      }
      .mono-section {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 22px;
        fill: #e8d4d4;
        font-weight: 600;
        letter-spacing: 0px;
      }
      .mono-body {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 15px;
        fill: #b8a8a8;
        font-weight: 400;
        letter-spacing: 0px;
        line-height: 1.6;
      }
      .mono-label {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        fill: #8a7a7a;
        font-weight: 400;
        letter-spacing: 0.5px;
      }
      .mono-highlight {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 15px;
        fill: #d4a574;
        font-weight: 600;
        letter-spacing: 0px;
      }
      .mono-accent {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 13px;
        fill: #ff4757;
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .status-text {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 12px;
        fill: #9a8a8a;
        font-weight: 400;
        letter-spacing: 1px;
      }
      .metadata-text {
        font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
        font-size: 10px;
        fill: #5a4968;
        font-weight: 400;
        letter-spacing: 0.5px;
      }
    </style>
  </defs>
  
  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  
  <!-- Subtle grid pattern (very low opacity) -->
  <defs>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#3a1515" stroke-width="0.5"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#grid)" opacity="1.0"/>
  
  <!-- Left Margin Vertical Accent Line -->
  <line x1="80" y1="0" x2="80" y2="3200" stroke="#ff4757" stroke-width="1.5" opacity="0.3"/>
  
  <!-- Large Background Watermark -->
  <text x="1400" y="1750" class="watermark" text-anchor="end" transform="rotate(-90 1400 1750)">STORMWEAVER</text>
  
  <!-- Header Section -->
  <text x="100" y="100" class="studio-name">PRAYAS BHARADWAJ</text>
  <text x="100" y="135" class="studio-sub">STORMWEAVER STUDIOS</text>
  <text x="100" y="158" class="mono-label">RESEARCH &amp; DEVELOPMENT LABORATORY</text>

  <!-- Top Divider -->
  <line x1="100" y1="195" x2="1520" y2="195" stroke="#3a2020" stroke-width="1"/>
  
  <!-- Overview Section -->
  <text x="100" y="275" class="mono-title">LABORATORY OVERVIEW</text>
  
  <text x="100" y="320" class="mono-body">StormWeaver Studios is an independent research and development laboratory</text>
  <text x="100" y="340" class="mono-body">focused on high-performance computing, physically accurate rendering systems,</text>
  <text x="100" y="360" class="mono-body">and deterministic deep learning infrastructure. The studio operates with a</text>
  <text x="100" y="380" class="mono-body">research-first methodology and production-grade engineering standards.</text>
  
  <text x="100" y="420" class="mono-body">Core areas of investigation include massively parallel multithreading, wavelength-</text>
  <text x="100" y="440" class="mono-body">accurate spectral light transport, principled memory management systems, and</text>
  <text x="100" y="460" class="mono-body">deterministic neural inference engines. All systems are engineered for</text>
  <text x="100" y="480" class="mono-body">reproducibility, correctness, and measurable performance under rigorous conditions.</text>
  
  <!-- Divider -->
  <line x1="100" y1="520" x2="1520" y2="520" stroke="#3a2020" stroke-width="1"/>
  
  <!-- GitHub Stats Section -->
  <text x="100" y="580" class="mono-title">GITHUB ACTIVITY METRICS</text>
  
  <!-- GitHub Stats Grid -->
  <g id="github-stats">
    <!-- Account Stats Panel -->
    <rect x="100" y="615" width="460" height="240" fill="url(#panelGrad)" stroke="#3a2020" stroke-width="1"/>
    <rect x="100" y="615" width="4" height="240" fill="url(#blueAccent)"/>
    
    <text x="130" y="650" class="mono-section">ACCOUNT STATS</text>
    <text x="130" y="670" class="mono-label">github.com/devsw-prayas</text>
    
    <text x="130" y="705" class="mono-accent">PUBLIC REPOS</text>
    <text x="130" y="725" class="orbitron-stat">${reposCount}</text>
    
    <text x="130" y="760" class="mono-accent">FOLLOWERS</text>
    <text x="130" y="780" class="orbitron-stat">${followers}</text>
    
    <text x="330" y="705" class="mono-accent">STARS EARNED</text>
    <text x="330" y="725" class="orbitron-stat">${totalStars.toLocaleString()}</text>
    
    <text x="330" y="760" class="mono-accent">CONTRIBUTIONS</text>
    <text x="330" y="780" class="orbitron-stat">${totalContributions.toLocaleString()}</text>
    
    <text x="130" y="825" class="mono-label">Member since 2020 · Active contributor</text>

    <!-- Contribution Activity Panel -->
    <rect x="580" y="615" width="460" height="240" fill="url(#panelGrad)" stroke="#3a2020" stroke-width="1"/>
    <rect x="580" y="615" width="4" height="240" fill="url(#blueAccent)"/>
    
    <text x="610" y="650" class="mono-section">CONTRIBUTION ACTIVITY</text>
    <text x="610" y="670" class="mono-label">Last 365 days</text>

    <text x="610" y="705" class="mono-accent">COMMITS TODAY</text>
    <text x="610" y="725" class="orbitron-stat">${commitsToday}</text>

    <text x="610" y="760" class="mono-accent">CURRENT STREAK</text>
    <text x="610" y="780" class="orbitron-stat">${currentStreak} days</text>

    <text x="830" y="760" class="mono-accent">LONGEST STREAK</text>
    <text x="830" y="780" class="orbitron-stat">${longestStreak} days</text>

    <!-- Language Distribution Panel -->
    <rect x="1060" y="615" width="460" height="240"
          fill="url(#panelGrad)"
          stroke="#3a2020"
          stroke-width="1"/>
    <rect x="1060" y="615" width="4" height="240"
          fill="url(#blueAccent)"/>
    <text x="1090" y="650" class="mono-section">LANGUAGE DISTRIBUTION</text>
    <text x="1090" y="670" class="mono-label">Aggregated across owned repositories</text>
    <text x="1090" y="705" class="mono-accent">LANG</text>
    <text x="1240" y="705" class="mono-accent">UTILIZATION</text>
    <text x="1470" y="705" class="mono-accent" text-anchor="end">%</text>
    <g id="language-bars">
      ${languageBars}
    </g>

  </g>
  
  <!-- Divider -->
  <line x1="100" y1="895" x2="1520" y2="895" stroke="#3a2020" stroke-width="1"/>
  
  <!-- Research Divisions Section -->
  <text x="100" y="955" class="mono-title">RESEARCH DIVISIONS</text>
  
  <!-- Division 01: HPC -->
  <text x="100" y="1010" class="mono-section">01 · HIGH-PERFORMANCE COMPUTING DIVISION</text>
  <line x1="100" y1="1020" x2="680" y2="1020" stroke="#ff4757" stroke-width="1" opacity="0.4"/>
  
  <text x="100" y="1055" class="mono-body">Dedicated to the design and implementation of compute infrastructure that is</text>
  <text x="100" y="1075" class="mono-body">correct, performant, and reproducible. Systems are engineered to eliminate data</text>
  <text x="100" y="1095" class="mono-body">races, memory unsafety, and non-deterministic execution at every level of the stack.</text>
  
  <text x="100" y="1130" class="mono-label">FOCUS AREAS</text>
  <text x="100" y="1155" class="mono-body">· Parallel multithreading with full utilisation of available hardware concurrency</text>
  <text x="100" y="1175" class="mono-body">· Memory subsystems with shadow tracking, lifetime enforcement, and sanitisation</text>
  <text x="100" y="1195" class="mono-body">· Cache-coherent data structures respecting hardware memory hierarchy</text>
  <text x="100" y="1215" class="mono-body">· SIMD kernel development for vectorised throughput-critical workloads</text>
  <text x="100" y="1235" class="mono-body">· Lock-free concurrency primitives with formal correctness guarantees</text>
  <text x="100" y="1255" class="mono-body">· Deterministic execution semantics across all runtime configurations</text>
  
  <text x="100" y="1290" class="mono-label">ACTIVE PROJECTS</text>
  <text x="100" y="1315" class="mono-accent">StormSTL</text>
  <text x="210" y="1315" class="mono-body">— data structures, allocators, and memory primitives</text>
  <text x="100" y="1335" class="mono-accent">Corium</text>
  <text x="180" y="1335" class="mono-body">— parallel runtime and task scheduler</text>
  <text x="100" y="1355" class="mono-accent">Stratum</text>
  <text x="195" y="1355" class="mono-body">— deterministic execution tracing and instrumentation</text>
  <text x="100" y="1375" class="mono-accent">Kerbecs</text>
  <text x="195" y="1375" class="mono-body">— shadow-memory sanitiser and lifetime analyser</text>
  <text x="100" y="1395" class="mono-accent">Leibniz</text>
  <text x="185" y="1395" class="mono-body">— SIMD-optimised mathematics library</text>
  <text x="100" y="1415" class="mono-accent">Helios-DLX</text>
  <text x="220" y="1415" class="mono-body">— deep learning runtime (HPC + DL)</text>
  
  <!-- Division 02: Graphics -->
  <line x1="100" y1="1455" x2="1520" y2="1455" stroke="#3a2020" stroke-width="1"/>
  
  <text x="100" y="1510" class="mono-section">02 · GRAPHICS &amp; RENDERING RESEARCH DIVISION</text>
  <line x1="100" y1="1520" x2="720" y2="1520" stroke="#ff4757" stroke-width="1" opacity="0.4"/>
  
  <text x="100" y="1555" class="mono-body">Focused on physically accurate simulation of light transport across the visible</text>
  <text x="100" y="1575" class="mono-body">spectrum. Research spans RGB and spectral rendering paradigms, with active</text>
  <text x="100" y="1595" class="mono-body">investigation into neural-assisted reconstruction and denoising pipelines.</text>
  
  <text x="100" y="1630" class="mono-label">FOCUS AREAS</text>
  <text x="100" y="1655" class="mono-body">· Path tracing: unidirectional, bidirectional, and Metropolis-based variants</text>
  <text x="100" y="1675" class="mono-body">· RGB rendering pipelines for standard display-referred output workflows</text>
  <text x="100" y="1695" class="mono-body">· Spectral rendering with wavelength-accurate material and illuminant models</text>
  <text x="100" y="1715" class="mono-body">· Light transport theory and Monte Carlo estimator variance reduction</text>
  <text x="100" y="1735" class="mono-body">· Neural rendering and learned reconstruction for production-grade output</text>
  
  <text x="100" y="1770" class="mono-label">ACTIVE PROJECTS</text>
  <text x="100" y="1795" class="mono-accent">Spectra</text>
  <text x="180" y="1795" class="mono-body">— research-oriented physically based rendering engine</text>
  <text x="100" y="1815" class="mono-accent">Spectral &amp; Neural Transport Modules</text>
  <text x="450" y="1815" class="mono-body">— wavelength-domain extensions integrated into Spectra</text>
  
  <!-- Division 03: Deep Learning -->
  <line x1="100" y1="1855" x2="1520" y2="1855" stroke="#3a2020" stroke-width="1"/>
  
  <text x="100" y="1910" class="mono-section">03 · DEEP LEARNING SYSTEMS DIVISION</text>
  <line x1="100" y1="1920" x2="640" y2="1920" stroke="#ff4757" stroke-width="1" opacity="0.4"/>
  
  <text x="100" y="1955" class="mono-body">Concerned with the engineering of neural inference systems built to the same</text>
  <text x="100" y="1975" class="mono-body">correctness and performance standards as the broader compute infrastructure.</text>
  <text x="100" y="1995" class="mono-body">Deterministic output and numerical reproducibility are non-negotiable requirements.</text>
  
  <text x="100" y="2030" class="mono-label">FOCUS AREAS</text>
  <text x="100" y="2055" class="mono-body">· Native deep learning inference without external framework dependencies</text>
  <text x="100" y="2075" class="mono-body">· Inference kernels optimised for latency and throughput under constrained resources</text>
  <text x="100" y="2095" class="mono-body">· SIMD-accelerated neural arithmetic for CPU-bound execution environments</text>
  <text x="100" y="2115" class="mono-body">· Deterministic execution with bit-exact reproducibility across runs</text>
  <text x="100" y="2135" class="mono-body">· Custom operator development for workloads not addressed by existing frameworks</text>
  
  <text x="100" y="2170" class="mono-label">ACTIVE PROJECTS</text>
  <text x="100" y="2195" class="mono-accent">Helios-DLX</text>
  <text x="220" y="2195" class="mono-body">— in-house deep learning inference engine</text>
  <text x="100" y="2215" class="mono-accent">Neural Transport Models</text>
  <text x="330" y="2215" class="mono-body">— learned reconstruction models integrated into Spectra</text>
  
  <!-- Major Divider -->
  <line x1="100" y1="2275" x2="1520" y2="2275" stroke="#ff4757" stroke-width="1.5" opacity="0.5"/>
  
  <!-- Research Highlight Section -->
  <text x="100" y="2355" class="mono-title">RESEARCH HIGHLIGHT</text>
  
  <!-- BsSPT Panel -->
  <g id="highlight-panel">
    <rect x="100" y="2390" width="1420" height="500" fill="url(#panelGrad)" stroke="#3a2020" stroke-width="1"/>
    <rect x="100" y="2390" width="4" height="500" fill="url(#goldAccent)"/>
    
    <text x="140" y="2435" class="mono-section">Basis-Space Spectral Path Tracing (BsSPT)</text>
    <text x="140" y="2455" class="mono-label">DETERMINISTIC SPECTRAL TRANSPORT VIA LINEAR BASIS DECOMPOSITION</text>
    
    <text x="140" y="2495" class="mono-body">A formal framework for deterministic spectral light transport in which spectral</text>
    <text x="140" y="2515" class="mono-body">power distributions are decomposed over a fixed global basis. The spectral shape</text>
    <text x="140" y="2535" class="mono-body">φ is represented as a basis-space vector, with scalar throughput T tracked</text>
    <text x="140" y="2555" class="mono-body">independently. Spectral evolution reduces to a sequence of linear operator</text>
    <text x="140" y="2575" class="mono-body">transforms in basis space, eliminating per-path stochastic wavelength sampling.</text>
    
    <text x="140" y="2615" class="mono-label">TECHNICAL PROPERTIES</text>
    <text x="140" y="2640" class="mono-body">· Fully deterministic: identical inputs produce identical outputs across all runs</text>
    <text x="140" y="2660" class="mono-body">· SIMD-compatible operator structure with natural cache coherence properties</text>
    <text x="140" y="2680" class="mono-body">· Eliminates per-path wavelength variance without sacrificing spectral fidelity</text>
    
    <text x="140" y="2715" class="mono-label">INTEGRATION CAPABILITIES</text>
    <text x="140" y="2740" class="mono-body">The framework interfaces directly with neural reconstruction pipelines, providing</text>
    <text x="140" y="2760" class="mono-body">a structured bridge between high-performance compute, physically accurate spectral</text>
    <text x="140" y="2780" class="mono-body">physics, and learned inference. Suitable for deployment in production rendering</text>
    <text x="140" y="2800" class="mono-body">contexts where correctness and reproducibility are primary engineering constraints.</text>
    
    <text x="140" y="2835" class="mono-label">IMPLEMENTATION STATUS</text>
    <text x="140" y="2860" class="mono-highlight">Integrated into the Spectra rendering engine as the primary spectral transport backend</text>
    <text x="140" y="2880" class="mono-highlight">Operator formalism enables deterministic GPU execution without architectural compromise</text>
  </g>
  
  <!-- Bottom Section -->
  <line x1="100" y1="2950" x2="1520" y2="2950" stroke="#ff4757" stroke-width="1.5" opacity="0.5"/>
  
  <text x="100" y="3010" class="mono-body">CORE RESEARCH FOCUS</text>
  <text x="100" y="3035" class="mono-section">Deterministic Compute · Spectral Transport · Neural Acceleration</text>
  
  <text x="100" y="3080" class="mono-label">LABORATORY LEADERSHIP</text>
  <text x="100" y="3105" class="mono-body">Prayas Bharadwaj — Founder, Lead Engineer, Principal Investigator</text>
  
  <!-- Bottom Metadata Stamp -->
  <text x="100" y="3175" class="metadata-text">Research Document v1.0 · Established 2025 · Deterministic Compute Systems</text>
  
  <!-- Bottom Right Watermark -->
  <text x="1520" y="3165" class="watermark-small" text-anchor="end">STORMWEAVER STUDIOS</text>
</svg> `;
  fs.writeFileSync("readme.svg", svg);

  console.log("SVG updated successfully.");
}

main();
