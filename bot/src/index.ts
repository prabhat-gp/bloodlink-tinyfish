/** Entry point: starts the Telegram bot (long polling) and the alert loop. */
import { MODE } from "../../src/lib/mode";
import { config } from "./config";

if (!config.token) {
  console.error("TELEGRAM_BOT_TOKEN is missing. Copy bot/.env.example to bot/.env.local and add the token from @BotFather.");
  process.exit(1);
}

console.log(`BloodLink bot: ${MODE} mode. Handlers come next.`);
