/**
 * Small, dependency-free charts for the admin pages. Single series only, so the
 * title names what is plotted (no legend). Marks: columns/bars at most 24px
 * thick with a 4px rounded data end, square at the baseline; hairline grid.
 * Every mark has a hover tooltip; the accessible label and table view carry the values for keyboard and screen-reader users.
 */
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthLong = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** Smallest clean whole-number step (1, 2, 5 × 10^n) that covers `max` in at most `ticks` steps. */
export function niceScale(max: number, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  for (let magnitude = 1; ; magnitude *= 10) {
    for (const factor of [1, 2, 5]) {
      const step = factor * magnitude;
      if (Math.ceil(max / step) <= ticks) return { top: step * Math.ceil(max / step), step };
    }
  }
}

export function ColumnChart({ title, description, points, unit }: { title: string; description: string; points: { month: string; value: number }[]; unit: string }) {
  const { top, step } = niceScale(Math.max(...points.map(p => p.value)));
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step).reverse();
  const peak = points.reduce((best, p, i) => p.value > points[best].value ? i : best, 0);
  const label = (month: string) => new Date(`${month}-01T00:00:00Z`);
  return <figure className="chart card">
    <figcaption><h3>{title}</h3><p className="small muted">{description}</p></figcaption>
    <div className="column-chart" role="img" aria-label={`${title}: ${points.map(p => `${monthLong.format(label(p.month))} ${p.value}`).join(", ")}`}>
      <div className="chart-axis" aria-hidden="true">{ticks.map(t => <span key={t}>{compact.format(t)}</span>)}</div>
      <div className="chart-plot" aria-hidden="true">
        {ticks.map(t => <span key={t} className="chart-grid" style={{ bottom: `${(t / top) * 100}%` }} />)}
        {points.map((p, i) => <div key={p.month} className="chart-column">
          <span className="chart-bar" style={{ height: `${(p.value / top) * 100}%` }}>
            {(i === points.length - 1 || i === peak) && p.value > 0 && <span className="chart-value">{compact.format(p.value)}</span>}
          </span>
          <span className="chart-tip"><strong>{monthLong.format(label(p.month))}</strong>{p.value.toLocaleString("en")} {unit}</span>
          <span className={`chart-x${i % 2 ? " chart-x-odd" : ""}`}>{monthLabel.format(label(p.month))}</span>
        </div>)}
      </div>
    </div>
    <details className="chart-table"><summary>Show as table</summary><table><thead><tr><th scope="col">Month</th><th scope="col">{unit[0].toUpperCase() + unit.slice(1)}</th></tr></thead>
      <tbody>{points.map(p => <tr key={p.month}><td>{monthLong.format(label(p.month))}</td><td>{p.value.toLocaleString("en")}</td></tr>)}</tbody></table></details>
  </figure>;
}

export function BarChart({ title, description, rows, unit }: { title: string; description: string; rows: { label: string; value: number; note?: string }[]; unit: string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return <figure className="chart card">
    <figcaption><h3>{title}</h3><p className="small muted">{description}</p></figcaption>
    <ul className="bar-chart">{rows.map(row => <li key={row.label}>
      <span className="bar-label">{row.label}</span>
      <span className="bar-track"><span className="bar-fill" style={{ width: `${(row.value / max) * 100}%` }} /></span>
      <span className="bar-value">{row.value.toLocaleString("en")}</span>
      <span className="chart-tip"><strong>{row.label}</strong>{row.value.toLocaleString("en")} {unit}{row.note ? ` · ${row.note}` : ""}</span>
    </li>)}</ul>
  </figure>;
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="stat-tile card"><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong>{note && <span className="small muted">{note}</span>}</div>;
}
