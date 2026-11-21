import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireAdmin } from "@/lib/session";
import { matchQuality } from "@/lib/match-tracking";
import { StatTile } from "@/components/charts";

export const dynamic = "force-dynamic";

type Macro = Record<"precision_at_5" | "recall_at_5" | "f1_at_5" | "reciprocal_rank", number>;
type Evaluation = { evaluated_at: string; corpus_size: number; model: string; macro: Record<"domain" | "transition" | "all", Record<"semantic" | "keyword_baseline" | "hybrid", Macro | undefined>> };

async function offlineEvaluation(): Promise<Evaluation | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "evaluation/results/matching_evaluation.json"), "utf8"));
  } catch {
    return null;
  }
}

const pct = (value: number | null | undefined) => value === null || value === undefined ? "—" : `${Math.round(value * 100)}%`;
const fixed = (value: number | undefined) => value === undefined ? "—" : value.toFixed(3);

export default async function AdminMatchingPage() {
  await requireAdmin();
  const [live, offline] = await Promise.all([matchQuality(90), offlineEvaluation()]);
  const searches = live.searches.find(s => s.source === "search");
  const recommendations = live.searches.find(s => s.source === "recommendation");
  const shown = live.ranks.reduce((sum, r) => sum + r.shown, 0);
  const requested = live.ranks.reduce((sum, r) => sum + r.requested, 0);
  const systems = [["semantic", "Semantic (BGE + pgvector), live"], ["hybrid", "Hybrid (BGE + BM25 re-ranking)"], ["keyword_baseline", "Keyword baseline (TF-IDF)"]] as const;
  return <>
    <p className="eyebrow">Administration / Match quality</p>
    <h1>Mentor match quality</h1>
    <p>How well Lumina&apos;s language model (BAAI/bge-base-en-v1.5) matches members with mentors: measured offline against labelled queries, and live from what members actually do. Search text is never stored.</p>

    <h2>Live, last {live.window_days} days</h2>
    <div className="stat-grid">
      <StatTile label="Mentor searches" value={String(searches?.events ?? 0)} note={`${searches?.members ?? 0} members · ${pct(searches && searches.events ? searches.with_results / searches.events : null)} returned mentors`} />
      <StatTile label="Recommendation views" value={String(recommendations?.events ?? 0)} note="“Mentors for you” on Home" />
      <StatTile label="Request rate from search" value={pct(shown ? requested / shown : null)} note={`${requested} requests from ${shown} results shown`} />
      <StatTile label="Average match rating" value={live.feedback.average_rating === null ? "—" : `${live.feedback.average_rating} / 5`} note={`${live.feedback.count} ${live.feedback.count === 1 ? "rating" : "ratings"} · ${pct(live.feedback.recommend_rate)} would recommend`} />
      <StatTile label="Requests accepted" value={pct(live.requests.total ? live.requests.accepted / live.requests.total : null)} note={`${live.requests.from_search} from search · ${live.requests.from_recommendation} from recommendations`} />
    </div>

    <div className="card table-card"><h3>By result position (searches only)</h3>
      <p className="small muted">If ranking works, people should request and rate the top results more often than lower ones.</p>
      {live.ranks.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Rank</th><th scope="col">Shown</th><th scope="col">Requested</th><th scope="col">Request rate</th><th scope="col">Accepted</th><th scope="col">Average rating</th></tr></thead>
        <tbody>{live.ranks.map(r => <tr key={r.rank}><td>{r.rank}</td><td>{r.shown}</td><td>{r.requested}</td><td>{pct(r.shown ? r.requested / r.shown : null)}</td><td>{r.accepted}</td><td>{r.average_rating ?? "—"}</td></tr>)}</tbody></table></div>
        : <p className="muted">No searches yet in this period.</p>}
    </div>

    <div className="card table-card"><h3>Ratings by how the mentor was found</h3>
      {live.feedback.by_source.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Found through</th><th scope="col">Ratings</th><th scope="col">Average</th></tr></thead>
        <tbody>{live.feedback.by_source.map(s => <tr key={s.source}><td>{s.source === "search" ? "Mentor search" : s.source === "recommendation" ? "Mentors for you" : "Profile or Network"}</td><td>{s.count}</td><td>{s.average_rating ?? "—"}</td></tr>)}</tbody></table></div>
        : <p className="muted">No ratings yet. Mentees can rate an accepted mentorship from their mentorship requests page.</p>}
    </div>

    <h2>Offline evaluation</h2>
    {offline ? <div className="card table-card">
      <p className="small muted">{offline.corpus_size} mentors · evaluated {new Date(offline.evaluated_at).toLocaleString("en-GB", { timeZone: "Africa/Nairobi" })} · k = 5. Run <code>scripts/evaluate_matching.py</code> to refresh.</p>
      <div className="table-scroll"><table><thead><tr><th scope="col">Query set</th><th scope="col">System</th><th scope="col">P@5</th><th scope="col">R@5</th><th scope="col">F1@5</th><th scope="col">MRR</th></tr></thead>
        <tbody>{(["domain", "transition", "all"] as const).flatMap(scope => systems.map(([key, label]) => {
          const m = offline.macro[scope][key];
          return m ? <tr key={`${scope}-${key}`}><td>{scope === "all" ? "All" : scope === "domain" ? "Domain" : "Career transition"}</td><td>{label}</td>
            <td>{fixed(m.precision_at_5)}</td><td>{fixed(m.recall_at_5)}</td><td>{fixed(m.f1_at_5)}</td><td>{fixed(m.reciprocal_rank)}</td></tr> : null;
        }))}</tbody></table></div>
      <p className="small">The hybrid ranker did not beat semantic ranking on career-transition queries, so live search stays semantic. Details: <code>evaluation/results/matching_evaluation.md</code>.</p>
    </div> : <p className="card muted">No evaluation results found. Run <code>scripts/evaluate_matching.py</code>.</p>}
  </>;
}
