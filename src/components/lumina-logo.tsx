import Image from "next/image";

export function LuminaLogo({ variant = "full" }: { variant?: "full" | "wordmark" | "compact"; inverse?: boolean }) {
  return <span className={`lumina-logo logo-${variant}`}><Image src="/LuminaLogo.png" width={594} height={127} alt="Lumina" sizes="(max-width: 600px) 132px, 180px" /></span>;
}
