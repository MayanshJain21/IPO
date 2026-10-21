import express from 'express';
import cors from 'cors';

// Built separately from index.ts so tests can import the app without opening a port.
export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'ipo-tracker-api', time: new Date().toISOString() });
  });

  return app;
}
