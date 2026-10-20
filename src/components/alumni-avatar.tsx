"use client";
import Image from "next/image";
import { useState } from "react";
import { profileImage, profileInitials } from "@/lib/profile-image";
export function AlumniAvatar({ name, image, large = false }: { name: string; image?: string | null; large?: boolean }) {
 const [failed, setFailed] = useState<string | null>(null);
 const src = profileImage(image);
 return <span className={`alumni-avatar${large ? " alumni-avatar-large" : ""}`} aria-hidden="true">{src && failed !== src ? <Image src={src} alt="" width={large ? 96 : 64} height={large ? 96 : 64} unoptimized referrerPolicy="no-referrer" onError={() => setFailed(src)} /> : profileInitials(name)}</span>;
}
