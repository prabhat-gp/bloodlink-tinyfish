/** Bot settings. The npm scripts load ../.env.local (TinyFish key, mode) and bot/.env.local (bot settings). */
const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const config = {
  token: process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "",
  username: process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "",
  cacheTtlMinutes: num(process.env.CACHE_TTL_MINUTES, 15),
  alertIntervalMinutes: num(process.env.ALERT_INTERVAL_MINUTES, 30),
  alertTtlHours: 48,
  webAppUrl: process.env.WEB_APP_URL?.trim() || "http://localhost:3010",
};
