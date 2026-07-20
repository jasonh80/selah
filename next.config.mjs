/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    // Netlify's CONTEXT ("production" | "deploy-preview" | "branch-deploy")
    // exists at BUILD time but is not reliably present in the SSR runtime.
    // Baking it here lets the fail-closed revision-preview gate
    // (lib/chapters/revision-previews.ts) see the real deploy context at
    // runtime via a LITERAL process.env read. Empty when unset — the gate
    // stays closed on unknown contexts.
    SELAH_DEPLOY_CONTEXT: process.env.CONTEXT ?? "",
  },
};

export default nextConfig;
