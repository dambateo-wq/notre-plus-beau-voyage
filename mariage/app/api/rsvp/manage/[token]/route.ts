import { sendAdminFinancialChange, sendRegistrationConfirmation } from "@/lib/registration-email";
import {
  assertLodgingCapacity,
  clearLodgingPlacements,
  createFinancialChange,
  createLinkedLodging,
  getLinkedReservation,
  getRegistrationByToken,
  getRegistrationRecordByToken,
  lodgingAmount,
  lodgingSnapshot,
  patchRegistration,
  RegistrationValidationError,
  replaceLodgingDetails,
  reservationSnapshot,
  validateRegistrationInput,
} from "@/lib/registration";
import { updateLodgingReservation } from "@/lib/lodging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/rsvp/manage/[token]">) {
  try {
    const { token } = await context.params;
    const registration = await getRegistrationByToken(token);
    if (!registration) return Response.json({ error: "Ce lien d’inscription est invalide." }, { status: 404 });
    return Response.json(registration);
  } catch (caught) {
    console.error("registration.manage.read", caught);
    return Response.json({ error: "L’inscription ne peut pas être chargée." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext<"/api/rsvp/manage/[token]">) {
  try {
    const { token } = await context.params;
    const record = await getRegistrationRecordByToken(token);
    if (!record) return Response.json({ error: "Ce lien d’inscription est invalide." }, { status: 404 });

    const input = validateRegistrationInput(await request.json());
    const reservation = await getLinkedReservation(record);
    const newAmount = lodgingAmount(input);
    let pendingValidation = false;
    let previousAmountCents: number | undefined;

    if (!reservation) {
      if (newAmount > 0) await createLinkedLodging(record.id, input);
      await patchRegistration(record.id, input);
    } else {
      const oldDetails = reservationSnapshot(reservation);
      const newDetails = lodgingSnapshot(input);
      const lodgingChanged = JSON.stringify(oldDetails) !== JSON.stringify(newDetails);
      const placementChanged =
        JSON.stringify(oldDetails.guestNames) !== JSON.stringify(newDetails.guestNames) ||
        JSON.stringify(oldDetails.nights) !== JSON.stringify(newDetails.nights);

      if (newAmount > 0) {
        await assertLodgingCapacity(input.lodgingNights, input.lodgingGuestNames.length, reservation.id);
      }

      if (reservation.payment_status === "confirmed" && oldDetails.amountCents !== newAmount) {
        await patchRegistration(record.id, input);
        await createFinancialChange(record, reservation, input);
        pendingValidation = true;
        previousAmountCents = oldDetails.amountCents;
      } else {
        if (newAmount > 0) {
          await replaceLodgingDetails(reservation.id, input);
        } else {
          await updateLodgingReservation(reservation.id, {
            booking_status: "cancelled",
            financial_review_status: "none",
            previous_amount_cents: null,
            proposed_amount_cents: null,
          });
        }
        await patchRegistration(record.id, input);
        if (lodgingChanged && placementChanged) {
          await clearLodgingPlacements(reservation.id);
          await updateLodgingReservation(reservation.id, { placement_status: "pending" });
        }
      }
    }

    const manageUrl = new URL(`/inscription/manage/${token}`, request.url).toString();
    let emailSent = false;
    try {
      const result = await sendRegistrationConfirmation(input, manageUrl, {
        previousAmountCents,
        pendingValidation,
      });
      emailSent = result.sent;
    } catch (emailError) {
      console.error("registration.manage.email", emailError);
    }

    if (pendingValidation && previousAmountCents !== undefined) {
      try {
        await sendAdminFinancialChange(
          input.respondentName,
          previousAmountCents,
          newAmount,
          new URL("/admin", request.url).toString(),
        );
      } catch (emailError) {
        console.error("registration.manage.admin-email", emailError);
      }
    }

    return Response.json({
      success: true,
      manageUrl,
      emailSent,
      pendingValidation,
      previousAmountCents: previousAmountCents ?? null,
      newAmountCents: newAmount,
    });
  } catch (caught) {
    if (caught instanceof RegistrationValidationError) {
      return Response.json({ error: caught.message }, { status: 400 });
    }
    console.error("registration.manage.update", caught);
    return Response.json({ error: "La modification n’a pas pu être enregistrée." }, { status: 500 });
  }
}
