import React, { useEffect, useState } from "react";
import { Text } from "@fluentui/react-components";

/**
 * Phase 6 D-11: Elapsed-time counter for active stages >5s.
 *
 * Isolated into its own child component per 06-RESEARCH §Pattern 9 so that
 * the 1Hz tick re-render does NOT propagate up to the parent SlidePreview
 * (which would cause the canvas + shimmer + region re-renders needlessly
 * during composition). Parent passes `stageStartMs` (Date.now() at stage
 * transition) and this component owns the setInterval lifecycle.
 *
 * Threat T-06-20 mitigation: useEffect cleanup clears the interval on unmount
 * AND on stageStartMs change, so no interval leak is possible across stage
 * transitions or component teardown.
 */

const STEADY_GREY = "#6B7280";
const SHOW_THRESHOLD_MS = 5000;

export interface ElapsedTimeCounterProps {
  /** Date.now() when the current stage became active. Pass Date.now() for deterministic testability. */
  stageStartMs: number;
}

export const ElapsedTimeCounter: React.FC<ElapsedTimeCounterProps> = ({
  stageStartMs,
}) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    setSeconds(0);
    const tick = () =>
      setSeconds(Math.max(0, Math.floor((Date.now() - stageStartMs) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [stageStartMs]);

  if (seconds * 1000 < SHOW_THRESHOLD_MS) return null;

  return (
    <Text
      size={100}
      aria-hidden="true"
      style={{ color: STEADY_GREY, fontSize: 11, marginLeft: 4 }}
    >
      {"…  "}
      {seconds}s
    </Text>
  );
};

export default ElapsedTimeCounter;
