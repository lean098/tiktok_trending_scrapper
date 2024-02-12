export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(() => resolve("OK!"), ms));
