/**
 * Executor de fila com concorrência limitada (sem dependências externas)
 */
export async function runConcurrent<T, R>(
  items: T[],
  concurrencyLimit: number,
  taskFn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];
      if (item !== undefined) {
        results[currentIndex] = await taskFn(item, currentIndex);
      }
    }
  }

  const workerCount = Math.max(1, Math.min(concurrencyLimit, items.length));
  const workers = Array.from({ length: workerCount }, () => worker());

  await Promise.all(workers);
  return results;
}
