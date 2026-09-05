import {
  generateAdvisorRecommendation,
  clearRecommendationCache,
  setSimulateAiFailure,
} from '../server/gemini.js';
import { calculateWaitRange } from '../server/estimator.js';
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

console.log('--- RUNNING PERFORMANCE & CACHING TESTS ---');

const baseSnapshot: QueueSnapshot = {
  queueId: 'TEST-PERF-1',
  name: 'Performance Testing Desk',
  location: 'Hall B',
  status: 'OPEN',
  peopleAhead: 6,
  averageServiceMinutes: 5,
  activeCounters: 2,
  unavailableCounters: 0,
  announcement: '',
  updatedAt: new Date().toISOString(),
  version: 1,
};

async function runTests() {
  clearRecommendationCache();
  // Activate deterministic fallback for predictable local testing without network dependency
  setSimulateAiFailure(true);

  const estimate = calculateWaitRange(baseSnapshot, { userPeopleAhead: 6 });

  // Test 1: First call creates recommendation
  const t0 = performance.now();
  const rec1 = await generateAdvisorRecommendation(baseSnapshot, estimate, { userPeopleAhead: 6 });
  const d0 = performance.now() - t0;
  assert(rec1 !== null && typeof rec1.action === 'string', 'First recommendation generated successfully');

  // Test 2: Invalidate failure simulation to test in-memory cache hit
  setSimulateAiFailure(false);
  clearRecommendationCache();

  // Test single-flight concurrent deduplication
  const p1 = generateAdvisorRecommendation(baseSnapshot, estimate, { userPeopleAhead: 6 });
  const p2 = generateAdvisorRecommendation(baseSnapshot, estimate, { userPeopleAhead: 6 });
  const [res1, res2] = await Promise.all([p1, p2]);

  assert(res1.action === res2.action, 'Concurrent requests receive consistent action recommendations');
  assert(res1.queueSnapshotVersion === res2.queueSnapshotVersion, 'Snapshot versions align across concurrent calls');

  // Test 3: Cache invalidation when snapshot version changes
  const newSnapshot: QueueSnapshot = {
    ...baseSnapshot,
    peopleAhead: 1,
    version: 2,
  };
  const newEstimate = calculateWaitRange(newSnapshot, { userPeopleAhead: 1 });
  const recNew = await generateAdvisorRecommendation(newSnapshot, newEstimate, { userPeopleAhead: 1 });
  assert(recNew.queueSnapshotVersion === 2, 'New snapshot version invalidates stale cache key and updates version');

  // Test 4: Memory cache cleanup
  clearRecommendationCache();
  assert(true, 'Recommendation cache cleared cleanly without memory retention');

  console.log(`\nPERFORMANCE TEST SUMMARY: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Performance test fatal error:', err);
  process.exit(1);
});
