"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isMentorMatch, MAX_MENTOR_QUERY_LENGTH, mentorPrompts, validateMentorQuery, type MentorMatch } from "@/lib/mentorship-contract";
import { Icon } from "./icon";
import { MentorCard } from "./mentor-card";

type SearchState = { kind: "idle" | "loading" | "results" | "empty" | "unavailable" | "signin" | "verification"; results: MentorMatch[]; submitted: string };
const initial: SearchState = { kind: "idle", results: [], submitted: "" };

export function MentorshipSearch() {
  const [query, setQuery] = useState("");
  const [inputError, setInputError] = useState("");
  const [state, setState] = useState<SearchState>(initial);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const controller = useRef<AbortController | null>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const pending = state.kind === "loading";
  const length = Array.from(query).length;
  useEffect(() => () => { controller.current?.abort(); }, []);
  useEffect(() => {
    if (!["idle", "loading"].includes(state.kind)) summary.current?.focus();
  }, [state.kind]);

  async function search(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    let normalized;
    try { normalized = validateMentorQuery(query); } catch (error) {
      setInputError(error instanceof Error ? error.message : "Check your request.");
      setState(initial); textarea.current?.focus(); return;
    }
    controller.current?.abort();
    const current = new AbortController(); controller.current = current;
    setInputError(""); setState({ kind: "loading", results: [], submitted: normalized });
    try {
      const response = await fetch("/api/mentorship/search", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }),
        signal: current.signal, cache: "no-store", credentials: "same-origin",
      });
      if (current.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        setState({ kind: response.status === 401 ? "signin" : "verification", results: [], submitted: normalized }); return;
      }
      if (response.status === 400) {
        setInputError("Please shorten or rephrase your request and try again."); setState(initial); textarea.current?.focus(); return;
      }
      if (!response.ok) throw new Error("Unavailable");
      const data: unknown = await response.json();
      if (current.signal.aborted) return;
      if (!data || typeof data !== "object" || !("results" in data) || !Array.isArray(data.results)
        || data.results.length > 50 || !data.results.every(isMentorMatch)) throw new Error("Invalid response");
      setState({ kind: data.results.length ? "results" : "empty", results: data.results, submitted: normalized });
    } catch {
      if (!current.signal.aborted) setState({ kind: "unavailable", results: [], submitted: normalized });
    }
  }

  return <div className="mentorship-search">
    <section className="mentor-search-panel" aria-labelledby="mentor-form-title">
      <div className="search-panel-heading"><span className="prompt-icon"><Icon name="compass" width={26} height={26} /></span><div><h2 id="mentor-form-title">Where would you like to go next?</h2><p>A goal, a career change, a challenge. Start in your own words.</p></div></div>
      <form onSubmit={search} noValidate>
        <label htmlFor="mentor-query">What would you like mentorship with?</label>
        <textarea ref={textarea} id="mentor-query" name="query" rows={4} maxLength={MAX_MENTOR_QUERY_LENGTH}
          value={query} onChange={event => { setQuery(event.target.value); setInputError(""); }} disabled={pending}
          placeholder={mentorPrompts[0]} aria-invalid={Boolean(inputError)} aria-describedby={`mentor-query-help mentor-query-count${inputError ? " mentor-query-error" : ""}`} />
        <div className="query-help"><p id="mentor-query-help">Include a skill, your goal, and the experience you hope to learn from.</p><span id="mentor-query-count" className={length > 500 ? "query-over-limit" : ""}>{length} / {MAX_MENTOR_QUERY_LENGTH} characters</span></div>
        {inputError && <p id="mentor-query-error" className="query-error" role="alert">{inputError}</p>}
        <button type="submit" disabled={pending}><Icon name="compass" />{pending ? "Finding mentors…" : "Find mentors"}<Icon name="arrow" /></button>
      </form>
      <div className="prompt-examples"><p className="eyebrow">A LITTLE INSPIRATION</p><div>{mentorPrompts.map((prompt,index) => <button type="button" className="prompt-example" key={prompt} disabled={pending} onClick={() => { setQuery(prompt); setInputError(""); textarea.current?.focus(); }}><span>0{index + 1}</span>{prompt}</button>)}</div></div>
    </section>

    <section className="mentor-results" aria-label="Mentor search results">
      {pending && <><div className="search-loading" role="status"><span className="loading-ring" aria-hidden="true" /><div><h2>Finding experience that fits your next step.</h2><p>Looking through available mentor profiles. This may take a moment.</p></div></div><div className="mentor-results-grid" aria-hidden="true" aria-busy="true">{[1,2,3].map(value => <div className="mentor-skeleton" key={value}><span /><span /><span /><span /></div>)}</div></>}
      {state.kind === "idle" && <div className="search-introduction"><Icon name="people" width={28} height={28} /><h2>A shared perspective can change your direction.</h2><p>Your results will appear here, ranked by relevance to your request. Only mentors who are available and have agreed to matching are included.</p></div>}
      {state.kind === "results" && <><div className="section-heading"><div><p className="eyebrow">EXPERIENCE TO EXPLORE</p><h2 ref={summary} tabIndex={-1}>{state.results.length} {state.results.length === 1 ? "mentor" : "mentors"} to discover</h2></div><span className="badge">Ranked by match relevance</span></div><p className="submitted-query">For: “{state.submitted}”</p><p className="relevance-help">Match relevance reflects how closely a profile relates to your request, on a scale of −1 to 1. It is not a probability or a guarantee of mentoring fit. Skills shown are listed on each profile.</p><div className="mentor-results-grid">{state.results.map((mentor,index) => <MentorCard key={mentor.profileId} mentor={mentor} rank={index + 1} />)}</div></>}
      {state.kind === "empty" && <div className="empty-state"><Icon name="compass" width={32} height={32} /><h2 ref={summary} tabIndex={-1}>No mentors matched this request yet.</h2><p>Try describing a related skill or a broader goal. Available mentors can change over time.</p><div className="actions"><button type="button" className="secondary" onClick={() => textarea.current?.focus()}>Edit your request</button><button type="button" className="secondary" onClick={() => void search()}>Try again</button></div></div>}
      {state.kind === "unavailable" && <div className="empty-state service-unavailable"><Icon name="compass" width={32} height={32} /><h2 ref={summary} tabIndex={-1}>Mentor discovery is taking a pause.</h2><p>We could not complete your search right now. Your request is still here; try again shortly.</p><button type="button" onClick={() => void search()}>Retry search<Icon name="arrow" /></button></div>}
      {(state.kind === "signin" || state.kind === "verification") && <div className="empty-state"><h2 ref={summary} tabIndex={-1}>{state.kind === "signin" ? "Sign in to continue." : "Complete alumni verification to continue."}</h2><p>Your request is still in the form. Return once your account is ready.</p><Link className="button" href={state.kind === "signin" ? "/sign-in" : "/verify"}>{state.kind === "signin" ? "Sign in" : "Verify alumni details"}</Link></div>}
    </section>
  </div>;
}
