export async function checkRateLimit(
  db: D1Database,
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const windowStartCutoff = nowSec - windowSeconds;

  try {
    const existing = await db
      .prepare('SELECT window_start, count FROM rate_limits WHERE key = ?1')
      .bind(key)
      .first<{ window_start: number; count: number }>();

    if (!existing || existing.window_start < windowStartCutoff) {
      await db
        .prepare(
          'INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1) ON CONFLICT(key) DO UPDATE SET window_start = ?2, count = 1'
        )
        .bind(key, nowSec)
        .run();
      return { allowed: true, remaining: maxRequests - 1, retryAfterSeconds: 0 };
    }

    if (existing.count >= maxRequests) {
      const retryAfter = Math.max(1, existing.window_start + windowSeconds - nowSec);
      return { allowed: false, remaining: 0, retryAfterSeconds: retryAfter };
    }

    const nextCount = existing.count + 1;
    await db
      .prepare('UPDATE rate_limits SET count = ?1 WHERE key = ?2')
      .bind(nextCount, key)
      .run();

    return {
      allowed: true,
      remaining: Math.max(0, maxRequests - nextCount),
      retryAfterSeconds: 0,
    };
  } catch {
    // Fail open if rate_limits table is busy so legitimate requests aren't dropped
    return { allowed: true, remaining: 1, retryAfterSeconds: 0 };
  }
}

