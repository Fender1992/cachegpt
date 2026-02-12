import express from 'express';
import cors from 'cors';
import { config } from '../config';
import guildsRouter from './routes/guilds';
import channelsRouter from './routes/channels';

export function createApiServer(): express.Express {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────

  app.use(cors({
    origin: config.api.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));

  // Request logging
  app.use((req, _res, next) => {
    console.log(`[API] ${req.method} ${req.path}`);
    next();
  });

  // ── Health Check ───────────────────────────────────────────────────────

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  // ── Routes ─────────────────────────────────────────────────────────────

  app.use('/api/guilds', guildsRouter);
  app.use('/api/channels', channelsRouter);

  // ── 404 Handler ────────────────────────────────────────────────────────

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ── Error Handler ──────────────────────────────────────────────────────

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

export function startApiServer(): Promise<void> {
  return new Promise((resolve) => {
    const app = createApiServer();
    const port = config.api.port;

    app.listen(port, () => {
      console.log(`[API] Internal REST API listening on port ${port}`);
      console.log(`[API] Allowed origins: ${config.api.allowedOrigins.join(', ')}`);
      resolve();
    });
  });
}
