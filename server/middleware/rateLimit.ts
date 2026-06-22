// Rate limiting for the /api/v2 surface. A general limiter applies to every
// request; a stricter one guards the expensive ingest/discover endpoints.
// Tunable via env; disabled automatically under NODE_ENV=test.

import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';

function intEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

const passthrough: RateLimitRequestHandler = ((_req, _res, next) => next()) as RateLimitRequestHandler;

export function createGeneralLimiter(): RateLimitRequestHandler {
  if (process.env.NODE_ENV === 'test') return passthrough;
  return rateLimit({
    windowMs: intEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000), // 15 min
    max: intEnv('RATE_LIMIT_MAX', 300),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests — slow down.' },
  });
}

export function createIngestLimiter(): RateLimitRequestHandler {
  if (process.env.NODE_ENV === 'test') return passthrough;
  return rateLimit({
    windowMs: intEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: intEnv('RATE_LIMIT_INGEST_MAX', 30),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many ingest/discovery requests — slow down.' },
  });
}
