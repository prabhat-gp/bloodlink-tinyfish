/**
 * "Alert me": one alert per chat + search, re-checked every 30 min for 48 h.
 * Alerts for the same search share one agent run. A message goes out only when a blood bank
 * that wasn't reported before now has stock.
 */
import type { Api } from "grammy";
import type { Simulate } from "../../src/lib/mock/engine";
import type { SearchQuery } from "../../src/lib/types";
import { config } from "./config";
import * as F from "./format";
import { searchBloodStock } from "./search";
import { allAlerts, saveAlerts, setAlerts, type Alert, type Spot } from "./store";

const same = (a: Alert, q: Pick<SearchQuery, "group" | "component" | "district">) =>
  a.group === q.group && a.component === q.component && a.district === q.district;

export function addAlert(chatId: number, q: SearchQuery, spot: Spot | undefined, known: string[]): Alert {
  const now = Date.now();
  const alert: Alert = {
    id: Math.random().toString(36).slice(2, 8),
    chatId,
    group: q.group,
    component: q.component,
    district: q.district,
    spot,
    known,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + config.alertTtlHours * 3_600_000).toISOString(),
  };
  setAlerts([...allAlerts().filter((a) => !(a.chatId === chatId && same(a, q))), alert]);
  return alert;
}

export const listAlerts = (chatId: number) => allAlerts().filter((a) => a.chatId === chatId);

export function removeAlert(chatId: number, id: string) {
  const before = allAlerts().length;
  setAlerts(allAlerts().filter((a) => !(a.chatId === chatId && a.id === id)));
  return allAlerts().length < before;
}

async function send(api: Api, chatId: number, m: F.Msg) {
  try {
    await api.sendMessage(chatId, m.text, { parse_mode: "HTML", reply_markup: m.keyboard, link_preview_options: { is_disabled: true } });
  } catch (e) {
    // Blocked the bot / deleted the chat: drop their alerts.
    if ((e as { error_code?: number }).error_code === 403) setAlerts(allAlerts().filter((a) => a.chatId !== chatId));
    else console.error(`[alerts] send to ${chatId} failed:`, e);
  }
}

/** Run all due checks now. `simulate: "appear"` (mock mode) makes new stock show up for demos. Returns messages sent. */
export async function checkAlerts(api: Api, opts: { chatId?: number; simulate?: Simulate } = {}): Promise<number> {
  const now = Date.now();
  const mine = (a: Alert) => opts.chatId === undefined || a.chatId === opts.chatId;

  const expired = allAlerts().filter((a) => mine(a) && Date.parse(a.expiresAt) <= now);
  if (expired.length) {
    setAlerts(allAlerts().filter((a) => !expired.includes(a)));
    for (const a of expired) await send(api, a.chatId, F.alertExpired(a));
  }

  const groups = new Map<string, Alert[]>();
  for (const a of allAlerts().filter(mine)) {
    const k = F.qk(a);
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  let sent = 0;
  await Promise.all(
    [...groups.values()].map(async (list) => {
      const q: SearchQuery = { state: "29", group: list[0].group, component: list[0].component, district: list[0].district };
      const r = await searchBloodStock(q, undefined, { maxAgeMinutes: Math.max(1, config.alertIntervalMinutes / 2), simulate: opts.simulate });
      if (!r.ok || r.source === "cache") return; // never alert from an old fallback result
      const withStock = F.rank(r).filter((b) => b.hasRequested);
      for (const a of list) {
        a.lastCheckedAt = r.checkedAt;
        const fresh = withStock.filter((b) => !a.known.includes(b.name));
        if (!fresh.length) continue;
        a.known = [...new Set([...a.known, ...fresh.map((b) => b.name)])];
        await send(api, a.chatId, F.alertMessage(a, fresh, r));
        sent++;
      }
    }),
  );
  saveAlerts();
  return sent;
}

export function startAlertLoop(api: Api) {
  const timer = setInterval(
    () => void checkAlerts(api).catch((e) => console.error("[alerts] check failed:", e)),
    config.alertIntervalMinutes * 60_000,
  );
  return () => clearInterval(timer);
}
