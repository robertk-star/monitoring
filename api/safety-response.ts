// Phase 12A-118
// Forward public response form API calls to the consolidated handler in api/index.ts.
// This prevents the old direct route from ignoring Applicant Link mode and keeps
// applicant signatures / employer submissions on the same current workflow.
export { default } from './index';
