import nodemailer from "nodemailer";
import { env } from "../env";

/**
 * Outgoing email. Uses SMTP when SMTP_URL or SMTP_HOST is set (a Gmail app password works), else Resend when
 * RESEND_API_KEY is set. With neither, outside production, messages are printed to the server log instead so
 * sign-up still works locally.
 */
export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Emails "sent" in log mode, newest last; tests read codes from here. */
export const loggedEmails: Email[] = [];

const smtp = env.smtpUrl
  ? nodemailer.createTransport(env.smtpUrl)
  : env.smtpHost
    ? nodemailer.createTransport({
        host: env.smtpHost,
        port: env.smtpPort,
        secure: env.smtpPort === 465,
        auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
      })
    : undefined;

export const emailMode = smtp ? "smtp" : env.resendApiKey ? "resend" : process.env.NODE_ENV === "production" ? "off" : "log";
console.log(`[email] ${emailMode === "log" ? "no provider set; verification codes are printed here" : `sending via ${emailMode}`}`);

export async function sendEmail(email: Email) {
  if (smtp) {
    await smtp.sendMail({ from: env.emailFrom, ...email });
  } else if (env.resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.emailFrom, ...email }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => res.statusText)}`);
  } else if (emailMode === "log") {
    loggedEmails.push(email);
    console.log(`[email] to ${email.to}: ${email.subject}\n${email.text}`);
  } else {
    throw new Error("No email provider configured (set SMTP_URL, SMTP_HOST or RESEND_API_KEY).");
  }
}

/** Can this server send email? The mode, and for SMTP whether it can sign in (nothing is sent). */
export async function diagnoseEmail() {
  if (!smtp) return { mode: emailMode, from: env.emailFrom };
  try {
    await smtp.verify();
    return { mode: emailMode, from: env.emailFrom, login: "ok" };
  } catch (err) {
    return { mode: emailMode, from: env.emailFrom, login: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

function codeEmail(to: string, code: string, subject: string, lead: string, ignore: string): Email {
  return {
    to,
    subject,
    text: `${lead} ${code}.\n\nIt expires in 10 minutes. ${ignore}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px">
  <p>${lead}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:12px 0">${code}</p>
  <p style="color:#666">It expires in 10 minutes. ${ignore}</p>
</div>`,
  };
}

export const verificationEmail = (to: string, code: string) =>
  codeEmail(to, code, `${code} is your nodepad code`, "Your nodepad verification code is", "If you didn't try to make a nodepad account, you can ignore this email.");

export const resetEmail = (to: string, code: string) =>
  codeEmail(to, code, `${code} is your nodepad password reset code`, "Your nodepad password reset code is", "If you didn't ask to reset your password, you can ignore this email; your password stays the same.");
