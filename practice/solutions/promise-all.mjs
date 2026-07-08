/* promiseAll — order-preserving, first-rejection-wins. Reference solution. */
export function promiseAll(promises) {
  return new Promise((resolve, reject) => {
    const list = [...promises];
    const results = new Array(list.length);
    let remaining = list.length;
    if (remaining === 0) return resolve(results);   // empty resolves at once
    list.forEach((p, i) => {
      Promise.resolve(p).then((v) => {              // normalize plain values
        results[i] = v;                             // store at INPUT index
        if (--remaining === 0) resolve(results);    // count settlements down
      }, reject);                                   // any rejection rejects all
    });
  });
}
