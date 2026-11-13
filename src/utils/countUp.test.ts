import { eased } from "./countUp";

/**
 * The roll itself is plumbing — a frame loop the browser drives. This is the
 * part that decides what the figure reads at any moment, and it is the part
 * that can be wrong: a roll that overshoots shows the group a pot that never
 * existed, and one that never lands leaves a number a rupee short forever.
 */
describe("eased", () => {
  it("starts where it started and ends where it ends", () => {
    expect(eased(0, 6000, 0)).toBe(0);
    expect(eased(0, 6000, 1)).toBe(6000);
    expect(eased(2800, 6000, 1)).toBe(6000);
  });

  it("only ever climbs, and never past the target", () => {
    let previous = -1;
    for (let i = 0; i <= 20; i += 1) {
      const value = eased(0, 6000, i / 20);
      expect(value).toBeGreaterThanOrEqual(previous);
      expect(value).toBeLessThanOrEqual(6000);
      previous = value;
    }
  });

  it("runs backwards too, for a pot that is paid out", () => {
    expect(eased(6000, 0, 0)).toBe(6000);
    expect(eased(6000, 0, 1)).toBe(0);
    expect(eased(6000, 0, 0.5)).toBeLessThan(6000);
  });

  it("never reads past either end, however the clock lands", () => {
    // A frame that began before the roll did, which the browser really does hand us.
    expect(eased(0, 6000, -0.05)).toBe(0);
    expect(eased(0, 6000, 1.4)).toBe(6000);
    expect(eased(6000, 0, -0.05)).toBe(6000);
  });

  it("is front-loaded, so the figure is nearly there before it stops", () => {
    expect(eased(0, 1000, 0.5)).toBeGreaterThan(800);
  });
});
