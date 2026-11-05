import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  if (typeof window !== "undefined") window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// jsdom does not implement file byte reads, object URLs or scrolling.
if (typeof FileReader !== "undefined") Object.defineProperty(Blob.prototype, "arrayBuffer", { configurable: true, value() {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(this);
  });
} });
Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:test-${Math.random()}`) });
Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
if (typeof Element !== "undefined") Element.prototype.scrollIntoView = vi.fn();
