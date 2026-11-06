import { liveApi } from './live';
import { mockApi } from './mock';
import type { StavvrosApi } from './types';

/** Mock by default. Run with VITE_API_MODE=live to talk to the FastAPI backend on :8000. */
export const api: StavvrosApi = import.meta.env.VITE_API_MODE === 'live' ? liveApi : mockApi;
export type { StavvrosApi };
