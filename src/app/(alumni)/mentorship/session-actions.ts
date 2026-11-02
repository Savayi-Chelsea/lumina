"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import { canDiscoverMentors } from "@/lib/mentorship-contract";
import { addSlot, bookSlot, cancelSession, parseAgenda, parseSlot, removeSlot, SessionInputError } from "@/lib/sessions";
import { sendSessionEmails } from "@/lib/session-email";

async function member() {
  const session = await requireSession();
  if (!canDiscoverMentors(session.user)) redirect("/verify");
  return session.user;
}
const field = (data: FormData, name: string) => { const value = data.get(name); return typeof value === "string" ? value : ""; };

export type SlotState = { message: string; ok?: boolean };

export async function publishSlot(_previous: SlotState, data: FormData): Promise<SlotState> {
  const user = await member();
  let slot;
  try { slot = parseSlot(data); } catch (error) {
    return { message: error instanceof SessionInputError ? error.message : "Check the slot details." };
  }
  const outcome = await addSlot(user.id, slot).catch(() => "failed" as const);
  const messages = { added: "Slot published. Your mentees can book it now.", overlap: "That time overlaps another of your slots.",
    too_many: "You already have 60 open slots. Remove some first.", not_mentor: "Turn on mentorship in your settings to offer session times.",
    failed: "The slot couldn't be saved. Please try again." };
  if (outcome === "added") revalidatePath("/mentorship/availability");
  return { message: messages[outcome], ok: outcome === "added" };
}

export async function withdrawSlot(data: FormData) {
  const user = await member();
  await removeSlot(user.id, field(data, "slot_id")).catch(() => false);
  revalidatePath("/mentorship/availability");
  redirect("/mentorship/availability");
}

export type BookState = { message: string };

export async function bookSession(_previous: BookState, data: FormData): Promise<BookState> {
  const user = await member();
  let agenda;
  try { agenda = parseAgenda(data.get("agenda")); } catch (error) {
    return { message: error instanceof SessionInputError ? error.message : "Check your agenda." };
  }
  const slotId = field(data, "slot_id");
  if (!slotId) return { message: "Choose a time." };
  const result = await bookSlot(user.id, field(data, "mentorship_id"), slotId, agenda).catch(() => ({ outcome: "failed" as const }));
  if (result.outcome === "taken") return { message: "Someone just booked that time. Choose another." };
  if (result.outcome !== "booked") return { message: "This session can't be booked. Your mentorship may have ended." };
  after(() => sendSessionEmails(result.sessionId, "booked").catch(() => 0));
  revalidatePath("/mentorship/sessions");
  redirect("/mentorship/sessions?booked=1");
}

export async function cancelBookedSession(data: FormData) {
  const user = await member();
  const sessionId = field(data, "session_id");
  const cancelled = await cancelSession(user.id, sessionId).catch(() => null);
  if (cancelled) after(() => sendSessionEmails(sessionId, "cancelled").catch(() => 0));
  revalidatePath("/mentorship/sessions"); revalidatePath("/mentorship/availability");
  redirect(`/mentorship/sessions?cancelled=${cancelled ? "1" : "0"}`);
}
