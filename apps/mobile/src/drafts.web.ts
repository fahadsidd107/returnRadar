// Browser previews intentionally do not use the native SQLite draft store.
export async function database() {
  return {
    getFirstAsync: async <T>(..._args: unknown[]): Promise<T | null> => null,
    runAsync: async (..._args: unknown[]) => ({
      changes: 0,
      lastInsertRowId: 0,
    }),
  };
}
