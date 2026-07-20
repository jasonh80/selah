/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Netlify's CONTEXT ("production" | "deploy-preview" | "branch-deploy")
    // exists at BUILD time but is not reliably present in the SSR runtime
    // (Codex #77 P1: the review preview 404'd on the deploy preview). Baking
    // it here inlines the value at build, so the fail-closed preview gate
    // (lib/chapters/mark-6-revision-preview.ts) sees the real deploy context
    // at runtime. Empty string when unset — the gate stays closed on unknown.
    SELAH_DEPLOY_CONTEXT: process.env.CONTEXT ?? "",
  },
};

export default nextConfig;
