/* Entry for `npm test` (via node --import): registers module hooks that swap
   the real AWS SDK DynamoDB packages for the in-memory fake in test/fakes/,
   so the whole lambdalith — middy, Powertools, router, handlers — runs for
   real with only the storage layer substituted. */
import { register } from "node:module";
register(new URL("./hooks.mjs", import.meta.url));
