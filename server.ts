import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  DEFAULT_QUEUE_ID,
  STAFF_PASSCODE,
  verifyPasscode,
  getQueueSnapshot,
  registerSseClient,
  updateQueueSnapshot,
  triggerDemoScenario,
  sanitizeQueueId,
  sanitizeText,
} from './server/queueStore.js';
import { calculateWaitRange, validateQueueSnapshot } from './server/estimator.js';
import {
  generateAdvisorRecommendation,
  getSimulateAiFailure,
  setSimulateAiFailure,
  clearRecommendationCache,
} from './server/gemini.js';
import { RecommendationRequest, StaffUpdateRequest, AccessibilityNeedId } from './src/types.js';
import {
  MAX_PEOPLE_AHEAD,
  MAX_RETURN_MINUTES,
  VALID_ACCESSIBILITY_NEEDS,
  MAX_ANNOUNCEMENT_LENGTH,
} from './src/constants.js';

// In-memory rate limiting and brute force protection with bounded size and TTL eviction
const MAX_TRACKED_IPS = 5000;
const ipRequestCounts = new Map<string, { count: number; resetAt: number }>();
const failedAuthAttempts = new Map<string, { count: number; lockUntil: number }>();

// Periodic TTL sweep every 60 seconds to prevent heap memory exhaustion
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipRequestCounts.entries()) {
    if (now > entry.resetAt) {
      ipRequestCounts.delete(ip);
    }
  }
  for (const [ip, entry] of failedAuthAttempts.entries()) {
    if (entry.lockUntil > 0 && now > entry.lockUntil + 300000) {
      failedAuthAttempts.delete(ip);
    }
  }
}, 60000).unref();

function rateLimit(maxRequests = 60, windowMs = 60000) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = ipRequestCounts.get(ip);

    if (!entry || now > entry.resetAt) {
      if (ipRequestCounts.size >= MAX_TRACKED_IPS) {
        const oldestKey = ipRequestCounts.keys().next().value;
        if (oldestKey) ipRequestCounts.delete(oldestKey);
      }
      ipRequestCounts.set(ip, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (entry.count >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
    }

    entry.count += 1;
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Disable technology fingerprinting header
  app.disable('x-powered-by');

  // Middleware with size limits
  app.use(express.json({ limit: '50kb' }));

  // Catch malformed JSON syntax errors
  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && typeof err === 'object' && err !== null && 'status' in err && (err as { status: unknown }).status === 400) {
      return res.status(400).json({ error: 'Malformed JSON payload' });
    }
    next(err);
  });

  // Production Security Headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'self' https://*.run.app https://ai.studio https://*.google.com;"
    );
    next();
  });

  // 1. Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'QueueLess API',
      aiAvailable: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'),
      simulateAiFailure: getSimulateAiFailure(),
      timestamp: new Date().toISOString(),
    });
  });

  // 2. Queue Snapshot
  app.get('/api/queues/:queueId', (req, res) => {
    const rawQueueId = req.params.queueId;
    const queueId = sanitizeQueueId(rawQueueId || DEFAULT_QUEUE_ID);
    if (queueId !== DEFAULT_QUEUE_ID && queueId !== 'DEFAULT') {
      return res.status(404).json({ error: `Queue '${rawQueueId}' not found. Valid queue: ${DEFAULT_QUEUE_ID}` });
    }
    const snapshot = getQueueSnapshot(queueId);
    res.json(snapshot);
  });

  // 3. Real-time SSE Stream
  app.get('/api/queues/:queueId/stream', (req, res) => {
    const queueId = sanitizeQueueId(req.params.queueId || DEFAULT_QUEUE_ID);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial snapshot immediately
    const snapshot = getQueueSnapshot(queueId);
    res.write(`data: ${JSON.stringify(snapshot)}\n\n`);

    // Keepalive ping every 25 seconds
    const interval = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 25000);

    res.on('close', () => {
      clearInterval(interval);
    });

    registerSseClient(res);
  });

  // 4. Staff Update Endpoint with brute-force protection
  app.put('/api/queues/:queueId', rateLimit(30, 60000), (req, res) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    // Check brute-force lockout
    const lock = failedAuthAttempts.get(ip);
    if (lock && now < lock.lockUntil) {
      const waitSecs = Math.ceil((lock.lockUntil - now) / 1000);
      return res.status(429).json({
        error: `Desk control locked due to repeated incorrect passcode attempts. Try again in ${waitSecs}s.`,
      });
    }

    const queueId = sanitizeQueueId(req.params.queueId || DEFAULT_QUEUE_ID);
    const body = (req.body || {}) as StaffUpdateRequest;

    // Timing-safe authorization check
    const passcode = String(req.headers['x-staff-passcode'] || body.passcode || '').trim();
    if (!verifyPasscode(passcode)) {
      const attempts = (lock?.count || 0) + 1;
      if (attempts >= 5) {
        failedAuthAttempts.set(ip, { count: attempts, lockUntil: now + 60000 });
      } else {
        failedAuthAttempts.set(ip, { count: attempts, lockUntil: 0 });
      }

      const isDemoEnvironment = !process.env.STAFF_PASSCODE;
      return res.status(401).json({
        error: isDemoEnvironment
          ? 'Unauthorized: Invalid staff passcode. (Demo default: STAFF2026)'
          : 'Unauthorized: Invalid staff passcode.',
      });
    }

    // Reset failed attempts on success
    failedAuthAttempts.delete(ip);

    // Strict numerical coercion and validation
    const parsedPeople = Number(body.peopleAhead);
    const parsedAvg = Number(body.averageServiceMinutes);
    const parsedActive = Number(body.activeCounters);
    const parsedUnavailable = Number(body.unavailableCounters);

    // Validation
    const validation = validateQueueSnapshot({
      queueId,
      status: body.status,
      peopleAhead: parsedPeople,
      averageServiceMinutes: parsedAvg,
      activeCounters: parsedActive,
      unavailableCounters: parsedUnavailable,
      announcement: sanitizeText(body.announcement, MAX_ANNOUNCEMENT_LENGTH),
    });

    if (!validation.valid) {
      return res.status(400).json({ error: 'Validation failed', details: validation.errors });
    }

    const updated = updateQueueSnapshot({
      ...body,
      peopleAhead: parsedPeople,
      averageServiceMinutes: parsedAvg,
      activeCounters: parsedActive,
      unavailableCounters: parsedUnavailable,
      announcement: sanitizeText(body.announcement, MAX_ANNOUNCEMENT_LENGTH),
    });
    clearRecommendationCache();
    return res.json(updated);
  });

  // Verify staff passcode for account elevation
  app.post('/api/auth/verify-staff-passcode', rateLimit(10, 60000), (req, res) => {
    const ip = req.ip || '127.0.0.1';
    const now = Date.now();
    const lock = failedAuthAttempts.get(ip);
    if (lock && lock.lockUntil > now) {
      const waitSecs = Math.ceil((lock.lockUntil - now) / 1000);
      return res.status(429).json({
        valid: false,
        error: `Too many attempts. Please wait ${waitSecs}s.`,
      });
    }

    const { passcode } = req.body || {};
    if (!verifyPasscode(passcode)) {
      const attempts = (lock?.count || 0) + 1;
      if (attempts >= 5) {
        failedAuthAttempts.set(ip, { count: attempts, lockUntil: now + 60000 });
      } else {
        failedAuthAttempts.set(ip, { count: attempts, lockUntil: 0 });
      }
      return res.status(401).json({
        valid: false,
        error: 'Invalid staff authorization code.',
      });
    }

    failedAuthAttempts.delete(ip);
    return res.json({ valid: true });
  });

  // 5. Action Recommendation Endpoint with rate limiting & rigorous sanitization
  app.post('/api/recommendation', rateLimit(60, 60000), async (req, res) => {
    try {
      const body = (req.body || {}) as RecommendationRequest;
      const queueId = sanitizeQueueId(body.queueId || DEFAULT_QUEUE_ID);
      const snapshot = getQueueSnapshot(queueId);

      // Validate peopleAhead if provided
      let userPeopleAhead: number | undefined = undefined;
      if (body.peopleAhead !== undefined && body.peopleAhead !== null) {
        const p = Number(body.peopleAhead);
        if (!Number.isFinite(p) || p < 0 || p > MAX_PEOPLE_AHEAD) {
          return res.status(400).json({
            error: `peopleAhead must be a finite number between 0 and ${MAX_PEOPLE_AHEAD.toLocaleString()}.`,
          });
        }
        userPeopleAhead = Math.round(p);
      }

      // Validate minutesNeededToReturn if provided
      let returnMinutes = 5;
      if (body.minutesNeededToReturn !== undefined && body.minutesNeededToReturn !== null) {
        const m = Number(body.minutesNeededToReturn);
        if (!Number.isFinite(m) || m < 1 || m > MAX_RETURN_MINUTES) {
          return res.status(400).json({
            error: `minutesNeededToReturn must be a finite number between 1 and ${MAX_RETURN_MINUTES} minutes.`,
          });
        }
        returnMinutes = Math.round(m);
      }

      const validNeeds: readonly AccessibilityNeedId[] = VALID_ACCESSIBILITY_NEEDS;
      const accessibilityNeeds = Array.isArray(body.accessibilityNeeds)
        ? body.accessibilityNeeds.filter((n): n is AccessibilityNeedId => (validNeeds as readonly string[]).includes(n))
        : [];

      const userParams = {
        userPeopleAhead,
        minutesNeededToReturn: returnMinutes,
        accessibilityNeeds,
      };

      // 1. Calculate deterministic estimate immediately
      const deterministic = calculateWaitRange(snapshot, userParams);

      // 2. Enhance with Gemini (or fallback if AI unavailable)
      const recommendation = await generateAdvisorRecommendation(snapshot, deterministic, userParams);

      return res.json({
        recommendation,
        deterministic,
        snapshot,
      });
    } catch (err) {
      console.error('Error generating recommendation:', err);
      return res.status(500).json({ error: 'Failed to generate queue recommendation' });
    }
  });

  // 6. Demo Scenario Control Endpoints
  app.post('/api/demo/scenario/:action', (req, res) => {
    const action = req.params.action as 'outage' | 'pause' | 'rush' | 'reset' | 'restore';
    if (!['outage', 'pause', 'rush', 'reset', 'restore'].includes(action)) {
      return res.status(400).json({ error: 'Invalid scenario action' });
    }
    if (action === 'reset' || action === 'restore') {
      failedAuthAttempts.clear();
    }
    const updated = triggerDemoScenario(action);
    clearRecommendationCache();
    return res.json({ success: true, scenario: action, snapshot: updated });
  });

  app.post('/api/demo/toggle-ai-failure', (req, res) => {
    const current = getSimulateAiFailure();
    const next = !current;
    setSimulateAiFailure(next);
    clearRecommendationCache();
    return res.json({ simulateAiFailure: next });
  });

  app.get('/api/demo/status', (req, res) => {
    return res.json({
      simulateAiFailure: getSimulateAiFailure(),
      isDemoMode: !process.env.STAFF_PASSCODE,
    });
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(
      express.static(distPath, {
        maxAge: '1y',
        immutable: true,
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
          }
        },
      })
    );
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`QueueLess server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Server startup failure:', err);
  process.exit(1);
});
