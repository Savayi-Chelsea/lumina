import Image from "next/image";

// Small fixed brand asset: served as-is so it never depends on the image optimizer.
export function LuminaLogo({ variant = "full" }: { variant?: "full" | "wordmark" | "compact"; inverse?: boolean }) {
  return <span className={`lumina-logo logo-${variant}`}><Image src="/LuminaLogo.png" width={594} height={127} alt="Lumina" unoptimized /></span>;
}
