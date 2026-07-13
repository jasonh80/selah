// Dev/diagnostic routes are OFF by default — safe for public. They only respond
// when ENABLE_DEV_ROUTES=true (set that on a private/preview deploy when needed).
export function devRoutesEnabled(): boolean {
  return process.env.ENABLE_DEV_ROUTES === "true";
}

// Legacy dev mutations fail closed: enabling the routes is never enough on its
// own. A configured REGEN_TOKEN and an exact request match are both required.
export function devMutationTokenAuthorized(request: Request): boolean {
  const expected = process.env.REGEN_TOKEN ?? "";
  if (!expected) return false;
  const provided = new URL(request.url).searchParams.get("token") ?? "";
  return provided === expected;
}
