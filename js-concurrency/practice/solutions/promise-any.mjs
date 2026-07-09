/* promiseAny — first fulfillment wins, else AggregateError. Reference solution. */
export function promiseAny(promises) {
  return new Promise((resolve, reject) => {
    const list = [...promises];
    const errors = new Array(list.length);
    let remaining = list.length;
    if (remaining === 0) {
      return reject(new AggregateError([], "All promises were rejected"));
    }
    list.forEach((p, i) => {
      Promise.resolve(p).then(resolve, (err) => {     // first fulfillment resolves
        errors[i] = err;                              // store rejection at INPUT index
        if (--remaining === 0) {                      // all rejected?
          reject(new AggregateError(errors, "All promises were rejected"));
        }
      });
    });
  });
}
