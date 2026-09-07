export async function register() {
  // Registrations the Node runtime needs before it serves a request. The
  // proxy runs on the edge runtime and reads none of them.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./modules");
  }
}
