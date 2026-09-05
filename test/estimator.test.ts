import {
  calculateWaitRange,
  buildFallbackRecommendation,
  validateQueueSnapshot,
  STALE_THRESHOLD_MINUTES,
} from '../server/estimator.js';
import { QueueSnapshot } from '../src/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: unknown) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`, detail ?? '');
    failed++;
  }
}

const baseSnapshot: QueueSnapshot = {
  queueId: 'TEST-1',
  name: 'Test Desk',
  location: 'Hall A',
  status: 'OPEN',
  peopleAhead: 6,
  averageServiceMinutes: 5,
  activeCounters: 2,
  unavailableCounters: 0,
  announcement: '',
  updatedAt: new Date().toISOString(),
  version: 1,
};

console.log('--- RUNNING QUEUE ESTIMATOR TESTS ---');

// 1. Normal Flow
{
  const result = calculateWaitRange(baseSnapshot, { userPeopleAhead: 6 });
  // (6 people / 2 counters) * 5 min = 15 min expected
  // minWait ~ 12, maxWait ~ 19
  assert(result.minMinutes >= 11 && result.minMinutes <= 13, 'Normal flow calculates bounded lower wait', result);
  assert(result.maxMinutes >= 18 && result.maxMinutes <= 20, 'Normal flow calculates bounded upper wait', result);
  assert(result.recommendedAction === 'WAIT_HERE', '15 min wait qualifies for WAIT_HERE action', result);
}

// 2. Longer Wait with return window -> WAIT_ELSEWHERE
{
  const longSnapshot: QueueSnapshot = { ...baseSnapshot, peopleAhead: 14 };
  // (14 / 2) * 5 = 35 min expected wait
  const result = calculateWaitRange(longSnapshot, { minutesNeededToReturn: 10 });
  assert(result.recommendedAction === 'WAIT_ELSEWHERE', '35 min wait with 10m return recommends WAIT_ELSEWHERE', result);
  assert(result.suggestedReturnMinutes !== null && result.suggestedReturnMinutes > 0, 'Provides safe return time', result);
}

// 3. Very Long Wait -> COME_BACK_LATER
{
  const surgeSnapshot: QueueSnapshot = { ...baseSnapshot, peopleAhead: 35 };
  // (35 / 2) * 5 = 87.5 min expected wait
  const result = calculateWaitRange(surgeSnapshot);
  assert(result.recommendedAction === 'COME_BACK_LATER', 'Heavy queue depth recommends COME_BACK_LATER', result);
}

// 4. Closed Queue State
{
  const closedSnapshot: QueueSnapshot = { ...baseSnapshot, status: 'CLOSED' };
  const result = calculateWaitRange(closedSnapshot);
  assert(result.recommendedAction === 'COME_BACK_LATER', 'Closed queue returns COME_BACK_LATER', result);
  assert(result.minMinutes === 0 && result.maxMinutes === 0, 'Closed queue wait minutes is 0', result);
}

// 5. Paused Queue State
{
  const pausedSnapshot: QueueSnapshot = { ...baseSnapshot, status: 'PAUSED' };
  const result = calculateWaitRange(pausedSnapshot);
  assert(result.recommendedAction === 'COME_BACK_LATER', 'Paused queue returns COME_BACK_LATER', result);
  assert(result.assumptions.some((a) => a.includes('paused')), 'Paused assumption recorded', result);
}

// 6. Zero Active Counters (Outage)
{
  const outageSnapshot: QueueSnapshot = { ...baseSnapshot, activeCounters: 0, unavailableCounters: 2 };
  const result = calculateWaitRange(outageSnapshot);
  assert(result.recommendedAction === 'COME_BACK_LATER', 'Zero counters returns COME_BACK_LATER', result);
  assert(result.confidence === 'LOW', 'Zero counters sets confidence to LOW', result);
}

// 7. Stale Data Widening
{
  // 25 minutes ago
  const staleTime = new Date(Date.now() - 25 * 60 * 1000).toISOString();
  const staleSnapshot: QueueSnapshot = { ...baseSnapshot, updatedAt: staleTime };
  const result = calculateWaitRange(staleSnapshot);
  assert(result.isStale === true, 'Snapshot older than threshold detected as stale', result);
  assert(result.confidence === 'LOW', 'Stale data drops confidence to LOW', result);
  assert(result.maxMinutes > 20, 'Stale data widens uncertainty bounds', result);
}

// 8. Boundary & Negative Clamping
{
  const negativeSnapshot: QueueSnapshot = { ...baseSnapshot, peopleAhead: -10, averageServiceMinutes: -5 };
  const result = calculateWaitRange(negativeSnapshot, { userPeopleAhead: -5, minutesNeededToReturn: -10 });
  assert(result.minMinutes >= 0, 'Negative values safely clamped to non-negative', result);
  assert(result.maxMinutes >= result.minMinutes, 'Max minutes always >= min minutes', result);
}

// 9. Accessibility Buffering
{
  const accessSnapshot: QueueSnapshot = { ...baseSnapshot, peopleAhead: 12 };
  const normal = calculateWaitRange(accessSnapshot, { minutesNeededToReturn: 5 });
  const buffered = calculateWaitRange(accessSnapshot, {
    minutesNeededToReturn: 5,
    accessibilityNeeds: ['extra_return_buffer', 'mobility_seating'],
  });
  assert(
    buffered.assumptions.some((a) => a.includes('5 min buffer')),
    'Accessibility return buffer applied in assumptions',
    buffered
  );
}

// 10. Fallback Recommendation Conformance
{
  const est = calculateWaitRange(baseSnapshot);
  const fallback = buildFallbackRecommendation(baseSnapshot, est, {
    accessibilityNeeds: ['mobility_seating', 'sensory_quiet'],
  });
  assert(fallback.source === 'deterministic_fallback', 'Fallback specifies deterministic source', fallback);
  assert(
    fallback.accessibilityGuidance.includes('benches') && fallback.accessibilityGuidance.includes('Quiet study'),
    'Fallback includes tailored guidance for selected accommodations',
    fallback
  );
}

// 11. Snapshot Validation
{
  const valid = validateQueueSnapshot(baseSnapshot);
  assert(valid.valid === true, 'Base snapshot passes validation', valid);

  const invalid = validateQueueSnapshot({
    queueId: '',
    status: 'OPEN',
    activeCounters: 0,
    peopleAhead: -1,
  });
  assert(invalid.valid === false && invalid.errors.length >= 3, 'Invalid snapshot caught by validator', invalid);
}

console.log(`\nTEST SUMMARY: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL UNIT TESTS PASSED SUCCESSFULLY!\n');
}
