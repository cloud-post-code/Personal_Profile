/**
 * Next.js server-startup hook: bootstrap the database on every deployment,
 * so the schema push (start script) is always followed by seeds + legacy
 * migrations and the DB begins in the correct structure. Best-effort — a
 * bootstrap failure logs and the server still boots.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { bootstrapDatabase } = await import("@/lib/bootstrap");
    await bootstrapDatabase();
    console.log("db bootstrap: complete");
  }
}
