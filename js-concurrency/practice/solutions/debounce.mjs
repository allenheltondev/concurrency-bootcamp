/* debounce — trailing-edge, last args win. Reference solution. */
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);                        // cancel the prior pending call
    timer = setTimeout(() => fn(...args), ms);  // re-arm with THIS call's args
  };
}
