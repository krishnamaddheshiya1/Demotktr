/**
 * Centralized Application Constants for QueueLess
 * Shared across client UI and server estimation logic.
 */

export const DEFAULT_QUEUE_ID = 'CAMPUS-REG-4';
export const DEFAULT_STAFF_PASSCODE = 'STAFF2026';
export const STALE_THRESHOLD_MINUTES = 10;
export const DEFAULT_SERVICE_MINUTES = 5;
export const DEFAULT_RETURN_MINUTES = 5;

// Validation & Clamping Boundaries
export const MIN_PEOPLE_AHEAD = 0;
export const MAX_PEOPLE_AHEAD = 5000;
export const MIN_SERVICE_MINUTES = 1;
export const MAX_SERVICE_MINUTES = 180;
export const MIN_ACTIVE_COUNTERS = 0;
export const MAX_COUNTERS = 50;
export const MAX_RETURN_MINUTES = 120;
export const MAX_ANNOUNCEMENT_LENGTH = 300;
export const MAX_QUEUE_ID_LENGTH = 32;

// API Endpoints
export const API_ENDPOINTS = {
  HEALTH: '/api/health',
  QUEUE_SNAPSHOT: (queueId: string) => `/api/queues/${encodeURIComponent(queueId)}`,
  QUEUE_STREAM: (queueId: string) => `/api/queues/${encodeURIComponent(queueId)}/stream`,
  RECOMMENDATION: '/api/recommendation',
  DEMO_SCENARIO: (action: string) => `/api/demo/scenario/${encodeURIComponent(action)}`,
  TOGGLE_AI_FAILURE: '/api/demo/toggle-ai-failure',
  DEMO_STATUS: '/api/demo/status',
} as const;

export const VALID_ACCESSIBILITY_NEEDS = [
  'mobility_seating',
  'sensory_quiet',
  'extra_return_buffer',
  'visual_audio_assist',
  'staff_assist',
] as const;
