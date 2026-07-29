"use client";

import { useEffect, useState } from "react";

const WEDDING_DATE = new Date("2027-05-29T00:00:00+02:00");

function getDaysRemaining() {
  return Math.max(
    0,
    Math.ceil((WEDDING_DATE.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
  );
}

export default function WeddingCountdown() {
  const [days, setDays] = useState(getDaysRemaining);

  useEffect(() => {
    const timer = window.setInterval(
      () => setDays(getDaysRemaining()),
      60 * 60 * 1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="wedding-countdown" aria-label={`${days} jours avant le mariage`}>
      {days > 0 ? (
        <>
          <strong>J − {days}</strong>
          <span>avant le grand départ</span>
        </>
      ) : (
        <>
          <strong>C’est aujourd’hui !</strong>
          <span>Notre plus beau voyage commence</span>
        </>
      )}
    </div>
  );
}
