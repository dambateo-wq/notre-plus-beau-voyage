import Image from "next/image";
import { getPaymentDetails } from "@/lib/lodging";
import HoneymoonPaymentCard from "./HoneymoonPaymentCard";

export default function HoneymoonContribution() {
  const paymentDetails = getPaymentDetails();
  const contributionDetailsAreConfigured = Boolean(
    paymentDetails.weroPhone ||
      (paymentDetails.accountHolder && paymentDetails.iban && paymentDetails.bic),
  );

  return (
    <section className="honeymoon-section v2-reveal" id="voyage-de-noces">
      <div className="honeymoon-story">
        <div className="honeymoon-destination" aria-label="Destination envisagée, non confirmée">
          <Image
            src="/namibie-suricates.webp"
            alt="Des suricates dans les grands espaces de Namibie"
            fill
            sizes="(max-width: 1099px) calc(100vw - 60px), 45vw"
          />
          <span>Une piste qui nous fait rêver</span>
          <strong>Namibie</strong>
          <small>Peut-être notre prochaine escale…</small>
        </div>

        <div className="honeymoon-copy">
          <p className="v2-kicker"><span className="v2-section-number">04</span> Participer au voyage de noces</p>
          <h2>Prolonger<br /><em>l’aventure</em></h2>
          <div className="honeymoon-copy-text">
            <p>Après le Domaine du Massacan, notre plus beau voyage continuera encore un peu…</p>
            <p>Nous n’avons pas encore arrêté tous les détails de notre voyage de noces, mais une idée nous fait particulièrement rêver : partir à la découverte de la Namibie, ses grands espaces, ses déserts et ses safaris.</p>
            <p>Si vous souhaitez nous aider à écrire ce prochain chapitre, vous pouvez participer librement à notre voyage de noces.</p>
            <p>Chaque participation, petite ou grande, nous fera énormément plaisir.</p>
          </div>
          <p className="honeymoon-presence">Votre présence à nos côtés reste évidemment le plus beau des cadeaux.</p>
        </div>
      </div>

      {contributionDetailsAreConfigured ? (
        <HoneymoonPaymentCard
          accountHolder={paymentDetails.accountHolder}
          iban={paymentDetails.iban}
          bic={paymentDetails.bic}
          weroPhone={paymentDetails.weroPhone}
        />
      ) : (
        <div className="honeymoon-payment-card honeymoon-payment-unavailable">
          <p className="v2-kicker">Participer à notre voyage de noces</p>
          <h3>Les coordonnées seront bientôt disponibles.</h3>
        </div>
      )}
    </section>
  );
}
