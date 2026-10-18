/** A small guard for async work whose result becomes stale when identity changes. */
export function createRequestGate() {
  let generation = 0;
  return {
    begin() {
      const current = ++generation;
      return () => current === generation;
    },
    invalidate() { generation++; }
  };
}
