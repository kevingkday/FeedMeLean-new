import { Hono } from 'hono';
import type { AppContext } from './types';
import { authRoutes } from './routes/auth';
import { mealRoutes } from './routes/meals';
import { savedMealRoutes } from './routes/savedMeals';
import { profileRoutes } from './routes/profile';
import { adminRoutes } from './routes/admin';

const app = new Hono<AppContext>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
});

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    service: 'FeedMeLean API',
    timestamp: new Date().toISOString(),
  })
);

app.route('/api/auth', authRoutes);
app.route('/api/meals', mealRoutes);
app.route('/api/saved-meals', savedMealRoutes);
app.route('/api/profile', profileRoutes);
app.route('/api/admin', adminRoutes);

app.all('/api/*', (c) => c.json({ error: 'API endpoint not found' }, 404));

app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('FeedMeLean API Worker Running', 200);
});

export default app;

