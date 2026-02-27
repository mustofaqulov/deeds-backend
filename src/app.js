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

const app = express();

// Trust Vercel/proxy headers (required for rate limiting + correct IPs)
app.set('trust proxy', 1);

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

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

// 404
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// Error handler
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Server xatosi' });
});

export default app;
