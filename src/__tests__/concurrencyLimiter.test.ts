import { createLimiter, getDefaultConcurrency, mapWithConcurrency } from '@/concurrency/limiter';
import * as os from 'os';

describe('concurrency limiter', () => {
  describe('getDefaultConcurrency', () => {
    it('returns min of CPU count and 10', () => {
      const cpuCount = os.cpus().length;
      const expected = Math.min(cpuCount, 10);
      expect(getDefaultConcurrency()).toBe(expected);
    });
  });

  describe('createLimiter', () => {
    it('limits concurrent executions to the specified concurrency', async () => {
      let maxConcurrent = 0;
      let current = 0;
      const concurrency = 2;
      const limit = createLimiter(concurrency);

      const task = () =>
        limit(async () => {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          await new Promise((resolve) => setTimeout(resolve, 50));
          current--;
          return 'done';
        });

      const results = await Promise.all([task(), task(), task(), task(), task()]);

      expect(maxConcurrent).toBeLessThanOrEqual(concurrency);
      expect(maxConcurrent).toBe(concurrency);
      expect(results).toEqual(['done', 'done', 'done', 'done', 'done']);
    });

    it('processes all items even with concurrency of 1', async () => {
      const limit = createLimiter(1);
      const order: number[] = [];

      await Promise.all(
        [1, 2, 3].map((n) =>
          limit(async () => {
            order.push(n);
            return n;
          }),
        ),
      );

      expect(order).toEqual([1, 2, 3]);
    });

    it('propagates errors from tasks', async () => {
      const limit = createLimiter(2);

      const promise = limit(async () => {
        throw new Error('task failed');
      });

      await expect(promise).rejects.toThrow('task failed');
    });

    it('continues processing after a task fails', async () => {
      const limit = createLimiter(1);
      const results: string[] = [];

      const p1 = limit(async () => {
        throw new Error('fail');
      }).catch(() => 'caught');

      const p2 = limit(async () => {
        results.push('second');
        return 'ok';
      });

      await Promise.all([p1, p2]);
      expect(results).toEqual(['second']);
    });

    it('handles high concurrency greater than task count', async () => {
      const limit = createLimiter(100);
      const results = await Promise.all([1, 2, 3].map((n) => limit(async () => n * 2)));
      expect(results).toEqual([2, 4, 6]);
    });
  });

  describe('mapWithConcurrency', () => {
    it('processes all items and returns results in order', async () => {
      const items = [10, 20, 30, 40];
      const results = await mapWithConcurrency(items, 2, async (n) => n * 2);
      expect(results).toEqual([20, 40, 60, 80]);
    });

    it('respects concurrency limit', async () => {
      let maxConcurrent = 0;
      let current = 0;

      await mapWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (n) => {
        current++;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise((resolve) => setTimeout(resolve, 30));
        current--;
        return n;
      });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(maxConcurrent).toBe(3);
    });

    it('handles empty array', async () => {
      const results = await mapWithConcurrency([], 4, async (n: number) => n);
      expect(results).toEqual([]);
    });
  });
});
