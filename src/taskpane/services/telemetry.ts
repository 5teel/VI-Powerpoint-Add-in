/**
 * Phase 5 telemetry ring buffer — localStorage-backed, 100-event cap.
 * Per 05-AI-SPEC.md §7 (localStorage v1 ship, Phoenix OTLP upgrade path).
 *
 * NEVER throws — telemetry must never block the composition call.
 */
const STORAGE_KEY = "summit.ai.trace.v1";
const MAX_EVENTS = 100;

export interface TelemetryEvent {
  t: number;
  name: string;
  payload?: Record<string, unknown>;
}

export function logEvent(name: string, payload?: Record<string, unknown>): void {
  try {
    const existing = readEvents();
    const updated = [...existing, { t: Date.now(), name, payload }].slice(-MAX_EVENTS);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage?.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[telemetry] logEvent suppressed error:", err);
  }
}

export function readEvents(): TelemetryEvent[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (globalThis as any).localStorage?.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearEvents(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Suppressed per contract.
  }
}
