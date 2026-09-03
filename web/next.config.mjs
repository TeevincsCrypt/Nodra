import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pins the file-tracing root to this directory (web/) explicitly. Without this, Next.js
  // walks upward looking for the nearest lockfile and can pick the wrong one when this app
  // lives in a subdirectory of a larger repo that also has its own lockfile at the root
  // (this repo does — the Foundry/off-chain tooling has its own package.json). Vercel's
  // "Root Directory" project setting scopes the build to this folder already, so this
  // mainly guards local/monorepo-style checkouts against the wrong root being inferred.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
