import { describe, expect, it } from "vitest";
import { formatServiceCaseSla, getServiceCaseSlaHealth } from "./service-case-sla";

const now = new Date("2026-08-24T00:00:00.000Z");

describe("service case SLA health", () => {
  it("marks cases without a due date as untracked", () => {
    expect(getServiceCaseSlaHealth("open", null, now)).toEqual({ state: "none", minutesRemaining: null });
  });

  it("distinguishes on-track, at-risk and overdue work", () => {
    expect(getServiceCaseSlaHealth("open", "2026-08-26T00:00:00.000Z", now).state).toBe("on_track");
    expect(getServiceCaseSlaHealth("in_progress", "2026-08-24T12:00:00.000Z", now)).toEqual({ state: "at_risk", minutesRemaining: 720 });
    expect(getServiceCaseSlaHealth("waiting", "2026-08-23T21:00:00.000Z", now)).toEqual({ state: "overdue", minutesRemaining: -180 });
  });

  it("stops the SLA clock after resolution or closure", () => {
    expect(getServiceCaseSlaHealth("resolved", "2026-08-23T21:00:00.000Z", now).state).toBe("stopped");
    expect(getServiceCaseSlaHealth("closed", "2026-08-26T00:00:00.000Z", now).state).toBe("stopped");
  });

  it("formats actionable time remaining", () => {
    expect(formatServiceCaseSla({ state: "at_risk", minutesRemaining: 90 })).toBe("기한 임박 · 2시간");
    expect(formatServiceCaseSla({ state: "overdue", minutesRemaining: -61 })).toBe("기한 초과 · 2시간");
  });

  it("rejects invalid due dates", () => {
    expect(() => getServiceCaseSlaHealth("open", "not-a-date", now)).toThrow("Invalid due date");
  });
});
