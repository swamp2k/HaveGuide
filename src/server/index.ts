import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnvironment } from './types';
import { authRoutes } from './routes/auth';
import { imageRoutes } from './routes/images';
import { sceneRoutes } from './routes/scenes';
import { visualizationRoutes } from './routes/visualizations';

const app = new Hono<AppEnvironment>();

app.use('*', secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", 'blob:', 'data:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    // 'wasm-unsafe-eval' is what lets the bundled OpenCV build compile its WebAssembly for
    // panorama stitching. It permits WASM compilation only, not eval() of JavaScript.
    scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
    connectSrc: ["'self'"],
  },
  referrerPolicy: 'same-origin',
}));

app.get('/api/health', (c) => c.json({ ok: true, app: 'have-guide', version: '0.2.0' }));
app.get('/api/capabilities', (c) => {
  const imageEditing = Boolean(c.env.OPENAI_API_KEY);
  return c.json({
    plantIdentification: Boolean(c.env.PLANTNET_API_KEY),
    aiAnalysis: Boolean(c.env.ANTHROPIC_API_KEY),
    imageEditing,
    imageEditingReason: imageEditing ? '' : 'Visualisering er ikke klar endnu.',
  });
});
app.route('/api/auth', authRoutes);
app.route('/api/scenes', sceneRoutes);
app.route('/api/images', imageRoutes);
app.route('/api/visualizations', visualizationRoutes);

app.notFound((c) => c.json({ error: { message: 'Ikke fundet.', code: 'NOT_FOUND' } }, 404));
app.onError((error, c) => {
  console.error(error);
  return c.json({ error: { message: 'Der skete en serverfejl.', code: 'INTERNAL_ERROR' } }, 500);
});

export default app;
