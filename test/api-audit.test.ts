import {
  calculateWaitRange,
  validateQueueSnapshot,
  buildFallbackRecommendation,
} from '../server/estimator.js';
import { verifyPasscode, sanitizeText, STAFF_PASSCODE } from '../server/queueStore.js';
import {
  DEFAULT_QUEUE_ID,
  DEFAULT_STAFF_PASSCODE,
  STALE_THRESHOLD_MINUTES,
  MAX_PEOPLE_AHEAD,
  MAX_SERVICE_MINUTES,
  MIN_SERVICE_MINUTES,
  MAX_COUNTERS,
  VALID_ACCESSIBILITY_NEEDS,
} from '../src/constants.js';
import { QueueSnapshot } from '../src/types.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, description: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${description}`);
    failed++;
  }
}

console.log('--- RUNNING AUDIT INTEGRITY TESTS ---');

// Test 1: Constants contract
assert(DEFAULT_QUEUE_ID === 'CAMPUS-REG-4', 'Default queue ID is consistent');
assert(DEFAULT_STAFF_PASSCODE === 'STAFF2026', 'Default staff passcode is consistent');
assert(STALE_THRESHOLD_MINUTES === 10, 'Stale threshold is standardized');
assert(VALID_ACCESSIBILITY_NEEDS.length === 5, 'Accessibility needs array is complete');

// Test 2: Extreme value clamping
const extremeSnapshot: QueueSnapshot = {
  queueId: DEFAULT_QUEUE_ID,
  name: 'Test',
  location: 'Hall',
  status: 'OPEN',
  peopleAhead: 999999, // Should be clamped
  averageServiceMinutes: 999, // Should be clamped
  activeCounters: 100, // Should be clamped
  unavailableCounters: 50,
  announcement: 'x'.repeat(500),
  updatedAt: new Date().toISOString(),
  version: 1,
};

const clampedEst = calculateWaitRange(extremeSnapshot, {
  userPeopleAhead: 999999,
  minutesNeededToReturn: 9999,
});
assert(Number.isFinite(clampedEst.minMinutes), 'Clamped minMinutes is finite');
assert(Number.isFinite(clampedEst.maxMinutes), 'Clamped maxMinutes is finite');
assert(clampedEst.maxMinutes >= clampedEst.minMinutes, 'Clamped maxMinutes >= minMinutes');

// Test 3: Validation catches out of range
const invalid = validateQueueSnapshot({
  queueId: '',
  peopleAhead: -5,
  averageServiceMinutes: 0,
  activeCounters: 999,
  status: 'OPEN',
});
assert(!invalid.valid, 'Validator rejects out-of-range parameters');
assert(invalid.errors.length >= 4, 'Validator reports all out-of-range fields');

// Test 4: Accessibility filter security
const mockSnapshot: QueueSnapshot = {
  queueId: DEFAULT_QUEUE_ID,
  name: 'Test',
  location: 'Hall',
  status: 'OPEN',
  peopleAhead: 5,
  averageServiceMinutes: 5,
  activeCounters: 2,
  unavailableCounters: 0,
  announcement: '',
  updatedAt: new Date().toISOString(),
  version: 1,
};

const badNeedsEst = calculateWaitRange(mockSnapshot, {
  accessibilityNeeds: ['<script>alert(1)</script>' as any, 'mobility_seating'],
});
const fallbackWithNeeds = buildFallbackRecommendation(
  mockSnapshot,
  badNeedsEst,
  { accessibilityNeeds: ['<script>alert(1)</script>' as any, 'mobility_seating'] }
);

assert(
  typeof fallbackWithNeeds.accessibilityGuidance === 'string' &&
    fallbackWithNeeds.accessibilityGuidance.includes('seating'),
  'Valid accessibility need accepted into guidance'
);
assert(
  !fallbackWithNeeds.accessibilityGuidance?.includes('script'),
  'XSS injection filtered out from accessibility guidance'
);

// Test 5: Timing-safe passcode verification
assert(verifyPasscode(STAFF_PASSCODE), 'Passcode verification succeeds with valid credentials');
assert(!verifyPasscode('WRONG_CODE_12345'), 'Passcode verification rejects incorrect passcode');
assert(!verifyPasscode(''), 'Passcode verification rejects empty string');
assert(!verifyPasscode(null as any), 'Passcode verification handles null safely');
assert(!verifyPasscode(undefined as any), 'Passcode verification handles undefined safely');
assert(verifyPasscode(`  ${STAFF_PASSCODE}  `), 'Passcode verification safely trims and verifies credentials');

// Test 6: Sanitization security
const maliciousMarkup = '<img src=x onerror="alert(1)">Important announcement &amp; alert';
const cleaned = sanitizeText(maliciousMarkup);
assert(!cleaned.includes('<img'), 'sanitizeText strips HTML tags');
assert(!cleaned.includes('onerror'), 'sanitizeText neutralizes event handlers');
assert(cleaned.includes('Important announcement'), 'sanitizeText preserves legitimate text');

console.log(`\nAUDIT TEST SUMMARY: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
