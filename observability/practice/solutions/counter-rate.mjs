/* Counter rate — reference solution. */
"use strict";

export function increase(samples) {
  let inc = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i].v - samples[i - 1].v;
    inc += d >= 0 ? d : samples[i].v;   // a drop = reborn at zero
  }
  return inc;
}

export function ratePerSec(samples) {
  const seconds = (samples[samples.length - 1].t - samples[0].t) / 1000;
  return increase(samples) / seconds;
}
