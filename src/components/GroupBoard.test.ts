import { GroupRow, overdueRoll, todayLine } from "./GroupBoard";
import { todayIndex } from "../utils/today";

/**
 * Two things decide what the group reads on a row, and both are easy to get
 * backwards: the season runs Monday first while JavaScript's week starts on
 * Sunday, and "has not trained" has to stay distinct from "never got in".
 */

const row = (over: Partial<GroupRow>): GroupRow =>
  ({
    userId: "u",
    name: "Ancil",
    avatar: null,
    days: [null, null, null, null, null, null, null],
    weeks: [],
    currentWeekProgress: { week: 1, credits: 0, needed: 4 },
    unsettledFines: [],
    lastSeenAt: "2026-09-14T10:00:00.000Z",
    ...over,
  }) as GroupRow;

describe("todayIndex", () => {
  it("puts Monday first and Sunday last", () => {
    // 2026-09-14 is a Monday; noon keeps every timezone on the same date.
    expect(todayIndex(new Date("2026-09-14T12:00:00"))).toBe(0);
    expect(todayIndex(new Date("2026-09-17T12:00:00"))).toBe(3);
    expect(todayIndex(new Date("2026-09-20T12:00:00"))).toBe(6);
  });
});

describe("a row that arrives without the new fields", () => {
  it("does not take the screen down", () => {
    // What a fresh bundle sees for the minute an old API is still serving.
    const stale = {
      ...row({}),
      days: undefined,
      avatar: undefined,
      currentWeekProgress: undefined,
      unsettledFines: undefined,
    } as unknown as GroupRow;
    const normalised = {
      ...stale,
      days: Array.isArray(stale.days) ? stale.days : Array(7).fill(null),
      avatar: stale.avatar ?? null,
    };
    expect(() => todayLine(normalised)).not.toThrow();
    expect(normalised.days).toHaveLength(7);
  });
});

describe("todayLine", () => {
  const monday = new Date("2026-09-14T12:00:00");
  const realDate = Date;

  beforeAll(() => {
    // todayLine reads the clock itself, so the clock is what the test pins.
    global.Date = class extends realDate {
      constructor(...args: ConstructorParameters<typeof Date>) {
        super(...(args.length ? args : [monday]));
      }
    } as DateConstructor;
  });
  afterAll(() => {
    global.Date = realDate;
  });

  it("tells someone who never opened the app apart from someone who has not trained", () => {
    expect(todayLine(row({ lastSeenAt: null })).text).toBe("never opened the app");
    expect(todayLine(row({})).text).toBe("not yet today");
  });

  it("does not accuse a player whose season predates the last-seen column", () => {
    const veteran = row({
      lastSeenAt: null,
      weeks: [{ week: 1, outcome: "clean", credits: 5, fine: 0 }],
    });
    expect(todayLine(veteran).text).toBe("not yet today");
  });

  it("says the week is done, which outranks whether today is ticked", () => {
    const finished = row({ currentWeekProgress: { week: 1, credits: 4, needed: 4 } });
    expect(todayLine(finished).text).toBe("week done");
  });

  it("reads today's cell, not the rest of the week", () => {
    expect(todayLine(row({ days: ["session", null, null, null, null, null, null] })).text).toBe(
      "trained today"
    );
    expect(todayLine(row({ days: ["steps", null, null, null, null, null, null] })).text).toBe(
      "10k steps today"
    );
    // Trained on Tuesday, nothing on Monday: still not today.
    expect(todayLine(row({ days: [null, "session", null, null, null, null, null] })).text).toBe(
      "not yet today"
    );
  });
});

describe("the overdue roll call", () => {
  const DAY = 86400000;
  const late = (amount: number, daysAgo: number) => ({
    week: 1,
    amount,
    dueAt: new Date(Date.now() - daysAgo * DAY).toISOString(),
    overdue: true,
  });

  it("names what they owe in total, not just the part that is late", () => {
    // ₹200 past the deadline and ₹400 billed since. They owe ₹600.
    const [first] = overdueRoll([
      row({
        outstanding: 600,
        unsettledFines: [
          late(200, 3),
          { week: 2, amount: 400, dueAt: new Date(Date.now() + DAY).toISOString(), overdue: false },
        ],
      }),
    ]);
    expect(first.owed).toBe(600);
    expect(first.days).toBe(3);
  });

  it("leaves out anybody whose fines are all still within the deadline", () => {
    expect(
      overdueRoll([
        row({
          outstanding: 400,
          unsettledFines: [
            { week: 2, amount: 400, dueAt: new Date(Date.now() + DAY).toISOString(), overdue: false },
          ],
        }),
      ])
    ).toHaveLength(0);
  });

  it("puts the biggest debt first", () => {
    expect(
      overdueRoll([
        row({ userId: "small", outstanding: 200, unsettledFines: [late(200, 30)] }),
        row({ userId: "big", outstanding: 2600, unsettledFines: [late(200, 1)] }),
      ]).map((o) => o.userId)
    ).toEqual(["big", "small"]);
  });
});
