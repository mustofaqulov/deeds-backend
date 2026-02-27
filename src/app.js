import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';

import authRouter         from './routes/auth.js';
import profileRouter      from './routes/profile.js';
import challengesRouter   from './routes/challenges.js';
import calendarRouter     from './routes/calendar.js';
import prayerRouter       from './routes/prayer.js';
import dataRouter         from './routes/data.js';
import achievementsRouter from './routes/achievements.js';
import nafsRouter         from './routes/nafs.js';
import statsRouter        from './routes/stats.js';
import userdataRouter     from './routes/userdata.js';

const app = express();

// Trust Vercel/proxy headers (required for rate limiting + correct IPs)
app.set('trust proxy', 1);

const parseOrigins = (...values) => values
  .filter(Boolean)
  .flatMap((value) => String(value).split(','))
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = parseOrigins(
  process.env.FRONTEND_URL,
  process.env.FRONTEND_URLS,
);

const allowVercelPreview = process.env.ALLOW_VERCEL_PREVIEW !== 'false';

const matchesWildcard = (origin, pattern) => {
  if (!pattern.includes('*')) return origin === pattern;
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}$`, 'i');
  return regex.test(origin);
};

const isAllowedOrigin = (origin) => {
  if (!origin) return true; // curl/postman/server-to-server
  if (allowedOrigins.length === 0) return true; // fallback: allow all if no env set
  if (allowedOrigins.some((pattern) => matchesWildcard(origin, pattern))) return true;
  if (allowVercelPreview && /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(origin)) return true;
  return false;
};

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

// Security
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Rate limiting
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use(limiter);

// Body parsing
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

// Routes
app.use('/api/auth',         authLimiter, authRouter);
app.use('/api/profile',      profileRouter);
app.use('/api/challenges',   challengesRouter);
app.use('/api/calendar',     calendarRouter);
app.use('/api/prayer',       prayerRouter);
app.use('/api/data',         dataRouter);
app.use('/api/achievements', achievementsRouter);
app.use('/api/nafs',         nafsRouter);
app.use('/api/stats',        statsRouter);
app.use('/api/userdata',     userdataRouter);

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

export default app;
