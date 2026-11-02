import { currentSession } from "@/lib/session";
import { exportMyData } from "@/lib/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Download my data": a JSON copy of everything Lumina holds about the signed-in member. */
export async function GET() {
  const session = await currentSession();
  if (!session?.user) return new Response("Sign in to download your data.", { status: 401, headers: { "Cache-Control": "no-store" } });
  const data = await exportMyData(session.user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), { headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="lumina-my-data-${day}.json"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}
