import "server-only";

type OfferMail = {
  driverName: string;
  email: string;
  manageUrl: string;
  journey: string;
};

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CARPOOL_EMAIL_FROM;
  if (!apiKey || !from) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
    cache: "no-store",
  });

  if (!response.ok) throw new Error("L’e-mail de gestion n’a pas pu être envoyé.");
  return true;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function sendCarpoolManagementEmail({
  driverName,
  email,
  manageUrl,
  journey,
}: OfferMail) {
  return sendEmail(
    email,
    "Votre lien privé de covoiturage — Damien & Julie",
    `<div style="font-family:Inter,Arial,sans-serif;color:#293528;line-height:1.65;max-width:620px;margin:auto">
      <p>Bonjour ${escapeHtml(driverName)},</p>
      <p>Votre trajet <strong>${escapeHtml(journey)}</strong> est bien publié.</p>
      <p>Conservez ce lien privé pour modifier ou supprimer votre annonce et confirmer les passagers :</p>
      <p><a href="${escapeHtml(manageUrl)}" style="display:inline-block;padding:13px 19px;border-radius:999px;background:#3f5b3b;color:white;text-decoration:none;font-weight:700">Gérer mon trajet</a></p>
      <p style="font-size:13px;color:#6d756b">Ce lien est personnel. Ne le partagez pas publiquement.</p>
      <p>Bonne route,<br>Damien & Julie</p>
    </div>`,
  );
}

export function sendCarpoolRecoveryEmail(
  email: string,
  offers: Array<{ driverName: string; journey: string; manageUrl: string }>,
) {
  const links = offers
    .map(
      (offer) =>
        `<li style="margin:12px 0"><strong>${escapeHtml(offer.journey)}</strong><br><a href="${escapeHtml(offer.manageUrl)}">Gérer le trajet de ${escapeHtml(offer.driverName)}</a></li>`,
    )
    .join("");
  return sendEmail(
    email,
    "Retrouvez vos annonces de covoiturage — Damien & Julie",
    `<div style="font-family:Inter,Arial,sans-serif;color:#293528;line-height:1.65;max-width:620px;margin:auto"><p>Voici vos liens privés de gestion :</p><ul>${links}</ul><p>Bonne route,<br>Damien & Julie</p></div>`,
  );
}
