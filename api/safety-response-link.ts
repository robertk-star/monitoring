// Phase 12A-118
// Keep this direct Vercel route in sync with the consolidated Hobby-safe API.
// The real handler lives in api/index.ts and understands /api/safety-response-link
// through getRoute(req), so forwarding here prevents old direct-route code from
// creating employer-only tokens for Applicant Links.
export { default } from './index';
