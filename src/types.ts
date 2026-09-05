export type QueueStatus = 'OPEN' | 'PAUSED' | 'CLOSED';

export type QueueAction = 'WAIT_HERE' | 'WAIT_ELSEWHERE' | 'COME_BACK_LATER';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type AccessibilityNeedId =
  | 'mobility_seating'
  | 'sensory_quiet'
  | 'extra_return_buffer'
  | 'visual_audio_assist'
  | 'staff_assist';

export interface AccessibilityNeedOption {
  id: AccessibilityNeedId;
  label: string;
  description: string;
}

export interface QueueSnapshot {
  queueId: string;
  name: string;
  location: string;
  status: QueueStatus;
  peopleAhead: number;
  averageServiceMinutes: number;
  activeCounters: number;
  unavailableCounters: number;
  announcement: string;
  updatedAt: string; // ISO string
  version: number;
}

export interface DeterministicEstimate {
  minMinutes: number;
  maxMinutes: number;
  recommendedAction: QueueAction;
  isStale: boolean;
  staleMinutes: number;
  confidence: ConfidenceLevel;
  assumptions: string[];
  formulaExplanation: string;
  suggestedReturnMinutes: number | null;
}

export interface AdvisorRecommendation {
  action: QueueAction;
  waitMinMinutes: number;
  waitMaxMinutes: number;
  confidence: ConfidenceLevel;
  returnInMinutes: number | null;
  explanation: string;
  nextStep: string;
  accessibilityGuidance: string;
  assumptions: string[];
  source: 'gemini' | 'deterministic_fallback';
  fallbackReason?: string;
  computedAt: string;
  queueSnapshotVersion: number;
}

export interface RecommendationRequest {
  queueId: string;
  peopleAhead?: number;
  minutesNeededToReturn?: number;
  accessibilityNeeds?: AccessibilityNeedId[];
}

export interface StaffUpdateRequest {
  status: QueueStatus;
  peopleAhead: number;
  averageServiceMinutes: number;
  activeCounters: number;
  unavailableCounters: number;
  announcement: string;
  passcode?: string;
}

export type UserRole = 'visitor' | 'staff' | 'admin';

export interface UserProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  createdAt: string;
  preferredQueueCode?: string;
}

export interface SavedVisit {
  id: string;
  queueId: string;
  queueName: string;
  action: QueueAction;
  waitMinMinutes: number;
  waitMaxMinutes: number;
  savedAt: string;
  notes?: string;
}

