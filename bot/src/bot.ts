/** Builds the bot (used by index.ts and the end-to-end tests). */
import { Bot, type BotConfig, type Context } from "grammy";
import { handlers } from "./handlers";

export function createBot(token: string, cfg?: BotConfig<Context>) {
  const bot = new Bot(token, cfg);
  bot.use(handlers);
  bot.catch((err) => console.error(`[bot] update ${err.ctx.update.update_id} failed:`, err.error));
  return bot;
}
