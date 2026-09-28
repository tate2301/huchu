/**
 * What each refusal from the signup API says to the person in front of it.
 * One line each: what happened, and what to do.
 */
export function describeSignupRefusal(reason: string | undefined, retryAfterSeconds?: number): string {
  switch (reason) {
    case "INVALID_NAME":
      return "Enter a name of at least two letters.";
    case "INVALID_EMAIL":
      return "That address is missing something. Check it and try again.";
    case "ACCOUNT_EXISTS":
      return "That address already has a workspace. Sign in at its address, or use another email.";
    case "TOO_SOON":
      return `Wait ${retryAfterSeconds ?? 30} seconds before asking for another code.`;
    case "TOO_MANY":
    case "RATE_LIMITED":
      return `Too many tries. Wait ${Math.ceil((retryAfterSeconds ?? 60) / 60)} minutes and try again.`;
    case "EMAIL_FAILED":
      return "We could not send the email. Check the address and try again.";
    case "INVALID":
      return "That code did not match. Check the newest email, or send a new code.";
    case "EXPIRED":
      return "That code has expired. Send a new one.";
    case "LOCKED":
      return "Too many wrong tries for that code. Send a new one.";
    case "MISSING":
      return "That code has been used or replaced. Send a new one.";
    case "INVALID_WHATSAPP":
      return "Enter a Zimbabwean mobile number, like 077 123 4567.";
    case "NOT_FOUND":
      return "This signup has expired. Start again.";
    default:
      return "Something went wrong on our side. Try again.";
  }
}
