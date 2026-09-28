import "@testing-library/jest-dom/vitest";

// Node 25+ defines a global `localStorage` that is undefined unless Node is
// started with --localstorage-file. It shadows jsdom's Storage, so install an
// in-memory Storage for components that persist theme or language choices.
if (typeof globalThis.localStorage?.setItem !== "function") {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, String(value)),
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}
