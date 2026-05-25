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
  /**
   * Local position — relative to the immediate parent. Computed as the
   * element's body-relative offset minus the parent's body-relative offset
   * (offsetTop alone is relative to the nearest positioned ancestor, which
   * is usually the body for static-flow content). Used as the FLIP gate so
   * we don't animate every element on the page when something far up the
   * page shrinks and pushes everything below.
   */
  let parentTop = 0;
  let parentLeft = 0;
  let pCur = el.parentElement;
  while (pCur) {
    parentTop += pCur.offsetTop || 0;
    parentLeft += pCur.offsetLeft || 0;
    pCur = pCur.offsetParent;
  }
  return {
    top,
    left,
    width: el.offsetWidth,
    height: el.offsetHeight,
    localTop: top - parentTop,
    localLeft: left - parentLeft,
  };
}
