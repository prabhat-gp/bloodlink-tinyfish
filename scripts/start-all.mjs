#!/usr/bin/env node
// Production start (Railway): the website and the Telegram bot in one container, sharing .data/
// (mount a volume at /app/.data). If either stops, everything stops so Railway restarts the container.
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync(".data", { recursive: true });
const port = process.env.PORT || "3000";
const procs = [];
const run = (name, cmd, args) => {
  const p = spawn(cmd, args, { stdio: "inherit", env: process.env });
  p.on("exit", (code, signal) => {
    console.log(`[start-all] ${name} exited (${code ?? signal}); stopping`);
    for (const q of procs) if (q !== p) q.kill("SIGTERM");
    process.exit(code ?? 1);
  });
  procs.push(p);
};

run("web", "npx", ["next", "start", "-p", port, "-H", "0.0.0.0"]);
if (process.env.TELEGRAM_BOT_TOKEN) run("bot", "npm", ["--prefix", "bot", "start"]);
else console.log("[start-all] TELEGRAM_BOT_TOKEN not set: website only");

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => procs.forEach((p) => p.kill(sig)));
