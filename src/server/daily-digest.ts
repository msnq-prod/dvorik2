export function queueDailyDigests(now = new Date()) {
  void now;
  return { queued: 0, code: "FEATURE_DISABLED" as const };
}

if (process.argv[1]?.endsWith("daily-digest.ts") || process.argv[1]?.endsWith("daily-digest.js")) {
  console.log(JSON.stringify(queueDailyDigests()));
}
