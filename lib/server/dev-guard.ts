// Dev/diagnostic routes are OFF by default — safe for public. They only respond
// when ENABLE_DEV_ROUTES=true (set that on a private/preview deploy when needed).
export function devRoutesEnabled(): boolean {
  return process.env.ENABLE_DEV_ROUTES === "true";
}
