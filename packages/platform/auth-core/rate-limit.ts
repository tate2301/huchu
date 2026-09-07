type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

declare global {
  var __authRateLimitBuckets__: Map<string, RateLimitBucket> | undefined;
}

function getBucketStore() {
  if (!globalThis.__authRateLimitBuckets__) {
    globalThis.__authRateLimitBuckets__ = new Map<string, RateLimitBucket>();
  }
  return globalThis.__authRateLimitBuckets__;
}

function cleanupExpiredBuckets(now: number) {
  const store = getBucketStore();
  for (const [key, bucket] of store.entries()) {
    if (bucket.resetAt <= now) {
      store.delete(key);
    }
  }
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  cleanupExpiredBuckets(now);

  const store = getBucketStore();
  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  bucket.count += 1;
  store.set(key, bucket);
  return { allowed: true, retryAfterSeconds: 0 };
}
