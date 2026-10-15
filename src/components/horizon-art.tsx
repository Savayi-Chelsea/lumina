/** Decorative, code-native scenery. No airline marks or protected artwork. */
export function HorizonArt({ compact = false }: { compact?: boolean }) {
  return <div className={`horizon-art${compact ? " horizon-compact" : ""}`} aria-hidden="true">
    <div className="horizon-grain" /><div className="horizon-orbit orbit-one" /><div className="horizon-orbit orbit-two" />
    <div className="window-outline"><div className="window-scene"><span className="horizon-sun" /><span className="cloud cloud-one" /><span className="cloud cloud-two" /><span className="horizon-wing" /></div></div>
    <div className="horizon-caption"><span>A SHARED JOURNEY</span><span>AN OPEN HORIZON</span></div>
    {!compact && <div className="horizon-note"><span>From familiar faces</span><span>to new possibilities.</span></div>}
  </div>;
}
