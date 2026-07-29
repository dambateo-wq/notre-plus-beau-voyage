"use client";

import { useEffect, useState } from "react";

const COMPLETED_KEY = "wedding-rsvp-completed";
const DISMISSED_KEY = "wedding-rsvp-reminder-dismissed";

export default function RsvpReminder() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (
      window.localStorage.getItem(COMPLETED_KEY) === "true" ||
      window.sessionStorage.getItem(DISMISSED_KEY) === "true"
    ) {
      return;
    }

    const startedAt = Date.now();

    function surveyIsVisible() {
      const survey = document.getElementById("sondage");
      if (!survey) return false;
      const rect = survey.getBoundingClientRect();
      return rect.top < window.innerHeight * 0.8 && rect.bottom > 0;
    }

    function showReminder() {
      if (
        window.localStorage.getItem(COMPLETED_KEY) !== "true" &&
        window.sessionStorage.getItem(DISMISSED_KEY) !== "true" &&
        !surveyIsVisible()
      ) {
        setOpen(true);
      }
    }

    function handleMouseOut(event: MouseEvent) {
      if (
        Date.now() - startedAt > 8000 &&
        event.clientY <= 8 &&
        event.relatedTarget === null
      ) {
        showReminder();
      }
    }

    function handleCompleted() {
      setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        window.sessionStorage.setItem(DISMISSED_KEY, "true");
        setOpen(false);
      }
    }

    const timer = window.setTimeout(showReminder, 60000);
    document.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("wedding-rsvp-completed", handleCompleted);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("wedding-rsvp-completed", handleCompleted);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, "true");
    setOpen(false);
  }

  function goToSurvey() {
    setOpen(false);
    document.getElementById("sondage")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  if (!open) return null;

  return (
    <div className="rsvp-reminder-backdrop" role="presentation">
      <section
        className="rsvp-reminder"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rsvp-reminder-title"
      >
        <button
          className="rsvp-reminder-close"
          type="button"
          onClick={dismiss}
          aria-label="Fermer"
        >
          ×
        </button>
        <span className="rsvp-reminder-icon">💌</span>
        <p className="eyebrow">Avant de repartir…</p>
        <h2 id="rsvp-reminder-title">Embarquerez-vous avec nous ?</h2>
        <p>
          Votre réponse nous aidera à préparer au mieux ce week-end. Cela ne
          prend que quelques minutes.
        </p>
        <div className="rsvp-reminder-actions">
          <button type="button" onClick={goToSurvey}>
            Remplir mon inscription
          </button>
          <button type="button" onClick={dismiss}>
            Je répondrai plus tard
          </button>
        </div>
      </section>
    </div>
  );
}
