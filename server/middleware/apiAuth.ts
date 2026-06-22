// Optional shared-secret auth for the engine's mutating endpoints.
// Gated on the API_TOKEN env var: when unset the API stays open (local dev);
// when set, protected routes require `Authorization: Bearer <token>` or
// `X-API-Key: <token>`. Compared in constant time to avoid timing leaks.

import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export interface ApiAuth {
  /** True when API_TOKEN is configured (auth enforced). */
  readonly enabled: boolean;
  /** Express middleware — 401s unless a valid token is presented. */
  requireToken(req: Request, res: Response, next: NextFunction): void;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function extractToken(req: Request): string {
  const header = req.get('authorization');
  if (header && header.startsWith('Bearer ')) return header.slice(7).trim();
  return (req.get('x-api-key') ?? '').trim();
}

export function createApiAuth(env: NodeJS.ProcessEnv = process.env): ApiAuth {
  const token = env.API_TOKEN?.trim();

  if (!token) {
    return {
      enabled: false,
      requireToken: (_req, _res, next) => next(),
    };
  }

  return {
    enabled: true,
    requireToken: (req, res, next) => {
      const provided = extractToken(req);
      if (provided && timingSafeEqual(provided, token)) return next();
      res.status(401).json({ error: 'Unauthorized: missing or invalid API token' });
    },
  };
}
