(function (root) {
  'use strict';
  function createPointerOwner() {
    let active = null;
    return {
      begin(event, allowTouch = false) {
        if (event.pointerType === 'touch' && !allowTouch) return false;
        if (active !== null) return false;
        active = event.pointerId;
        return true;
      },
      owns(event) { return active !== null && active === event.pointerId; },
      end(event) {
        if (active !== event.pointerId) return false;
        active = null;
        return true;
      },
    };
  }
  if (typeof module !== 'undefined') module.exports = { createPointerOwner };
  else root.createPointerOwner = createPointerOwner;
})(typeof window !== 'undefined' ? window : globalThis);
