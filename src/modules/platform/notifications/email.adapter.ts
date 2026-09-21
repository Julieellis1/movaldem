import * as nodemailer from "nodemailer";
import { env } from "@/lib/env";

let transporter: nodemailer.Transporter | null = null;

export function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport(env().SMTP_URL ?? { streamTransport: true, debug: false });
  }
  return transporter;
}

export async function sendEmail(input: { to: string; subject: string; html: string; text?: string }) {
  const info = await getTransporter().sendMail({
    from: env().MAIL_FROM ?? "MOVALDEM <no-reply@movaldem.org>",
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  });
  return info.messageId;
}
