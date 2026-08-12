import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { AppEnvironment } from './types';
import { authRoutes } from './routes/auth';
import { captureRoutes } from './routes/capture';
import { designRoutes } from './routes/designs';
import { gardenRoutes } from './routes/gardens';
import { journeyRoutes } from './routes/journey';
import { understandingRoutes } from './routes/understanding';
import { smartScanRoutes } from './routes/smart-scan';
import { mapRoutes } from './routes/map';
import { mediaRoutes } from './routes/media';
import { sameOriginWrites, securityHeaders } from './middleware/security';
import { jsonError } from './utils/response';

const app = new Hono<AppEnvironment>();
app.use('*', logger());
app.use('*', securityHeaders);
app.use('/api/*', sameOriginWrites);

app.get('/api/health', (c) => c.json({ ok: true, service: 'have-guide', environment: c.env.APP_ENV }));
app.route('/api/auth', authRoutes);
app.route('/api/gardens', gardenRoutes);
app.route('/api/gardens', understandingRoutes);
app.route('/api/gardens', smartScanRoutes);
app.route('/api/gardens', designRoutes);
app.route('/api/gardens', journeyRoutes);
app.route('/api/gardens', captureRoutes);
app.route('/api/map', mapRoutes);
app.route('/api/media', mediaRoutes);

app.notFound((c) => {
  if (new URL(c.req.url).pathname.startsWith('/api/')) {
    return jsonError(c, 404, 'API-ruten findes ikke.', 'NOT_FOUND');
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

app.onError((error, c) => {
  console.error(JSON.stringify({ level: 'error', message: error.message, stack: error.stack }));
  return jsonError(c, 500, 'Der opstod en uventet fejl.', 'INTERNAL_ERROR');
});

export default app;
