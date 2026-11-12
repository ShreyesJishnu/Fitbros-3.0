import { lockScroll } from "./scrollLock";

/**
 * The lock has to put the page back exactly as it found it, including when one
 * modal opens another — Admin opens a confirm dialog over its own form, and the
 * inner one releasing must not unlock the page under the outer one.
 */

const gutter = (width: number) => {
  // jsdom reports no scrollbar of its own, so the reserved width is set here.
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: 1000,
    configurable: true,
  });
};

beforeEach(() => {
  document.body.style.removeProperty("overflow");
  document.body.style.removeProperty("padding-right");
  gutter(1000);
});

it("holds the page still, then gives it back untouched", () => {
  const unlock = lockScroll();
  expect(document.body.style.overflow).toBe("hidden");
  unlock();
  expect(document.body.style.overflow).toBe("");
});

it("hands back the width the scrollbar gave up, so nothing shifts sideways", () => {
  gutter(1015);
  const unlock = lockScroll();
  expect(document.body.style.paddingRight).toBe("15px");
  unlock();
  expect(document.body.style.paddingRight).toBe("");
});

it("leaves padding alone where the scrollbar takes no width", () => {
  const unlock = lockScroll();
  expect(document.body.style.paddingRight).toBe("");
  unlock();
});

it("keeps the page locked when the inner of two modals closes", () => {
  const releaseOuter = lockScroll();
  const releaseInner = lockScroll();

  releaseInner();
  expect(document.body.style.overflow).toBe("hidden");

  releaseOuter();
  expect(document.body.style.overflow).toBe("");
});

it("restores whatever the page already had, rather than assuming it had nothing", () => {
  document.body.style.overflow = "clip";
  const unlock = lockScroll();
  unlock();
  expect(document.body.style.overflow).toBe("clip");
});
