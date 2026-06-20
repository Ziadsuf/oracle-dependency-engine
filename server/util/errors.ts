// Narrow an unknown caught value to a human-readable message, so handlers can
// use `catch (err: unknown)` (type-safe) instead of `catch (err: any)`.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}
