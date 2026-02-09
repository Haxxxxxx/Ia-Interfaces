/**
 * Next.js instrumentation - runs once at server startup
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run validation on server startup (not in client bundle)
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupValidation } = await import("./lib/startup-validation");
    await runStartupValidation();
  }
}
