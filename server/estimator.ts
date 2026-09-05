import {
  AdvisorRecommendation,
  DeterministicEstimate,
  QueueAction,
  QueueSnapshot,
  ConfidenceLevel,
  AccessibilityNeedId,
} from '../src/types.js';
import {
  STALE_THRESHOLD_MINUTES,
  MAX_PEOPLE_AHEAD,
  MIN_PEOPLE_AHEAD,
  MAX_SERVICE_MINUTES,
  MIN_SERVICE_MINUTES,
  MAX_COUNTERS,
  MIN_ACTIVE_COUNTERS,
  MAX_RETURN_MINUTES,
  MAX_ANNOUNCEMENT_LENGTH,
  MAX_QUEUE_ID_LENGTH,
  DEFAULT_SERVICE_MINUTES,
  DEFAULT_RETURN_MINUTES,
  VALID_ACCESSIBILITY_NEEDS,
} from '../src/constants.js';

export { STALE_THRESHOLD_MINUTES };

/**
 * Validates and clamps a queue snapshot.
 */
export function validateQueueSnapshot(snapshot: Partial<QueueSnapshot>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const idRegex = new RegExp(`^[A-Za-z0-9_-]{1,${MAX_QUEUE_ID_LENGTH}}$`);
  if (!snapshot.queueId || typeof snapshot.queueId !== 'string' || !idRegex.test(snapshot.queueId.trim())) {
    errors.push(`Queue ID must be between 1 and ${MAX_QUEUE_ID_LENGTH} alphanumeric characters, dashes, or underscores.`);
  }
  if (!snapshot.status || !['OPEN', 'PAUSED', 'CLOSED'].includes(snapshot.status)) {
    errors.push('Status must be OPEN, PAUSED, or CLOSED.');
  }
  if (
    typeof snapshot.peopleAhead !== 'number' ||
    !Number.isFinite(snapshot.peopleAhead) ||
    snapshot.peopleAhead < MIN_PEOPLE_AHEAD ||
    snapshot.peopleAhead > MAX_PEOPLE_AHEAD
  ) {
    errors.push(`People ahead must be a finite non-negative number between ${MIN_PEOPLE_AHEAD} and ${MAX_PEOPLE_AHEAD.toLocaleString()}.`);
  }
  if (
    typeof snapshot.averageServiceMinutes !== 'number' ||
    !Number.isFinite(snapshot.averageServiceMinutes) ||
    snapshot.averageServiceMinutes < MIN_SERVICE_MINUTES ||
    snapshot.averageServiceMinutes > MAX_SERVICE_MINUTES
  ) {
    errors.push(`Average service minutes must be between ${MIN_SERVICE_MINUTES} and ${MAX_SERVICE_MINUTES} minutes.`);
  }
  if (
    typeof snapshot.activeCounters !== 'number' ||
    !Number.isFinite(snapshot.activeCounters) ||
    !Number.isInteger(snapshot.activeCounters) ||
    snapshot.activeCounters < MIN_ACTIVE_COUNTERS ||
    snapshot.activeCounters > MAX_COUNTERS
  ) {
    errors.push(`Active counters must be an integer between ${MIN_ACTIVE_COUNTERS} and ${MAX_COUNTERS}.`);
  }
  if (
    typeof snapshot.unavailableCounters !== 'number' ||
    !Number.isFinite(snapshot.unavailableCounters) ||
    !Number.isInteger(snapshot.unavailableCounters) ||
    snapshot.unavailableCounters < 0 ||
    snapshot.unavailableCounters > MAX_COUNTERS
  ) {
    errors.push(`Unavailable counters must be an integer between 0 and ${MAX_COUNTERS}.`);
  }
  if (snapshot.activeCounters === 0 && snapshot.status === 'OPEN') {
    errors.push('Cannot set status to OPEN when active counters is 0.');
  }
  if (typeof snapshot.announcement === 'string' && snapshot.announcement.length > MAX_ANNOUNCEMENT_LENGTH) {
    errors.push(`Announcement note cannot exceed ${MAX_ANNOUNCEMENT_LENGTH} characters.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Calculates a bounded wait range and baseline action based on mathematical queuing formula.
 */
export function calculateWaitRange(
  snapshot: QueueSnapshot,
  userParams: {
    userPeopleAhead?: number;
    minutesNeededToReturn?: number;
    accessibilityNeeds?: AccessibilityNeedId[];
  } = {}
): DeterministicEstimate {
  // Rigorously guard against NaN, Infinity, and extreme boundaries
  const safePeopleRaw = Number.isFinite(userParams.userPeopleAhead)
    ? userParams.userPeopleAhead
    : Number.isFinite(snapshot.peopleAhead)
    ? snapshot.peopleAhead
    : 0;
  const people = Math.min(MAX_PEOPLE_AHEAD, Math.max(MIN_PEOPLE_AHEAD, Math.round(safePeopleRaw!)));

  const safeAvgRaw = Number.isFinite(snapshot.averageServiceMinutes) ? snapshot.averageServiceMinutes : DEFAULT_SERVICE_MINUTES;
  const avgServiceTime = Math.min(MAX_SERVICE_MINUTES, Math.max(MIN_SERVICE_MINUTES, Math.round(safeAvgRaw)));

  const safeActiveCountersRaw = Number.isFinite(snapshot.activeCounters) ? snapshot.activeCounters : 0;
  const activeCounters = Math.min(MAX_COUNTERS, Math.max(MIN_ACTIVE_COUNTERS, Math.floor(safeActiveCountersRaw)));

  const safeReturnRaw = Number.isFinite(userParams.minutesNeededToReturn) ? userParams.minutesNeededToReturn : DEFAULT_RETURN_MINUTES;
  const returnTravelMinutes = Math.min(MAX_RETURN_MINUTES, Math.max(0, Math.round(safeReturnRaw!)));

  const allowedNeeds: readonly AccessibilityNeedId[] = VALID_ACCESSIBILITY_NEEDS;
  const needs = Array.isArray(userParams.accessibilityNeeds)
    ? userParams.accessibilityNeeds.filter((n): n is AccessibilityNeedId => (allowedNeeds as readonly string[]).includes(n))
    : [];

  // Data freshness
  const now = Date.now();
  const lastUpdated = new Date(snapshot.updatedAt).getTime();
  const ageMinutes = Number.isFinite(lastUpdated) ? Math.max(0, Math.floor((now - lastUpdated) / (60 * 1000))) : 0;
  const isStale = ageMinutes >= STALE_THRESHOLD_MINUTES;

  const assumptions: string[] = [];

  // Special State 1: CLOSED
  if (snapshot.status === 'CLOSED') {
    return {
      minMinutes: 0,
      maxMinutes: 0,
      recommendedAction: 'COME_BACK_LATER',
      isStale,
      staleMinutes: ageMinutes,
      confidence: 'HIGH',
      assumptions: ['Counter service is currently closed for the day.'],
      formulaExplanation: 'Queue is closed; no active transactions are being served.',
      suggestedReturnMinutes: null,
    };
  }

  // Special State 2: PAUSED
  if (snapshot.status === 'PAUSED') {
    assumptions.push('Queue is temporarily paused by counter staff.');
    return {
      minMinutes: 30,
      maxMinutes: 60,
      recommendedAction: 'COME_BACK_LATER',
      isStale,
      staleMinutes: ageMinutes,
      confidence: 'MEDIUM',
      assumptions,
      formulaExplanation: 'Counter is paused for a staff break, sync, or maintenance.',
      suggestedReturnMinutes: 45,
    };
  }

  // Special State 3: ZERO ACTIVE COUNTERS
  if (activeCounters === 0) {
    assumptions.push('All service windows are currently offline.');
    return {
      minMinutes: 30,
      maxMinutes: 60,
      recommendedAction: 'COME_BACK_LATER',
      isStale,
      staleMinutes: ageMinutes,
      confidence: 'LOW',
      assumptions,
      formulaExplanation: '0 active counters available. Service cannot proceed until a window reopens.',
      suggestedReturnMinutes: 30,
    };
  }

  // Special State 4: ZERO PEOPLE AHEAD
  if (people === 0) {
    return {
      minMinutes: 0,
      maxMinutes: 3,
      recommendedAction: 'WAIT_HERE',
      isStale,
      staleMinutes: ageMinutes,
      confidence: isStale ? 'MEDIUM' : 'HIGH',
      assumptions: ['You are next in line or counter is immediately available.'],
      formulaExplanation: '0 people ahead. Immediate walk-up.',
      suggestedReturnMinutes: null,
    };
  }

  // General Queuing Formula:
  // Estimated Wait = (People Ahead / Active Counters) * Average Service Minutes
  const rawWait = (people / activeCounters) * avgServiceTime;

  // Compute lower and upper bounds with variance buffer
  let varianceFactor = 0.2; // +/- 20%
  if (isStale) {
    varianceFactor = 0.4; // Widen uncertainty bounds when data is stale (+/- 40%)
    assumptions.push(`Queue update is ${ageMinutes}m old; estimation bounds widened.`);
  }

  let minWait = Math.max(1, Math.round(rawWait * (1 - varianceFactor)));
  let maxWait = Math.max(minWait + 2, Math.round(rawWait * (1 + varianceFactor)));

  // Strict boundary clamp
  minWait = Number.isFinite(minWait) ? Math.min(1440, Math.max(1, minWait)) : 10;
  maxWait = Number.isFinite(maxWait) ? Math.min(1440, Math.max(minWait + 1, maxWait)) : minWait + 10;

  assumptions.push(
    `Serving ${people} people across ${activeCounters} active window${activeCounters > 1 ? 's' : ''} at ~${avgServiceTime} min/person.`
  );

  // Buffer for extra return if requested
  const travelBuffer = needs.includes('extra_return_buffer') ? returnTravelMinutes + 5 : returnTravelMinutes;
  if (needs.includes('extra_return_buffer')) {
    assumptions.push(`Includes additional 5 min buffer for accessibility return travel.`);
  }

  // Safe window if leaving:
  // If user leaves now, they need `travelBuffer` to walk back plus 3 min safety margin.
  const safeAwayTime = minWait - travelBuffer - 3;

  let action: QueueAction = 'WAIT_HERE';
  let suggestedReturnMinutes: number | null = null;

  if (minWait <= 15 || safeAwayTime < 8) {
    // Too short or risky to leave the vicinity
    action = 'WAIT_HERE';
    suggestedReturnMinutes = null;
  } else if (minWait > 50 || rawWait > 55) {
    // Very long wait
    action = 'COME_BACK_LATER';
    suggestedReturnMinutes = Math.max(15, minWait - travelBuffer);
    assumptions.push(`Expected wait exceeds 50 minutes. Visiting later is recommended.`);
  } else {
    // Intermediate wait: 16 to 50 min and user has ample return travel window
    action = 'WAIT_ELSEWHERE';
    suggestedReturnMinutes = Math.max(5, minWait - travelBuffer);
    assumptions.push(`Safe to step away for up to ~${suggestedReturnMinutes} minutes before returning.`);
  }

  let confidence: ConfidenceLevel = 'HIGH';
  if (isStale) {
    confidence = 'LOW';
  } else if (people > 15 || snapshot.unavailableCounters > 0) {
    confidence = 'MEDIUM';
  }

  return {
    minMinutes: minWait,
    maxMinutes: maxWait,
    recommendedAction: action,
    isStale,
    staleMinutes: ageMinutes,
    confidence,
    assumptions,
    formulaExplanation: `Deterministic estimate based on ${people} people / ${activeCounters} windows × ${avgServiceTime}m.`,
    suggestedReturnMinutes,
  };
}

/**
 * Builds a deterministic fallback recommendation conforming to AdvisorRecommendation.
 */
export function buildFallbackRecommendation(
  snapshot: QueueSnapshot,
  deterministic: DeterministicEstimate,
  userParams: {
    userPeopleAhead?: number;
    minutesNeededToReturn?: number;
    accessibilityNeeds?: AccessibilityNeedId[];
  } = {},
  reason = 'Gemini AI unavailable; deterministic rule engine used.'
): AdvisorRecommendation {
  const { recommendedAction, minMinutes, maxMinutes, confidence, assumptions, suggestedReturnMinutes } =
    deterministic;
  const needs = userParams.accessibilityNeeds ?? [];

  let explanation = '';
  let nextStep = '';

  switch (recommendedAction) {
    case 'WAIT_HERE':
      explanation = `Your expected wait is only ${minMinutes}–${maxMinutes} minutes with ${snapshot.activeCounters} counter(s) active. It is safest to remain in the immediate waiting area so you do not miss your number.`;
      nextStep = 'Stay seated in the lobby or near the counter display screens.';
      break;
    case 'WAIT_ELSEWHERE':
      explanation = `Estimated wait is ${minMinutes}–${maxMinutes} minutes. You have approximately ${suggestedReturnMinutes} minutes of safe time to step outside, visit a nearby campus café, or study in the library.`;
      nextStep = `Set your timer and return to Counter 4 in approximately ${suggestedReturnMinutes} minutes.`;
      break;
    case 'COME_BACK_LATER':
      if (snapshot.status === 'PAUSED') {
        explanation = 'The counter is currently paused by staff. Transactions are temporarily on hold.';
        nextStep = 'Check back in 30–45 minutes or monitor the live queue updates online.';
      } else if (snapshot.status === 'CLOSED') {
        explanation = 'The counter is closed for the day.';
        nextStep = 'Please return during normal operating hours tomorrow.';
      } else {
        explanation = `Heavy queue depth with an estimated wait of ${minMinutes}–${maxMinutes} minutes. Remaining in line now will cause substantial idle waiting.`;
        nextStep = `We advise returning around peak low or checking back in ${suggestedReturnMinutes ?? 45} minutes.`;
      }
      break;
  }

  // Tailored accessibility guidance
  const guidanceParts: string[] = [];
  if (needs.includes('mobility_seating')) {
    guidanceParts.push('Accessible seating benches are available in Hall B across from Counter 4.');
  }
  if (needs.includes('sensory_quiet')) {
    guidanceParts.push('Quiet study nooks with natural light are located on the 2nd floor mezzanine (2 min walk).');
  }
  if (needs.includes('extra_return_buffer')) {
    guidanceParts.push('A 5-minute return buffer has been added to your target check-in time.');
  }
  if (needs.includes('visual_audio_assist')) {
    guidanceParts.push('High-contrast LED screens and audio bell chimes ring at Counter 4 when each number is called.');
  }
  if (needs.includes('staff_assist')) {
    guidanceParts.push('Please let the greeter at Window 1 know if you need physical assistance upon arrival.');
  }
  if (guidanceParts.length === 0) {
    guidanceParts.push('Standard lobby amenities and digital displays are operational.');
  }

  return {
    action: recommendedAction,
    waitMinMinutes: minMinutes,
    waitMaxMinutes: maxMinutes,
    confidence,
    returnInMinutes: suggestedReturnMinutes,
    explanation,
    nextStep,
    accessibilityGuidance: guidanceParts.join(' '),
    assumptions,
    source: 'deterministic_fallback',
    fallbackReason: reason,
    computedAt: new Date().toISOString(),
    queueSnapshotVersion: snapshot.version,
  };
}
