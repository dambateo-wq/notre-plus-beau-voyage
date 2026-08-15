import "server-only";

import nodemailer from "nodemailer";

type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendWeddingEmail(message: MailMessage) {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    return { sent: false as const, reason: "not_configured" as const };
  }

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });

  await transport.sendMail({
    from: `Damien & Julie <${user}>`,
    ...message,
  });

  return { sent: true as const };
}

export function emailFrame(content: string) {
  return `<!doctype html>
  <html lang="fr">
    <body style="margin:0;background:#f5f0e6;color:#273126;font-family:Arial,sans-serif">
      <div style="max-width:640px;margin:0 auto;padding:36px 18px">
        <div style="padding:34px;border-radius:24px;background:#fffdf9;border:1px solid #e4dccf">
          <p style="margin:0 0 20px;color:#9b7b48;font-size:11px;letter-spacing:.16em;text-transform:uppercase">Notre plus beau voyage</p>
          ${content}
          <p style="margin:30px 0 0;padding-top:22px;border-top:1px solid #e8e0d3;color:#677064;font-size:13px">Damien & Julie · 29 mai 2027 · Domaine du Massacan</p>
        </div>
      </div>
    </body>
  </html>`;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
