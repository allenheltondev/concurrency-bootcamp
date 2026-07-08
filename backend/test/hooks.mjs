const FAKES = new Map([
  ["@aws-sdk/client-dynamodb", "./fakes/client-dynamodb.mjs"],
  ["@aws-sdk/lib-dynamodb", "./fakes/lib-dynamodb.mjs"]
]);

export async function resolve(specifier, context, nextResolve) {
  const fake = FAKES.get(specifier);
  if (fake) return { shortCircuit: true, url: new URL(fake, import.meta.url).href };
  return nextResolve(specifier, context);
}
