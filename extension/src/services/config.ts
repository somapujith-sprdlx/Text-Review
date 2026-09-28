// Set VITE_API_BASE_URL in extension/.env.production to the deployed Worker URL.
// Shared by api.ts and deviceState.ts — kept in its own module so they don't
// have to import from each other.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'
