import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email over SMTP. Locally this points at Mailpit (docker compose),
 * which captures every message in a web inbox instead of delivering it.
 * In production, point the same variables at a real provider's SMTP relay.
 */
export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.MAIL_FROM);
}

const mailGlobal = globalThis as typeof globalThis & { luminaMailer?: Transporter };

function transporter() {
  if (!isEmailConfigured()) throw new Error("Email delivery is not configured");
  mailGlobal.luminaMailer ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return mailGlobal.luminaMailer;
}

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  await transporter().sendMail({ from: process.env.MAIL_FROM, ...message });
}
