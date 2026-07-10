import { suite } from "./_harness.mjs";
import { increase, ratePerSec } from "./counter-rate.mjs";

suite("counter rate — truthful straight through the restarts", ({ log, assert }) => {
  const quiet = [{ t: 0, v: 100 }, { t: 15000, v: 400 }, { t: 30000, v: 700 }];
  assert(increase(quiet) === 600, "steady growth: increase must be 600, got " + increase(quiet));
  assert(Math.abs(ratePerSec(quiet) - 20) < 1e-9, "600 over 30s is 20/s, got " + ratePerSec(quiet));

  const deploy = [{ t: 0, v: 1000 }, { t: 15000, v: 1300 }, { t: 30000, v: 70 }, { t: 45000, v: 370 }];
  log("scrapes across a deploy: 1000 -> 1300 -> 70 -> 370");
  const inc = increase(deploy);
  assert(inc === 670, "300 + 70 (reborn from zero) + 300 = 670, got " + inc);
  assert(inc >= 0, "an increase can never be negative — that's the whole reset rule");
  const r = ratePerSec(deploy);
  log("increase " + inc + " over 45s -> " + r.toFixed(2) + "/s");
  assert(Math.abs(r - 670 / 45) < 1e-9, "rate must be 670/45, got " + r);

  const doubleReset = [{ t: 0, v: 50 }, { t: 15000, v: 10 }, { t: 30000, v: 5 }];
  assert(increase(doubleReset) === 15, "two resets: 10 + 5 = 15, got " + increase(doubleReset));

  const flat = [{ t: 0, v: 42 }, { t: 60000, v: 42 }];
  assert(increase(flat) === 0 && ratePerSec(flat) === 0, "no growth is rate 0, not NaN");
  return "a drop in a counter can only mean restart-from-zero — count the new value, never the difference";
});
