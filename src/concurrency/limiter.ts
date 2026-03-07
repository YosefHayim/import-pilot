import * as os from 'os';

/**
 * Returns a default concurrency value: min(CPU count, 10).
 */
export function getDefaultConcurrency(): number {
  return Math.min(os.cpus().length, 10);
}

/**
 * Simple promise-based concurrency limiter (pLimit pattern without external deps).
 *
 * Usage:
 *   const limit = createLimiter(4);
 *   const results = await Promise.all(items.map(item => limit(() => process(item))));
 */
export function createLimiter(concurrency: number): <T>(fn: () => Promise<T>) => Promise<T> {
  let active = 0;
  const queue: Array<() => void> = [];

  function next(): void {
    if (queue.length > 0 && active < concurrency) {
      const resolve = queue.shift()!;
      resolve();
    }
  }

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async (): Promise<void> => {
        active++;
        try {
          const result = await fn();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          active--;
          next();
        }
      };

      if (active < concurrency) {
        run();
      } else {
        queue.push(() => {
          run();
        });
      }
    });
  };
}

/**
 * Process items in parallel with a concurrency limit, collecting results.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const limit = createLimiter(concurrency);
  return Promise.all(items.map((item) => limit(() => fn(item))));
}
