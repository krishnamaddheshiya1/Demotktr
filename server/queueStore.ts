import { QueueSnapshot, StaffUpdateRequest } from '../src/types.js';
import {
  DEFAULT_QUEUE_ID,
  DEFAULT_STAFF_PASSCODE,
  MAX_PEOPLE_AHEAD,
  MAX_SERVICE_MINUTES,
  MIN_SERVICE_MINUTES,
  MAX_COUNTERS,
  MAX_ANNOUNCEMENT_LENGTH,
  MAX_QUEUE_ID_LENGTH,
} from '../src/constants.js';
import { Response } from 'express';
import crypto from 'crypto';

export { DEFAULT_QUEUE_ID };
export const STAFF_PASSCODE = process.env.STAFF_PASSCODE || DEFAULT_STAFF_PASSCODE;

/**
 * Constant-time passcode verification to prevent timing attacks
 */
export function verifyPasscode(inputPasscode: unknown): boolean {
  if (typeof inputPasscode !== 'string') return false;
  const cleanInput = inputPasscode.trim();
  if (!cleanInput) return false;

  const targetPasscode = process.env.STAFF_PASSCODE || DEFAULT_STAFF_PASSCODE;
  const inputHash = crypto.createHash('sha256').update(cleanInput).digest();
  const targetHash = crypto.createHash('sha256').update(targetPasscode).digest();

  return crypto.timingSafeEqual(inputHash, targetHash);
}

export function sanitizeText(str: unknown, maxLen = MAX_ANNOUNCEMENT_LENGTH): string {
  if (typeof str !== 'string') return '';
  // Strip HTML tags, script constructs, control characters, and clamp length
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, ' ')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .slice(0, maxLen)
    .trim();
}

export function sanitizeQueueId(id: unknown): string {
  if (typeof id !== 'string') return DEFAULT_QUEUE_ID;
  const clean = id.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, MAX_QUEUE_ID_LENGTH);
  return clean || DEFAULT_QUEUE_ID;
}

// Seed state for campus registration counter
const initialSnapshot: QueueSnapshot = {
  queueId: DEFAULT_QUEUE_ID,
  name: 'Student Health & Registrar Services',
  location: 'Campus Center - Hall B, Window 4',
  status: 'OPEN',
  peopleAhead: 7,
  averageServiceMinutes: 5,
  activeCounters: 2,
  unavailableCounters: 1,
  announcement: 'Window 2 is temporarily offline for maintenance. Windows 1 and 3 are actively serving.',
  updatedAt: new Date().toISOString(),
  version: 1,
};

let currentQueue: QueueSnapshot = { ...initialSnapshot };

// Active Server-Sent Events subscriber connections
const sseClients: Set<Response> = new Set();

export function getQueueSnapshot(queueId: string = DEFAULT_QUEUE_ID): QueueSnapshot {
  const safeId = sanitizeQueueId(queueId);
  if (safeId === DEFAULT_QUEUE_ID || safeId === 'DEFAULT') {
    return { ...currentQueue };
  }
  return { ...currentQueue, queueId: safeId };
}

export function registerSseClient(res: Response) {
  sseClients.add(res);
  res.on('close', () => {
    sseClients.delete(res);
  });
}

export function broadcastQueueUpdate() {
  const payload = `data: ${JSON.stringify(currentQueue)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

export function updateQueueSnapshot(update: StaffUpdateRequest): QueueSnapshot {
  const safeStatus = ['OPEN', 'PAUSED', 'CLOSED'].includes(update.status) ? update.status : currentQueue.status;
  const safePeople = Number.isFinite(update.peopleAhead)
    ? Math.min(MAX_PEOPLE_AHEAD, Math.max(0, Math.round(update.peopleAhead)))
    : currentQueue.peopleAhead;
  const safeAvg = Number.isFinite(update.averageServiceMinutes)
    ? Math.min(MAX_SERVICE_MINUTES, Math.max(MIN_SERVICE_MINUTES, Math.round(update.averageServiceMinutes)))
    : currentQueue.averageServiceMinutes;
  const safeActive = Number.isFinite(update.activeCounters)
    ? Math.min(MAX_COUNTERS, Math.max(0, Math.floor(update.activeCounters)))
    : currentQueue.activeCounters;
  const safeUnavailable = Number.isFinite(update.unavailableCounters)
    ? Math.min(MAX_COUNTERS, Math.max(0, Math.floor(update.unavailableCounters)))
    : currentQueue.unavailableCounters;
  const safeAnnouncement = sanitizeText(update.announcement, MAX_ANNOUNCEMENT_LENGTH);

  currentQueue = {
    ...currentQueue,
    status: safeStatus,
    peopleAhead: safePeople,
    averageServiceMinutes: safeAvg,
    activeCounters: safeActive,
    unavailableCounters: safeUnavailable,
    announcement: safeAnnouncement,
    updatedAt: new Date().toISOString(),
    version: currentQueue.version + 1,
  };

  broadcastQueueUpdate();
  return { ...currentQueue };
}

// Preset Demo Scenarios for Instant Evaluation
export function triggerDemoScenario(scenario: 'outage' | 'pause' | 'rush' | 'reset' | 'restore'): QueueSnapshot {
  switch (scenario) {
    case 'outage':
      // Takes 1 active counter offline, moving active 2 -> 1, announcement updated
      currentQueue = {
        ...currentQueue,
        activeCounters: Math.max(1, currentQueue.activeCounters - 1),
        unavailableCounters: currentQueue.unavailableCounters + 1,
        announcement: 'ATTENTION: Window 1 terminal has gone offline. Expect service delays.',
        updatedAt: new Date().toISOString(),
        version: currentQueue.version + 1,
      };
      break;

    case 'pause':
      // Pauses the entire queue
      currentQueue = {
        ...currentQueue,
        status: 'PAUSED',
        announcement: 'Queue is temporarily PAUSED for scheduled staff shift briefing and system sync.',
        updatedAt: new Date().toISOString(),
        version: currentQueue.version + 1,
      };
      break;

    case 'rush':
      // Adds sudden surge of people
      currentQueue = {
        ...currentQueue,
        peopleAhead: currentQueue.peopleAhead + 10,
        announcement: 'High volume surge: Registrar drop-in deadline approaching.',
        updatedAt: new Date().toISOString(),
        version: currentQueue.version + 1,
      };
      break;

    case 'restore':
    case 'reset':
      currentQueue = {
        ...initialSnapshot,
        updatedAt: new Date().toISOString(),
        version: currentQueue.version + 1,
      };
      break;
  }

  broadcastQueueUpdate();
  return { ...currentQueue };
}
