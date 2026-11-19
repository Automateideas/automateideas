import { describe, expect, it } from "vitest";

import { addDays, describeSchedule, nextRun, occurrence, validateSchedule } from "./schedule";

describe("occurrence", () => {
  it("monthly from the 31st: last day of shorter months, back to the 31st after", () => {
    expect([0, 1, 2, 3, 4].map((n) => occurrence("2027-01-31", "monthly", 1, n))).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30", "2027-05-31"]);
    expect(occurrence("2028-01-31", "monthly", 1, 1)).toBe("2028-02-29"); // leap year
  });

  it("weekly, quarterly, yearly and every N", () => {
    expect(occurrence("2026-11-16", "weekly", 2, 3)).toBe("2026-12-28");
    expect(occurrence("2026-11-30", "quarterly", 1, 1)).toBe("2027-02-28");
    expect(occurrence("2026-11-05", "monthly", 3, 2)).toBe("2027-05-05");
    expect(occurrence("2028-02-29", "yearly", 1, 1)).toBe("2029-02-28");
    expect(occurrence("2026-12-15", "monthly", 1, 1)).toBe("2027-01-15"); // across the year end
  });

  it("stops at the end date or the maximum count", () => {
    const s = { startDate: "2026-11-20", frequency: "monthly" as const, interval: 1, endDate: "2027-01-31", maxCount: null };
    expect([0, 1, 2, 3].map((n) => nextRun(s, n))).toEqual(["2026-11-20", "2026-12-20", "2027-01-20", null]);
    expect(nextRun({ ...s, endDate: null, maxCount: 2 }, 2)).toBeNull();
  });
});

describe("describeSchedule", () => {
  it("reads naturally", () => {
    expect(describeSchedule("monthly", 1, "2026-11-05")).toBe("Every month on the 5th");
    expect(describeSchedule("monthly", 2, "2026-11-22")).toBe("Every 2 months on the 22nd");
    expect(describeSchedule("monthly", 1, "2026-10-31")).toBe("Every month on the 31st (or the last day of shorter months)");
    expect(describeSchedule("weekly", 1, "2026-11-16")).toBe("Every week on Monday");
    expect(describeSchedule("quarterly", 1, "2026-04-01")).toBe("Every 3 months on the 1st");
    expect(describeSchedule("yearly", 1, "2026-04-01")).toBe("Every year on 1 April");
    expect(describeSchedule("monthly", 1, "2026-11-11")).toBe("Every month on the 11th");
  });
});

describe("validateSchedule", () => {
  it("reads a schedule", () => {
    expect(validateSchedule({ name: " Retainer ", frequency: "monthly", interval: "1", startDate: "2026-12-01", dueDays: "15", autoIssue: true, autoEmail: true })).toEqual({
      ok: true,
      values: { name: "Retainer", frequency: "monthly", interval: 1, startDate: "2026-12-01", endDate: null, maxCount: null, dueDays: 15, autoIssue: true, autoEmail: true },
    });
  });

  it("flags bad input", () => {
    const r = validateSchedule({ name: "", frequency: "daily", interval: "0", startDate: "2026-12-01", endDate: "2026-11-01", autoIssue: false, autoEmail: true });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["autoEmail", "endDate", "frequency", "interval", "name"]);
  });

  it("adds days across months", () => {
    expect(addDays("2026-11-25", 15)).toBe("2026-12-10");
  });
});
