import Image from "next/image";

export type LogoVariant = "full" | "wordmark" | "compact";
export type LogoAssets = Partial<Record<LogoVariant, { src: string; width: number; height: number }>>;

/** Pass approved local assets here when supplied. Until then, use typography only. */
export function LuminaLogo({ variant = "full", assets, inverse = false }: {
  variant?: LogoVariant;
  assets?: LogoAssets;
  inverse?: boolean;
}) {
  const asset = assets?.[variant];
  return <span className={`lumina-logo logo-${variant}${inverse ? " logo-inverse" : ""}`}>
    {asset ? <Image src={asset.src} alt="Lumina" width={asset.width} height={asset.height} /> : <>
      <span className="logo-type" aria-hidden="true">{variant === "compact" ? "L" : "Lumina"}<span className="logo-period">.</span></span>
      <span className="sr-only">Lumina</span>
      {variant === "full" && <span className="logo-descriptor">The alumni collective</span>}
    </>}
  </span>;
}
