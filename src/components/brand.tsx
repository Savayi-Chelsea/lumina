import Link from "next/link";
import { LuminaLogo } from "./lumina-logo";
export function Brand() {
  return <Link href="/" className="brand" aria-label="Lumina home"><LuminaLogo /></Link>;
}
