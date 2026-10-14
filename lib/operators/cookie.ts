/**
 * The operator session cookie's name. On its own so the proxy can check the
 * cookie is there without importing the database client; whether the session
 * behind it is any good is decided by `lib/operators/guards.ts`.
 */
export const OPERATOR_COOKIE = "corelith_operator";
