import { auth } from "@/auth";
import { readPhoto } from "@/lib/profile-editor";

// Photos are private to signed-in members; never cached publicly.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response(null, { status: 401 });
  const { id } = await params;
  const photo = await readPhoto(id, session.user.id).catch(() => null);
  if (!photo) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.content_type,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
