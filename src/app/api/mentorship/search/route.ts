import { currentSession } from "@/lib/session";
import { applicationOrigin, matchesApplicationOrigin } from "@/lib/application-origin";
import { canDiscoverMentors, MentorQueryError, validateMentorQuery } from "@/lib/mentorship-contract";
import { limitedJson, MatchingQueryRejected, searchMentors } from "@/lib/mentor-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
function failure(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status, headers });
}

export async function POST(request: Request) {
  try {
    const session = await currentSession();
    if (!session?.user) return failure("SIGN_IN_REQUIRED", "Please sign in to discover mentors.", 401);
    if (!canDiscoverMentors(session.user)) return failure("VERIFICATION_REQUIRED", "Complete alumni verification to discover mentors.", 403);
    const configuredOrigin = applicationOrigin();
    if (!matchesApplicationOrigin(request.headers.get("origin"), configuredOrigin)) {
      return failure("INVALID_REQUEST", "Please refresh and try again.", 403);
    }
    if (!request.headers.get("content-type")?.includes("application/json")) return failure("INVALID_QUERY", "Send a mentorship request in the search form.", 400);
    let query;
    try {
      const data = await limitedJson(request.body, 4096);
      if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).some(key => key !== "query")) throw new MentorQueryError("Describe what you would like help with.");
      query = validateMentorQuery((data as Record<string, unknown>).query);
    } catch (error) {
      return failure("INVALID_QUERY", error instanceof MentorQueryError ? error.message : "Check your request and keep it to 500 characters or fewer.", 400);
    }
    const results = await searchMentors(query);
    return Response.json({ results }, { headers });
  } catch (error) {
    if (error instanceof MatchingQueryRejected) return failure("INVALID_QUERY", "Please shorten or rephrase your request and try again.", 400);
    return failure("SERVICE_UNAVAILABLE", "Mentor discovery is temporarily unavailable. Please try again shortly.", 503);
  }
}
