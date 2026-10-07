/** An import refused, with its status and its sentence (SET-11). */
export class ImportRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}
