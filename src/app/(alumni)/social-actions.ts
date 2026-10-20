"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { memberByProfile, removeConnection, requestConnection, respondToConnection } from "@/lib/social";
import { openConversation, sendMessage } from "@/lib/messages";
import { MentorshipRequestError, parseMentorshipRequest, requestMentorship, respondToMentorship, withdrawMentorship } from "@/lib/mentorship-requests";
import { markNotificationsRead } from "@/lib/notifications";

/** Social features are for active, verified members (and administrators). */
async function member() {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) redirect("/verify");
  return session.user;
}

const field = (data: FormData, name: string) => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

/** Only same-site relative paths; never an open redirect. */
function back(data: FormData, fallback: string) {
  const value = field(data, "return_to");
  return /^\/(?!\/)[A-Za-z0-9/_\-?=&%.]*$/.test(value) && value.length < 300 ? value : fallback;
}
const withParam = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${value}`;

export async function connect(data: FormData) {
  const user = await member();
  const outcome = await requestConnection(user.id, field(data, "profile_id")).catch(() => "failed");
  revalidatePath("/network/connections");
  redirect(withParam(back(data, "/network"), "connect", outcome));
}

export async function answerConnection(data: FormData) {
  const user = await member();
  const accept = field(data, "decision") === "accept";
  await respondToConnection(user.id, field(data, "connection_id"), accept).catch(() => false);
  revalidatePath("/network/connections"); revalidatePath("/");
  redirect(back(data, "/network/connections"));
}

export async function disconnect(data: FormData) {
  const user = await member();
  await removeConnection(user.id, field(data, "connection_id")).catch(() => false);
  revalidatePath("/network/connections");
  redirect(back(data, "/network/connections"));
}

export async function startConversation(data: FormData) {
  const user = await member();
  const other = await memberByProfile(field(data, "profile_id")).catch(() => null);
  const id = other ? await openConversation(user.id, other.user_id).catch(() => null) : null;
  if (!id) redirect(withParam(back(data, "/messages"), "message", "unavailable"));
  redirect(`/messages/${id}`);
}

export async function postMessage(data: FormData) {
  const user = await member();
  const conversationId = field(data, "conversation_id");
  const outcome = await sendMessage(user.id, conversationId, data.get("body")).catch(() => "failed");
  revalidatePath("/messages"); revalidatePath(`/messages/${conversationId}`);
  redirect(`/messages/${conversationId}${outcome === "sent" ? "" : `?error=${outcome}`}`);
}

export type RequestState = { message: string };

export async function askForMentorship(_previous: RequestState, data: FormData): Promise<RequestState> {
  const user = await member();
  let input;
  try { input = parseMentorshipRequest(data); } catch (error) {
    return { message: error instanceof MentorshipRequestError ? error.message : "Check your request." };
  }
  const outcome = await requestMentorship(user.id, field(data, "mentor_profile_id"), input).catch(() => "failed");
  if (outcome === "duplicate") return { message: "You already have a pending request with this mentor." };
  if (outcome !== "sent") return { message: "This mentor isn't taking requests right now. Try another mentor." };
  revalidatePath("/mentorship/requests");
  redirect("/mentorship/requests?sent=1");
}

export async function answerMentorship(data: FormData) {
  const user = await member();
  const result = await respondToMentorship(user.id, field(data, "request_id"), field(data, "decision") === "accept").catch(() => null);
  revalidatePath("/mentorship/requests"); revalidatePath("/messages");
  redirect(result?.conversationId ? `/messages/${result.conversationId}` : "/mentorship/requests");
}

export async function withdrawRequest(data: FormData) {
  const user = await member();
  await withdrawMentorship(user.id, field(data, "request_id")).catch(() => false);
  revalidatePath("/mentorship/requests");
  redirect("/mentorship/requests");
}

export async function readAllNotifications() {
  const session = await requireSession();
  await markNotificationsRead(session.user.id);
  revalidatePath("/notifications");
  redirect("/notifications");
}
