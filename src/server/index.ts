import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnvironment } from './types';
import { authRoutes } from './routes/auth';
import { imageRoutes } from './routes/images';
import { sceneRoutes } from './routes/scenes';

const app = new Hono<AppEnvironment>();

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", 'blob:', 'data:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    connectSrc: ["'self'"],
  },
  referrerPolicy: 'same-origin',
}));

app.get('/api/health', (c) => c.json({ ok: true, app: 'have-guide', version: '0.2.0' }));
app.get('/api/capabilities', (c) => c.json({
  plantIdentification: Boolean(c.env.PLANTNET_API_KEY),
  aiAnalysis: Boolean(c.env.ANTHROPIC_API_KEY),
  imageEditing: false,
  imageEditingReason: 'Anthropic kan analysere billeder, men returnerer ikke redigerede billeder. Tilføj en billedmodel senere.',
}));
app.route('/api/auth', authRoutes);
app.route('/api/scenes', sceneRoutes);
app.route('/api/images', imageRoutes);

app.notFound((c) => c.json({ error: { message: 'Ikke fundet.', code: 'NOT_FOUND' } }, 404));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: { message: 'Der skete en serverfejl.', code: 'INTERNAL_ERROR' } }, 500);
});

export default app;
