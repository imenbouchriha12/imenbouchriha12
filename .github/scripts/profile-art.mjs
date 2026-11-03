import fs from "node:fs/promises";

const USER = process.env.GITHUB_REPOSITORY_OWNER || "imenbouchriha12";
const REPO =
  (process.env.GITHUB_REPOSITORY || `${USER}/${USER}`).split("/")[1] || USER;
const OUT_DIR = "dist";
const TOKEN = process.env.GITHUB_TOKEN || "";
const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "'Bahnschrift SemiBold','Segoe UI',Arial,sans-serif";
const MONO = "Consolas,'Courier New',monospace";

const HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": `${USER}-profile-art`,
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const LANG_COLORS = {
  TypeScript: "#3178C6",
  JavaScript: "#F1E05A",
  "C#": "#178600",
  Java: "#B07219",
  HTML: "#E34C26",
  CSS: "#563D7C",
  SCSS: "#C6538C",
  Python: "#3572A5",
  PHP: "#4F5D95",
  Shell: "#89E051",
  Dockerfile: "#384D54",
  Vue: "#41B883",
  Blade: "#F7523F",
  EJS: "#A91E50",
  Handlebars: "#F7931E",
  PowerShell: "#012456",
  PLpgSQL: "#336790",
  TSQL: "#E38C00",
  Batchfile: "#C1F12E",
  "Jupyter Notebook": "#DA5B0B",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Ruby: "#701516",
  Go: "#00ADD8",
  Rust: "#DEA584",
  Swift: "#F05138",
  "C++": "#F34B7D",
  C: "#555555",
};

const THEMES = {
  dark: {
    bg1: "#0b0e16",
    bg2: "#150f27",
    border: "#30363d",
    text: "#e6edf3",
    muted: "#8b949e",
    title: "#ff9bdd",
    accent: "#ff6ec7",
    accent2: "#9d7bff",
    accent3: "#22d3ee",
    track: "#21262d",
    dots: 0.05,
  },
  light: {
    bg1: "#ffffff",
    bg2: "#fff5fb",
    border: "#d8dee4",
    text: "#1f2328",
    muted: "#6e7781",
    title: "#b03a97",
    accent: "#b03a97",
    accent2: "#7c5cff",
    accent3: "#0e7490",
    track: "#eaeef2",
    dots: 0.045,
  },
};

const esc = (value) =>
  String(value).replace(
    /[<>&"']/g,
    (char) =>
      ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[
        char
      ],
  );

const dayKey = (date) => date.toISOString().slice(0, 10);
const shiftDay = (key, offset) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return dayKey(date);
};

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: HEADERS,
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status}`);
  }
  return response.json();
}

async function profileViews() {
  try {
    const response = await fetch(
      `https://komarev.com/ghpvc/?username=${encodeURIComponent(USER)}&style=flat-square`,
      { headers: { "User-Agent": HEADERS["User-Agent"] } },
    );
    if (!response.ok) return "—";
    const svg = await response.text();
    const numbers = [...svg.matchAll(/>(\d[\d,]*)\s*<\/text>/g)];
    return numbers.length ? numbers.at(-1)[1].replace(/,/g, "") : "—";
  } catch {
    return "—";
  }
}

async function lastUpdate(today) {
  try {
    const commits = await api(`/repos/${USER}/${REPO}/commits?per_page=1`);
    const date = commits?.[0]?.commit?.committer?.date;
    if (!date) return { value: "—", sub: "main · latest commit" };
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const commitDay = new Date(`${date.slice(0, 10)}T00:00:00Z`);
    const now = new Date(`${today}T00:00:00Z`);
    const days = Math.round((now - commitDay) / 86400000);
    const value =
      days <= 0
        ? "TODAY"
        : days === 1
          ? "1D AGO"
          : days < 10
            ? `${days}D AGO`
            : `${months[commitDay.getUTCMonth()]} ${commitDay.getUTCDate()}`;
    return { value, sub: "main · latest commit" };
  } catch {
    return { value: "—", sub: "main · latest commit" };
  }
}

async function contributionsFromGraphQL() {
  if (!TOKEN) return null;

  const query = `
    query($login: String!) {
      user(login: $login) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: USER } }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const calendar =
    payload?.data?.user?.contributionsCollection?.contributionCalendar;

  if (!calendar) return null;

  return {
    total: calendar.totalContributions,
    days: calendar.weeks
      .flatMap((week) => week.contributionDays)
      .map((day) => ({ date: day.date, count: day.contributionCount })),
  };
}

async function contributionsFromJogruber() {
  const response = await fetch(
    `https://github-contributions-api.jogruber.de/v4/${USER}?y=last`,
  );
  if (!response.ok) {
    throw new Error(`Contributions API failed: ${response.status}`);
  }

  const data = await response.json();

  return {
    total:
      data.total?.lastYear ??
      Object.values(data.contributions)
        .flat()
        .reduce((sum, day) => sum + day.count, 0),
    days: Object.values(data.contributions)
      .flat()
      .map((day) => ({ date: day.date, count: day.count ?? 0 })),
  };
}

async function loadContributions() {
  return (await contributionsFromGraphQL()) ?? (await contributionsFromJogruber());
}

function topLanguages(repos) {
  const totals = new Map();

  for (const repo of repos) {
    if (!repo.language) continue;
    totals.set(repo.language, (totals.get(repo.language) || 0) + 1);
  }

  const total = [...totals.values()].reduce((sum, count) => sum + count, 0);

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({
      name,
      percent: total ? (count / total) * 100 : 0,
      color: LANG_COLORS[name] || "#8b949e",
    }));
}

function computeStreaks(days, today) {
  const counts = new Map(days.map((day) => [day.date, day.count]));
  const sorted = [...days]
    .filter((day) => day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  let longest = 0;
  let run = 0;
  for (const day of sorted) {
    run = day.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }

  let cursor = (counts.get(today) || 0) > 0 ? today : shiftDay(today, -1);
  let current = 0;
  while ((counts.get(cursor) || 0) > 0) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }

  const lastActive =
    [...sorted].reverse().find((day) => day.count > 0)?.date ?? "—";

  return {
    current,
    longest,
    lastActive,
    activeDays: sorted.filter((day) => day.count > 0).length,
  };
}

function contributionLevels(days) {
  const nonZero = days
    .map((day) => day.count)
    .filter((count) => count > 0)
    .sort((a, b) => a - b);

  const at = (ratio) =>
    nonZero[Math.min(nonZero.length - 1, Math.floor(nonZero.length * ratio))] ??
    1;

  const thresholds = [at(0.25), at(0.5), at(0.75)];

  return (count) => {
    if (count <= 0) return 0;
    if (count <= thresholds[0]) return 1;
    if (count <= thresholds[1]) return 2;
    if (count <= thresholds[2]) return 3;
    return 4;
  };
}

function shell(theme, width, height, label, content) {
  const t = THEMES[theme];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bg1}"/>
      <stop offset="100%" stop-color="${t.bg2}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.accent}"/>
      <stop offset="55%" stop-color="${t.accent2}"/>
      <stop offset="100%" stop-color="${t.accent3}"/>
      <animate attributeName="x1" values="0;0.12;0" dur="9s" repeatCount="indefinite"/>
      <animate attributeName="x2" values="1;1.12;1" dur="9s" repeatCount="indefinite"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="1" fill="${t.text}" opacity="${t.dots}"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" rx="18" fill="url(#bg)" stroke="${t.border}"/>
  <rect width="${width}" height="${height}" rx="18" fill="url(#dots)"/>
  <circle cx="${width - 74}" cy="16" r="96" fill="url(#glow)"/>
  ${content}
</svg>
`;
}

function header(theme, label, width) {
  const t = THEMES[theme];
  return `<text x="28" y="36" font-family="${FONT}" font-size="11" font-weight="700" letter-spacing="2.4" fill="${t.muted}">${esc(label)}</text>
  <circle cx="${width - 66}" cy="32" r="4" fill="${t.accent}">
    <animate attributeName="opacity" values="1;0.25;1" dur="2.6s" repeatCount="indefinite"/>
  </circle>
  <text x="${width - 56}" y="36" font-family="${FONT}" font-size="10" fill="${t.muted}">live</text>`;
}

function renderStats(theme, data) {
  const t = THEMES[theme];
  const metrics = [
    { label: "ACTIVE DAYS", value: data.streak.activeDays, x: 28 },
    { label: "STARS EARNED", value: data.stars, x: 186 },
    { label: "PUBLIC REPOS", value: data.repos, x: 344 },
    { label: "FOLLOWERS", value: data.followers, x: 452 },
  ];

  const metricsMarkup = metrics
    .map(
      (metric) => `<text x="${metric.x}" y="204" font-family="${FONT}" font-size="24" font-weight="700" fill="${t.text}">${metric.value}</text>
  <text x="${metric.x}" y="224" font-family="${FONT}" font-size="10" letter-spacing="1.2" fill="${t.muted}">${metric.label}</text>`,
    )
    .join("\n  ");

  return shell(
    theme,
    520,
    250,
    `${data.total} contributions in the last year`,
    `${header(theme, "GITHUB TELEMETRY", 520)}
  <text x="28" y="112" font-family="${FONT}" font-size="46" font-weight="700" fill="${t.text}">${data.total}</text>
  <text x="28" y="136" font-family="${FONT}" font-size="12" fill="${t.muted}">contributions · last 365 days · @${esc(USER)}</text>
  <rect x="28" y="156" width="464" height="1" fill="${t.border}"/>
  <rect x="28" y="156" width="120" height="2" rx="1" fill="url(#accent)"/>
  ${metricsMarkup}
  <text x="28" y="242" font-family="${FONT}" font-size="9.5" fill="${t.muted}">member since ${data.since} · rendered in-repo · refreshes every 12h</text>`,
  );
}

function renderLanguages(theme, languages) {
  const t = THEMES[theme];
  const rows = languages
    .map((language, index) => {
      const y = 72 + index * 27;
      const percent = Math.max(language.percent, 0.4);
      return `<circle cx="33" cy="${y - 4}" r="4" fill="${language.color}"/>
  <text x="46" y="${y}" font-family="${FONT}" font-size="13" font-weight="600" fill="${t.text}">${esc(language.name)}</text>
  <text x="500" y="${y}" text-anchor="end" font-family="${FONT}" font-size="10.5" fill="${t.muted}">${language.percent.toFixed(1)}%</text>
  <rect x="46" y="${y + 6}" width="454" height="5" rx="2.5" fill="${t.track}"/>
  <rect x="46" y="${y + 6}" width="${((percent / 100) * 454).toFixed(1)}" height="5" rx="2.5" fill="${language.color}" opacity="0.9"/>`;
    })
    .join("\n  ");

  return shell(
    theme,
    520,
    250,
    "Top languages by bytes across public repositories",
    `${header(theme, "TOP LANGUAGES", 520)}
  <text x="28" y="54" font-family="${FONT}" font-size="10" fill="${t.muted}">by primary language across public repositories</text>
  ${rows}
  <text x="28" y="242" font-family="${FONT}" font-size="9.5" fill="${t.muted}">computed from primary languages · refreshed every 12h</text>`,
  );
}

function renderStreak(theme, data, days, today) {
  const t = THEMES[theme];
  const counts = new Map(days.map((day) => [day.date, day.count]));

  const weeks = [];
  for (let index = 25; index >= 0; index -= 1) {
    let sum = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      sum += counts.get(shiftDay(today, -(index * 7 + offset))) || 0;
    }
    weeks.push(sum);
  }

  const max = Math.max(1, ...weeks);
  const startX = 552;
  const step = 20;
  const baseline = 150;
  const maxHeight = 78;

  const bars = weeks
    .map((value, index) => {
      const height = value === 0 ? 3 : Math.max(6, (value / max) * maxHeight);
      const color = value === 0 ? t.track : "url(#accent)";
      return `<rect x="${startX + index * step}" y="${baseline - height}" width="13" height="${height.toFixed(1)}" rx="3" fill="${color}" opacity="${value === 0 ? 1 : 0.9}"/>`;
    })
    .join("\n  ");

  const metrics = [
    { x: 28, value: data.streak.current, label: "CURRENT STREAK", suffix: "days" },
    { x: 190, value: data.streak.longest, label: "LONGEST STREAK", suffix: "days" },
    { x: 352, value: data.streak.lastActive, label: "LAST CONTRIBUTION", suffix: "" },
  ];

  const metricsMarkup = metrics
    .map(
      (metric) => `<text x="${metric.x}" y="92" font-family="${FONT}" font-size="${metric.suffix ? 34 : 15}" font-weight="700" fill="${t.text}">${esc(metric.value)}</text>
  ${
    metric.suffix
      ? `<text x="${metric.x + (String(metric.value).length > 2 ? 52 : 34)}" y="92" font-family="${FONT}" font-size="12" fill="${t.muted}">${metric.suffix}</text>`
      : ""
  }
  <text x="${metric.x}" y="112" font-family="${FONT}" font-size="10" letter-spacing="1.2" fill="${t.muted}">${metric.label}</text>`,
    )
    .join("\n  ");

  return shell(
    theme,
    1100,
    190,
    `Current streak: ${data.streak.current} days`,
    `${header(theme, "STREAK TELEMETRY", 1100)}
  ${metricsMarkup}
  <rect x="540" y="52" width="1" height="90" fill="${t.border}"/>
  <text x="${startX}" y="46" font-family="${FONT}" font-size="9" letter-spacing="1.4" fill="${t.muted}">LAST 26 WEEKS</text>
  <text x="1072" y="46" text-anchor="end" font-family="${FONT}" font-size="9" fill="${t.muted}">max ${max} / week</text>
  ${bars}
  <text x="${startX}" y="170" font-family="${FONT}" font-size="9" fill="${t.muted}">weekly rhythm · today</text>
  <text x="1072" y="170" text-anchor="end" font-family="${FONT}" font-size="9" fill="${t.muted}">rendered in-repo · refreshes every 12h</text>`,
  );
}

function renderHeatmap(theme, days, total, today) {
  const t = THEMES[theme];
  const levelFor = contributionLevels(days);
  const byDate = new Map(days.map((day) => [day.date, day]));

  const visible = days
    .filter((day) => day.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const first = new Date(`${visible[0].date}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());

  const weeks = [];
  const cursor = new Date(first);
  while (dayKey(cursor) <= today) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      const date = new Date(cursor);
      date.setUTCDate(cursor.getUTCDate() + index);
      const key = dayKey(date);
      const day = byDate.get(key) || { date: key, count: 0 };
      week.push({ ...day, level: levelFor(day.count), day: date.getUTCDay() });
    }
    weeks.push(week);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  const CELL = 11;
  const GAP = 3;
  const STEP = CELL + GAP;
  const LEFT = 32;
  const TOP = 54;
  const WIDTH = LEFT + weeks.length * STEP + 10;
  const HEIGHT = TOP + 7 * STEP + 34;

  const levels = [
    t.track,
    theme === "dark" ? "#4a1d3f" : "#fbd7ef",
    theme === "dark" ? "#7d2f69" : "#f2a9dd",
    theme === "dark" ? "#b8459c" : "#d96dbb",
    t.accent,
  ];

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let cells = "";
  let monthLabels = "";
  let lastName = "";
  let lastLabelWeek = -10;

  weeks.forEach((week, weekIndex) => {
    const firstOfWeek = new Date(`${week[0].date}T00:00:00Z`);
    const monthName = months[firstOfWeek.getUTCMonth()];
    if (monthName !== lastName && weekIndex - lastLabelWeek >= 3) {
      monthLabels += `<text x="${LEFT + weekIndex * STEP}" y="42" font-family="${FONT}" font-size="9" fill="${t.muted}">${monthName}</text>\n`;
      lastLabelWeek = weekIndex;
    }
    lastName = monthName;

    week.forEach((day) => {
      if (day.date > today) return;
      const x = LEFT + weekIndex * STEP;
      const y = TOP + day.day * STEP;
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${levels[day.level]}"><title>${day.count} contribution${day.count === 1 ? "" : "s"} on ${day.date}</title></rect>\n`;
    });
  });

  const dayLabels = [
    [1, "Mon"],
    [3, "Wed"],
    [5, "Fri"],
  ]
    .map(
      ([row, label]) =>
        `<text x="26" y="${TOP + row * STEP + 9}" font-family="${FONT}" font-size="9" text-anchor="end" fill="${t.muted}">${label}</text>`,
    )
    .join("\n");

  const legendY = TOP + 7 * STEP + 14;
  const legendX = WIDTH - 170;
  let legend = `<text x="${legendX}" y="${legendY + 9}" font-family="${FONT}" font-size="9" fill="${t.muted}">Less</text>`;
  for (let index = 0; index < 5; index += 1) {
    legend += `<rect x="${legendX + 30 + index * 14}" y="${legendY}" width="${CELL}" height="${CELL}" rx="2.5" fill="${levels[index]}"/>`;
  }
  legend += `<text x="${legendX + 30 + 5 * 14 + 2}" y="${legendY + 9}" font-family="${FONT}" font-size="9" fill="${t.muted}">More</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${total} contributions in the last year">
  <text x="${LEFT}" y="18" font-family="${FONT}" font-size="11" font-weight="600" fill="${t.title}">${total} contributions in the last year</text>
  ${monthLabels}
  ${dayLabels}
  ${cells}
  ${legend}
</svg>
`;
}

function statusIcon(kind, color) {
  if (kind === "eye") {
    return `<g stroke="${color}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-13 0C-7.5-7 7.5-7 13 0 7.5 7-7.5 7-13 0Z"/>
      <circle cx="0" cy="0" r="3.6" fill="${color}" stroke="none"/>
    </g>`;
  }
  if (kind === "people") {
    return `<g stroke="${color}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="-4" cy="-5" r="4.2"/>
      <path d="M-12 9c0-4.6 3.6-7.5 8-7.5s8 2.9 8 7.5"/>
      <path d="M7-1.5a3.4 3.4 0 1 0 0-6.4" opacity="0.75"/>
      <path d="M9 4.4c3 .8 4.8 3 4.8 6" opacity="0.75"/>
    </g>`;
  }
  return `<g stroke="${color}" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M-14 0h7l3-7 4.6 13 2.6-6h4.8"/>
    <circle cx="-14" cy="0" r="1.4" fill="${color}" stroke="none"/>
    <circle cx="14" cy="0" r="1.4" fill="${color}" stroke="none"/>
  </g>`;
}

function renderStatus(theme, data) {
  const t = THEMES[theme];
  const modules = [
    {
      label: "PROFILE VIEWS",
      value: data.views,
      sub: "all-time · profile",
      accent: t.accent,
      icon: "eye",
    },
    {
      label: "FOLLOWERS",
      value: data.followers,
      sub: "public · github",
      accent: t.accent2,
      icon: "people",
    },
    {
      label: "LAST UPDATE",
      value: data.lastUpdate.value,
      sub: data.lastUpdate.sub,
      accent: t.accent3,
      icon: "pulse",
    },
  ];
  const starts = [64, 501, 939];

  const blocks = modules
    .map((module, index) => {
      const x = starts[index];
      const cx = x + 26;
      return `<circle cx="${cx}" cy="72" r="30" fill="${module.accent}" opacity="0.1">
    <animate attributeName="opacity" values="0.05;0.18;0.05" dur="${6 + index}s" repeatCount="indefinite"/>
  </circle>
  <circle cx="${cx}" cy="72" r="23" fill="none" stroke="${module.accent}" stroke-opacity="0.55" stroke-width="1.2"/>
  <g transform="translate(${cx} 72)">${statusIcon(module.icon, module.accent)}</g>
  <text x="${x + 72}" y="48" font-family="${MONO}" font-size="14" letter-spacing="2.8" fill="${t.muted}">${esc(module.label)}</text>
  <text x="${x + 70}" y="98" font-family="${DISPLAY}" font-size="36" font-weight="700" fill="${t.text}">${esc(module.value)}</text>
  <text x="${x + 72}" y="120" font-family="${MONO}" font-size="12" letter-spacing="1.2" fill="${t.muted}">${esc(module.sub)}</text>`;
    })
    .join("\n  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="150" viewBox="0 0 1440 150" role="img" aria-label="${esc(`Profile views ${data.views}, ${data.followers} followers, last update ${data.lastUpdate.value}`)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.bg1}"/>
      <stop offset="100%" stop-color="${t.bg2}"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${t.accent}"/>
      <stop offset="55%" stop-color="${t.accent2}"/>
      <stop offset="100%" stop-color="${t.accent3}"/>
      <animate attributeName="x1" values="0;0.12;0" dur="9s" repeatCount="indefinite"/>
      <animate attributeName="x2" values="1;1.12;1" dur="9s" repeatCount="indefinite"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${t.accent}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${t.accent}" stop-opacity="0"/>
    </radialGradient>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">
      <circle cx="1.5" cy="1.5" r="1.05" fill="${t.text}" opacity="${t.dots}"/>
    </pattern>
  </defs>
  <rect x="1" y="1" width="1438" height="148" rx="22" fill="url(#bg)" stroke="${t.border}"/>
  <rect x="1" y="1" width="1438" height="148" rx="22" fill="url(#dots)"/>
  <circle cx="200" cy="10" r="150" fill="url(#glow)"/>
  <circle cx="1240" cy="150" r="160" fill="url(#glow)"/>
  ${blocks}
  <line x1="501" y1="30" x2="501" y2="118" stroke="${t.border}" stroke-opacity="0.8"/>
  <line x1="938" y1="30" x2="938" y2="118" stroke="${t.border}" stroke-opacity="0.8"/>
  <rect x="26" y="143" width="1388" height="2.5" rx="1.25" fill="url(#accent)" opacity="0.6"/>
</svg>
`;
}

const today = new Date().toISOString().slice(0, 10);
const contributions = await loadContributions();
const [user, repos, views, lastCommit] = await Promise.all([
  api(`/users/${USER}`),
  api(`/users/${USER}/repos?per_page=100&sort=updated`),
  profileViews(),
  lastUpdate(today),
]);

const ownRepos = repos.filter((repo) => !repo.fork);
const languages = await topLanguages(ownRepos);

const data = {
  total: contributions.total,
  streak: computeStreaks(contributions.days, today),
  since: new Date(user.created_at).getUTCFullYear(),
  repos: user.public_repos,
  followers: user.followers,
  stars: ownRepos.reduce((sum, repo) => sum + repo.stargazers_count, 0),
  views,
  lastUpdate: lastCommit,
};

await fs.mkdir(OUT_DIR, { recursive: true });

for (const theme of ["dark", "light"]) {
  await fs.writeFile(`${OUT_DIR}/stats-${theme}.svg`, renderStats(theme, data));
  await fs.writeFile(`${OUT_DIR}/status-${theme}.svg`, renderStatus(theme, data));
  await fs.writeFile(
    `${OUT_DIR}/languages-${theme}.svg`,
    renderLanguages(theme, languages),
  );
  await fs.writeFile(
    `${OUT_DIR}/streak-${theme}.svg`,
    renderStreak(theme, data, contributions.days, today),
  );
  await fs.writeFile(
    `${OUT_DIR}/contributions-${theme}.svg`,
    renderHeatmap(theme, contributions.days, contributions.total, today),
  );
}

console.log(
  `Generated telemetry: ${data.total} contributions · ${data.streak.current}d current streak · ${data.streak.longest}d longest · ${data.views} views · ${data.followers} followers · last update ${data.lastUpdate.value} · ${languages.length} languages`,
);
