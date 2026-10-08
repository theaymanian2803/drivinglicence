import './env';
import { Hono } from 'hono';
import { authRoutes } from './routes/auth';
import { studentAuthRoutes } from './routes/studentAuth';
import { seriesRoutes } from './routes/series';
import { questionRoutes } from './routes/questions';
import { studentsRoutes } from './routes/students';
import { attemptsRoutes } from './routes/attempts';
import { revisionRoutes } from './routes/revision';
import { uploadRoutes } from './routes/upload';
import { signRoutes } from './routes/signs';
import { settingsRoutes } from './routes/settings';
import { examRoutes } from './routes/exams';
import { readinessRoutes } from './routes/readiness';
import type { AppEnv } from './auth';

export function buildApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/api/health', (c) => c.json({ data: { ok: true } }));
  app.route('/api/auth', authRoutes);
  app.route('/api/student-auth', studentAuthRoutes);
  app.route('/api/series', seriesRoutes);
  app.route('/api/questions', questionRoutes);
  app.route('/api/students', studentsRoutes);
  app.route('/api/attempts', attemptsRoutes);
  app.route('/api/revision', revisionRoutes);
  app.route('/api/upload', uploadRoutes);
  app.route('/api/signs', signRoutes);
  app.route('/api/settings', settingsRoutes);
  app.route('/api/exams', examRoutes);
  app.route('/api/readiness', readinessRoutes);

  return app;
}