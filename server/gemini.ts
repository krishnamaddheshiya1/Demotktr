import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import {
  AdvisorRecommendation,
  DeterministicEstimate,
  QueueAction,
  QueueSnapshot,
  AccessibilityNeedId,
} from '../src/types.js';
import { buildFallbackRecommendation } from './estimator.js';

let aiClient: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI | null {
  if (aiClient) return aiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  aiClient = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
  return aiClient;
}

// Global toggle for testing fallback resilience during demonstrations
let simulateAiFailure = false;

export function setSimulateAiFailure(val: boolean) {
  simulateAiFailure = val;
  if (val) {
    // Clear cache when simulated failure is toggled so fallbacks can be tested
    recommendationCache.clear();
  }
}

export function getSimulateAiFailure(): boolean {
  return simulateAiFailure;
}

/**
 * In-memory TTL cache and single-flight de-duplicator
 * Prevents duplicate Gemini calls during concurrent bursts, page refreshes, and SSE updates.
 */
interface CacheEntry {
  recommendation: AdvisorRecommendation;
  expiresAt: number;
}

const recommendationCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<AdvisorRecommendation>>();
const CACHE_TTL_MS = 45000; // 45 seconds
const MAX_CACHE_ENTRIES = 500;

function computeCacheKey(
  snapshot: QueueSnapshot,
  userParams: {
    userPeopleAhead?: number;
    minutesNeededToReturn?: number;
    accessibilityNeeds?: AccessibilityNeedId[];
  }
): string {
  const people = userParams.userPeopleAhead ?? snapshot.peopleAhead;
  const returnMin = userParams.minutesNeededToReturn ?? 5;
  const sortedNeeds = (userParams.accessibilityNeeds || []).slice().sort().join(',');
  return `${snapshot.queueId}:v${snapshot.version}:ahead${people}:ret${returnMin}:needs[${sortedNeeds}]`;
}

export function clearRecommendationCache() {
  recommendationCache.clear();
}

export async function generateAdvisorRecommendation(
  snapshot: QueueSnapshot,
  deterministic: DeterministicEstimate,
  userParams: {
    userPeopleAhead?: number;
    minutesNeededToReturn?: number;
    accessibilityNeeds?: AccessibilityNeedId[];
  } = {}
): Promise<AdvisorRecommendation> {
  // If simulated failure is toggled for demo
  if (simulateAiFailure) {
    return buildFallbackRecommendation(
      snapshot,
      deterministic,
      userParams,
      'AI Failure Mode manually simulated for resilience testing.'
    );
  }

  const cacheKey = computeCacheKey(snapshot, userParams);

  // 1. Check in-memory cache
  const cached = recommendationCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.recommendation;
  }

  // 2. Check for in-flight request to deduplicate concurrent calls
  const existingPromise = inFlightRequests.get(cacheKey);
  if (existingPromise) {
    return await existingPromise;
  }

  const ai = getGenAI();
  if (!ai) {
    const fallback = buildFallbackRecommendation(
      snapshot,
      deterministic,
      userParams,
      'No GEMINI_API_KEY configured in environment; deterministic engine active.'
    );
    return fallback;
  }

  const timeoutMs = 6000;
  const requestExecution = (async (): Promise<AdvisorRecommendation> => {
    const callPromise = async (): Promise<AdvisorRecommendation> => {
    const promptContext = {
      queueSnapshot: {
        name: snapshot.name,
        location: snapshot.location,
        status: snapshot.status,
        peopleAheadInQueue: snapshot.peopleAhead,
        userPeopleAhead: userParams.userPeopleAhead ?? snapshot.peopleAhead,
        averageServiceMinutes: snapshot.averageServiceMinutes,
        activeCounters: snapshot.activeCounters,
        unavailableCounters: snapshot.unavailableCounters,
        staffAnnouncement: snapshot.announcement || 'None',
        isStale: deterministic.isStale,
        staleMinutes: deterministic.staleMinutes,
      },
      deterministicEstimate: {
        minMinutes: deterministic.minMinutes,
        maxMinutes: deterministic.maxMinutes,
        recommendedAction: deterministic.recommendedAction,
        formulaExplanation: deterministic.formulaExplanation,
        suggestedReturnMinutes: deterministic.suggestedReturnMinutes,
        assumptions: deterministic.assumptions,
      },
      userConstraints: {
        minutesNeededToReturn: userParams.minutesNeededToReturn ?? 5,
        accessibilityNeeds: userParams.accessibilityNeeds ?? [],
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: JSON.stringify(promptContext),
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        systemInstruction: `You are QueueLess, an expert live queue action advisor for a campus office or clinic counter.
Your job is to interpret the real-time queue snapshot, staff announcements (such as outages, counter reboots, pause notices), user travel constraints, and accessibility requirements.

MANDATORY RULES:
1. You MUST select exactly ONE action from: "WAIT_HERE", "WAIT_ELSEWHERE", "COME_BACK_LATER".
2. Respect the deterministic wait range bounds: waitMinMinutes must be close to ${deterministic.minMinutes} and waitMaxMinutes must be close to ${deterministic.maxMinutes}. Do not invent wildly divergent numbers.
3. If the queue is PAUSED or CLOSED, action MUST be "COME_BACK_LATER".
4. If activeCounters is 0, action MUST be "COME_BACK_LATER".
5. If waitMinMinutes <= 15 or safe away time is less than 8 min, prefer "WAIT_HERE".
6. If waitMinMinutes > 50, prefer "COME_BACK_LATER".
7. Address any staff announcement (e.g. system outages or delays) directly in the explanation.
8. If accessibility needs are specified (such as mobility seating, sensory quiet space, or extra return buffer), provide specific, practical guidance for that context.
9. Return strictly valid JSON adhering to the specified schema.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: {
              type: Type.STRING,
              description: 'Must be one of: WAIT_HERE, WAIT_ELSEWHERE, COME_BACK_LATER',
            },
            waitMinMinutes: {
              type: Type.NUMBER,
              description: 'Estimated lower bound of wait time in minutes',
            },
            waitMaxMinutes: {
              type: Type.NUMBER,
              description: 'Estimated upper bound of wait time in minutes',
            },
            confidence: {
              type: Type.STRING,
              description: 'Must be LOW, MEDIUM, or HIGH',
            },
            returnInMinutes: {
              type: Type.NUMBER,
              description: 'Safe minutes before user must start walking back, or null if waiting here',
            },
            explanation: {
              type: Type.STRING,
              description: 'Plain-language, empathetic 1-2 sentence explanation of the recommendation',
            },
            nextStep: {
              type: Type.STRING,
              description: 'Actionable next step for the visitor',
            },
            accessibilityGuidance: {
              type: Type.STRING,
              description: 'Specific advice tailored to any selected accessibility accommodations',
            },
            assumptions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key assumptions underpinning this calculation',
            },
          },
          required: [
            'action',
            'waitMinMinutes',
            'waitMaxMinutes',
            'confidence',
            'explanation',
            'nextStep',
            'accessibilityGuidance',
            'assumptions',
          ],
        },
      },
    });

    const rawText = response.text?.trim() || '';
    // Strip possible markdown fences or unexpected formatting
    const cleanedText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    let parsed: any;
    try {
      parsed = JSON.parse(cleanedText);
    } catch {
      throw new Error('Malformed JSON payload from Gemini');
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Gemini response was not a valid object');
    }

    // Validate and clamp action
    let action: QueueAction = deterministic.recommendedAction;
    if (['WAIT_HERE', 'WAIT_ELSEWHERE', 'COME_BACK_LATER'].includes(parsed.action)) {
      action = parsed.action as QueueAction;
    }

    // Safety enforce: If queue is PAUSED or CLOSED or counters 0, override to COME_BACK_LATER
    if (snapshot.status === 'PAUSED' || snapshot.status === 'CLOSED' || snapshot.activeCounters === 0) {
      action = 'COME_BACK_LATER';
    }

    // Clamp wait bounds around deterministic range (+/- 30%)
    let minWait = typeof parsed.waitMinMinutes === 'number' ? Math.round(parsed.waitMinMinutes) : deterministic.minMinutes;
    let maxWait = typeof parsed.waitMaxMinutes === 'number' ? Math.round(parsed.waitMaxMinutes) : deterministic.maxMinutes;

    if (minWait < 0) minWait = deterministic.minMinutes;
    if (maxWait < minWait) maxWait = Math.max(minWait + 2, deterministic.maxMinutes);

    // Bounded clamp: keep AI within 35% margin of deterministic engine
    const minBound = Math.max(0, Math.floor(deterministic.minMinutes * 0.65));
    const maxBound = Math.ceil(deterministic.maxMinutes * 1.35);
    minWait = Math.max(minBound, Math.min(minWait, maxBound));
    maxWait = Math.max(minWait + 1, Math.min(maxWait, maxBound + 5));

    let confidence = deterministic.confidence;
    if (['LOW', 'MEDIUM', 'HIGH'].includes(parsed.confidence)) {
      confidence = parsed.confidence;
    }

    const returnInMinutes =
      action === 'WAIT_ELSEWHERE'
        ? typeof parsed.returnInMinutes === 'number' && parsed.returnInMinutes > 0
          ? Math.round(parsed.returnInMinutes)
          : deterministic.suggestedReturnMinutes
        : null;

    const explanation =
      typeof parsed.explanation === 'string' && parsed.explanation.trim().length > 10
        ? parsed.explanation.trim()
        : `Expected wait is ${minWait}–${maxWait} minutes with ${snapshot.activeCounters} window(s) operating.`;

    const nextStep =
      typeof parsed.nextStep === 'string' && parsed.nextStep.trim().length > 5
        ? parsed.nextStep.trim()
        : deterministic.recommendedAction === 'WAIT_HERE'
        ? 'Stay in the counter waiting area.'
        : 'Set a reminder and return when notified.';

    const accessibilityGuidance =
      typeof parsed.accessibilityGuidance === 'string' && parsed.accessibilityGuidance.trim().length > 5
        ? parsed.accessibilityGuidance.trim()
        : 'Accessible lobby seating and audio-visual turn displays are operational.';

    const assumptions = Array.isArray(parsed.assumptions) && parsed.assumptions.length > 0
      ? parsed.assumptions.map(String)
      : deterministic.assumptions;

    return {
      action,
      waitMinMinutes: minWait,
      waitMaxMinutes: maxWait,
      confidence,
      returnInMinutes,
      explanation,
      nextStep,
      accessibilityGuidance,
      assumptions,
      source: 'gemini',
      computedAt: new Date().toISOString(),
      queueSnapshotVersion: snapshot.version,
    };
  };

    // Run with strict timeout
    try {
      const timer = new Promise<AdvisorRecommendation>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API call timed out after 6000ms')), timeoutMs)
      );
      const result = await Promise.race([callPromise(), timer]);

      // Cache successful response
      if (recommendationCache.size >= MAX_CACHE_ENTRIES) {
        const oldest = recommendationCache.keys().next().value;
        if (oldest) recommendationCache.delete(oldest);
      }
      recommendationCache.set(cacheKey, {
        recommendation: result,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return result;
    } catch (err) {
      console.warn('[QueueLess Gemini API error]: falling back to deterministic engine', err);
      return buildFallbackRecommendation(
        snapshot,
        deterministic,
        userParams,
        err instanceof Error ? `Gemini notice: ${err.message}` : 'Gemini timeout or parsing error'
      );
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, requestExecution);
  return await requestExecution;
}
