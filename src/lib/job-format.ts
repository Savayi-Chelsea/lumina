// Display helpers for job listings. Pure functions with no server-only imports,
// so any component (and its tests) can use them.

type Salary = { salary_min: number | null; salary_max: number | null; salary_currency: string | null; salary_period: string | null };
const PERIODS: Record<string, string> = {
  yearly: "year", annual: "year", year: "year", monthly: "month", month: "month",
  hourly: "hour", hour: "hour", weekly: "week", week: "week", daily: "day", day: "day",
};

/** "KES 80,000–120,000 / month" style label, or null. */
export function salaryLabel(job: Salary) {
  const min = job.salary_min ? Number(job.salary_min) : null;
  const max = job.salary_max ? Number(job.salary_max) : null;
  if (!min && !max) return null;
  const format = (value: number) => new Intl.NumberFormat("en-KE", { maximumFractionDigits: 0 }).format(value);
  const range = min && max && min !== max ? `${format(min)}–${format(max)}` : format((min || max) as number);
  const period = PERIODS[job.salary_period || ""];
  return `${job.salary_currency ? `${job.salary_currency} ` : ""}${range}${period ? ` / ${period}` : ""}`;
}
