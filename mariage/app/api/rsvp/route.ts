import { sendRegistrationConfirmation } from "@/lib/registration-email";
import {
  createLinkedLodging,
  createManagementToken,
  deleteRegistration,
  insertRegistration,
  lodgingAmount,
  RegistrationValidationError,
  validateRegistrationInput,
} from "@/lib/registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let createdResponseId: string | null = null;
  try {
    const input = validateRegistrationInput(await request.json());
    const { token, hash } = createManagementToken();
    const registration = await insertRegistration(input, hash);
    createdResponseId = registration.id;

    let reservation = null;
    if (lodgingAmount(input) > 0) {
      reservation = await createLinkedLodging(registration.id, input);
    }

    const manageUrl = new URL(`/inscription/manage/${token}`, request.url).toString();
    let emailSent = false;
    try {
      const result = await sendRegistrationConfirmation(input, manageUrl);
      emailSent = result.sent;
    } catch (emailError) {
      console.error("registration.email", emailError);
    }

    return Response.json(
      {
        success: true,
        manageUrl,
        emailSent,
        reservation: reservation
          ? {
              reference: reservation.reference,
              amountCents: reservation.amount_cents,
              paymentStatus: reservation.payment_status,
            }
          : null,
      },
      { status: 201 },
    );
  } catch (caught) {
    if (createdResponseId) {
      try {
        await deleteRegistration(createdResponseId);
      } catch (rollbackError) {
        console.error("registration.rollback", rollbackError);
      }
    }
    if (caught instanceof RegistrationValidationError) {
      return Response.json({ error: caught.message }, { status: 400 });
    }
    console.error("registration.create", caught);
    return Response.json(
      { error: "La réponse n’a pas pu être enregistrée. Réessayez." },
      { status: 500 },
    );
  }
}
