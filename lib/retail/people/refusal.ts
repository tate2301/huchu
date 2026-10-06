/**
 * A People request refused, with the status and the sentence the spec gives
 * (80-admin 4.1): under a field (400 `fieldErrors`), or as one sentence
 * (403 role rule, 404, 409).
 */
export class PeopleRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 429,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "PeopleRefusal";
  }
}

export const PERSON_NOT_FOUND = "That person is not in this shop.";

export function fieldRefusal(fieldErrors: Record<string, string>): PeopleRefusal {
  return new PeopleRefusal("Validation failed", 400, fieldErrors);
}
