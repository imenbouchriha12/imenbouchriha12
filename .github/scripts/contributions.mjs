import fs from "node:fs/promises";

const USER = "imenbouchriha12";
const OUT_DIR = "dist";

const response = await fetch(`https://github-contributions-api.jogruber.de/v4/${USER}?y=last`);
if (!response.ok) throw new Error(`Contributions API failed: ${response.status}`);
const data = await response.json();

const days = Object.values(data.contributions)
  .flat()
  .map((d) => ({ date: d.date, level: d.level, count: d.count }))
  .sort((a, b) => a.date.localeCompare(b.date));

const byDate = new Map(days.map((d) => [d.date, d]));
const lastKey = days[days.length - 1].date;
const firstDate = new Date(`${days[0].date}T00:00:00Z`);
const cursor = new Date(firstDate);
cursor.setUTCDate(firstDate.getUTCDate() - firstDate.getUTCDay());

const weeks = [];
while (cursor.toISOString().slice(0, 10) <= lastKey) {
  const week = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(cursor);
    d.setUTCDate(cursor.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    week.push({ ...(byDate.get(key) || { date: key, level: 0, count: 0 }), day: d.getUTCDay() });
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

const themes = {
  dark: {
    text: "#8b949e",
    title: "#ff9bdd",
    levels: ["#21262d", "#4a1d3f", "#7d2f69", "#b8459c", "#ff6ec7"],
  },
  light: {
    text: "#57606a",
    title: "#b03a97",
    levels: ["#ebedf0", "#fbd7ef", "#f2a9dd", "#d96dbb", "#b03a97"],
  },
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const total = data.total?.lastYear ?? days.reduce((sum, d) => sum + d.count, 0);

function render(name) {
  const t = themes[name];
  let cells = "";
  let monthLabels = "";
  let lastName = "";
  let lastLabelWeek = -10;

  weeks.forEach((week, weekIndex) => {
    const firstOfWeek = new Date(`${week[0].date}T00:00:00Z`);
    const monthName = MONTHS[firstOfWeek.getUTCMonth()];
    if (monthName !== lastName && weekIndex - lastLabelWeek >= 3) {
      monthLabels += `<text x="${LEFT + weekIndex * STEP}" y="42" font-size="9" fill="${t.text}">${monthName}</text>\n`;
      lastLabelWeek = weekIndex;
    }
    lastName = monthName;

    week.forEach((day) => {
      if (day.date > lastKey) return;
      const x = LEFT + weekIndex * STEP;
      const y = TOP + day.day * STEP;
      cells += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2.5" fill="${t.levels[day.level]}">`;
      cells += `<title>${day.count} contribution${day.count === 1 ? "" : "s"} on ${day.date}</title></rect>\n`;
    });
  });

  const dayLabels = [[1, "Mon"], [3, "Wed"], [5, "Fri"]]
    .map(([row, label]) => `<text x="26" y="${TOP + row * STEP + 9}" font-size="9" text-anchor="end" fill="${t.text}">${label}</text>`)
    .join("\n");

  const legendY = TOP + 7 * STEP + 14;
  const legendX = WIDTH - 170;
  let legend = `<text x="${legendX}" y="${legendY + 9}" font-size="9" fill="${t.text}">Less</text>`;
  for (let i = 0; i < 5; i += 1) {
    legend += `<rect x="${legendX + 30 + i * 14}" y="${legendY}" width="${CELL}" height="${CELL}" rx="2.5" fill="${t.levels[i]}"/>`;
  }
  legend += `<text x="${legendX + 30 + 5 * 14 + 2}" y="${legendY + 9}" font-size="9" fill="${t.text}">More</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${total} contributions in the last year">
  <text x="${LEFT}" y="18" font-size="11" fill="${t.title}" font-weight="600">${total} contributions in the last year</text>
  ${monthLabels}
  ${dayLabels}
  ${cells}
  ${legend}
</svg>
`;
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.writeFile(`${OUT_DIR}/contributions-dark.svg`, render("dark"));
await fs.writeFile(`${OUT_DIR}/contributions-light.svg`, render("light"));
console.log(`Generated heatmaps: ${total} contributions across ${weeks.length} weeks`);
