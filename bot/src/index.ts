/** Entry point: starts the Telegram bot (long polling) and the alert loop. */
import type { Api } from "grammy";
import { hasKey } from "../../src/lib/server/tinyfish";
import { startAlertLoop } from "./alerts";
import { createBot } from "./bot";
import { config } from "./config";
import { loadStore } from "./store";

const DESCRIPTION = [
  "🩸 Find blood in an emergency.",
  "",
  "Send one message like “need O- blood near HSR”. An AI web agent checks the government's live blood stock (eRaktKosh) and I reply with blood banks that have it, their phone numbers and how fresh the data is.",
  "",
  "All 31 districts of Karnataka. Emergency: 108",
].join("\n");

/** Name, menu and the text people see before they press Start. Best effort: never blocks startup. */
async function setProfile(api: Api) {
  const tasks = [
    api.setMyCommands([
      { command: "start", description: "Find blood or the nearest blood bank" },
      { command: "alerts", description: "See or stop your stock alerts" },
      { command: "help", description: "How it works · emergency number" },
    ]),
    api.setMyDescription(DESCRIPTION),
    api.setMyShortDescription("Blood banks with your blood group in stock, live from eRaktKosh. All of Karnataka. Emergency: 108"),
    api.getMyName().then((n) => (n.name === "BloodLink" ? true : api.setMyName("BloodLink"))),
  ];
  const results = await Promise.allSettled(tasks);
  results.forEach((r) => r.status === "rejected" && console.warn("[bot] profile update skipped:", (r.reason as Error).message));
}

async function main() {
  if (!config.token) {
    console.error("TELEGRAM_BOT_TOKEN is missing. Copy bot/.env.example to bot/.env.local and add the token from @BotFather.");
    process.exit(1);
  }
  if (!hasKey()) {
    console.error("TINYFISH_API_KEY is missing from ../.env.local. The bot always searches live.");
    process.exit(1);
  }
  await loadStore();
  const bot = createBot(config.token);
  await setProfile(bot.api);
  const stopAlerts = startAlertLoop(bot.api);

  const stop = () => {
    stopAlerts();
    void bot.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  // During a redeploy the old copy may still be polling for a few seconds (Telegram 409). Wait and retry
  // instead of exiting, so the new container takes over cleanly.
  for (let attempt = 1; ; attempt++) {
    try {
      await bot.start({
        onStart: (me) =>
          console.log(
            `BloodLink bot @${me.username} running · live eRaktKosh · cache ${config.cacheTtlMinutes} min · alerts every ${config.alertIntervalMinutes} min`,
          ),
      });
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/409|Conflict/i.test(msg) || attempt >= 30) throw e;
      console.warn(`[bot] another copy is still polling (409); retrying in 10 s (${attempt}/30)`);
      await new Promise((r) => setTimeout(r, 10_000));
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/409|Conflict/i.test(msg)) console.error("Another copy of this bot kept running with the same token for 5 minutes. Stop it first.");
  else console.error(e);
  process.exit(1);
});
