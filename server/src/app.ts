import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import { checkDb } from './db';
import { iposRouter } from './routes/ipos';
import { pipelineRouter } from './routes/pipeline';

// Built separately from index.ts so tests can import the app without opening a port.
export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    const db = await checkDb();
    res.json({ ok: true, service: 'ipo-tracker-api', db, time: new Date().toISOString() });
  });

  app.use('/api/ipos', iposRouter);
  app.use('/api/pipeline', pipelineRouter);

  // Express 5 forwards errors thrown in async handlers here. Log the detail, return a generic message.
  const onError: ErrorRequestHandler = (err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(onError);

  return app;
}
