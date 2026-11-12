import { useEffect } from "react";

/**
 * Hold the page still while something covers it.
 *
 * A modal is a fixed layer over a page that is still perfectly scrollable, so a
 * scroll that lands anywhere but the panel — the backdrop beside it, the gap
 * above it — moves the page underneath instead. Two scroll surfaces answer one
 * gesture, and the sheet looks like it is drifting over a page with a mind of
 * its own.
 *
 * Locking takes away the page's scrollbar, and a platform that reserves space
 * for one would shift the whole layout sideways as it goes. The width it gives
 * up is handed straight back as padding, so nothing moves.
 *
 * shortcut: overflow alone, which older iOS Safari ignores on body; if the
 * group reports the page still moving behind a sheet on an iPhone, this needs
 * the position:fixed treatment and a depth count to survive one modal opening
 * another.
 */
export function lockScroll(): () => void {
  const { body } = document;
  const gutter = window.innerWidth - document.documentElement.clientWidth;
  const overflow = body.style.overflow;
  const paddingRight = body.style.paddingRight;

  body.style.overflow = "hidden";
  if (gutter > 0) body.style.paddingRight = `${gutter}px`;

  // Put back by removing, not by assigning "": a longhand of a shorthand —
  // padding-right inside padding — does not always clear when it is set to the
  // empty string, and a stuck padding is a page sitting permanently off-centre.
  return () => {
    restore("overflow", overflow);
    restore("padding-right", paddingRight);
  };
}

const restore = (property: string, value: string) => {
  if (value) document.body.style.setProperty(property, value);
  else document.body.style.removeProperty(property);
};

/** The same thing, for as long as a component is on screen. */
export const useScrollLock = (active = true) => {
  useEffect(() => (active ? lockScroll() : undefined), [active]);
};
