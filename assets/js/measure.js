/**
 * Body-relative layout measurement.
 *
 * `offsetTop`/`offsetLeft`/`offsetWidth`/`offsetHeight` report the element's
 * *layout* values and are immune to CSS transforms, so they stay accurate
 * even while a previous animation is still playing on the same element.
 *
 * Why summing through the offsetParent chain: `offsetTop` alone is relative
 * to the nearest positioned ancestor, so if an ancestor reflows (e.g. a
 * bottom-anchored toast container shrinks when an item is removed), the
 * child's offsetTop changes even though it didn't visually move. Summing
 * cancels the ancestor shift. Still transform-immune (offsetTop is), unlike
 * getBoundingClientRect.
 */
export function measure(el) {
  let top = 0;
  let left = 0;
  let cur = el;
  while (cur) {
    top += cur.offsetTop || 0;
    left += cur.offsetLeft || 0;
    cur = cur.offsetParent;
  }
  return { top, left, width: el.offsetWidth, height: el.offsetHeight };
}
