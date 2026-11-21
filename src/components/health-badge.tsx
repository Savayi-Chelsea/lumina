import type { HealthState } from "@/lib/system-health";
import { Icon } from "./icon";

const stateLabel: Record<HealthState, string> = { good: "Working", warning: "Needs attention", critical: "Down" };

/** State is carried by icon and words, never by colour alone. */
export function HealthBadge({ state }: { state: HealthState }) {
  return <span className={`health-badge health-${state}`}><Icon name={state === "good" ? "check" : "compass"} width={14} height={14} />{stateLabel[state]}</span>;
}
