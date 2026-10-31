/**
 * Per-chat state and alerts, saved as JSON in .data/bot-*.json (git-ignored, shared folder with the web app).
 * Only Telegram chat IDs and search settings. No names, phone numbers or patient details.
 */
import { readJson, writeJson } from "../../src/lib/server/store";
import type { BloodGroup } from "../../src/lib/types";
import type { GroupBase } from "./parser";

/** Where the person is (or the patient is). */
export interface Spot {
  name: string;
  /** eRaktKosh district code */
  district: string;
  lat?: number;
  lng?: number;
  /** false = a whole city/district: good for a search, too vague for distances */
  precise: boolean;
  /** Came from a Telegram location pin */
  pin?: boolean;
}

/** What we're collecting before we can search. */
export interface Draft {
  intent: "blood" | "nearest";
  group?: BloodGroup;
  groupBase?: GroupBase;
  component?: string;
  componentChoices?: string[];
  spot?: Spot;
  nearMe?: boolean;
  alertMe?: boolean;
  donate?: boolean;
}

export interface ChatState {
  draft?: Draft;
  awaiting?: "group" | "component" | "place";
  /** Last place used: the next search reuses it instead of asking again. */
  spot?: Spot;
  /** A reply keyboard (location button) is showing and should be removed. */
  replyKeyboard?: boolean;
  seenAt: number;
}

export interface Alert {
  id: string;
  chatId: number;
  group: BloodGroup;
  component: string;
  district: string;
  spot?: Spot;
  /** Banks already reported to this chat (we only message about new ones). */
  known: string[];
  createdAt: string;
  expiresAt: string;
  lastCheckedAt?: string;
}

let persist = true;
/** Tests turn this off so nothing touches .data/. */
export const setPersistence = (on: boolean) => {
  persist = on;
};
export const isPersisting = () => persist;

function jsonFile<T>(name: string, initial: () => T) {
  let data = initial();
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    get: () => data,
    set: (v: T) => {
      data = v;
    },
    async load() {
      if (persist) data = await readJson<T>(name, initial());
    },
    /** Debounced, atomic write. */
    save() {
      if (!persist || timer) return;
      timer = setTimeout(() => {
        timer = null;
        writeJson(name, data).catch((e) => console.error(`[store] could not save ${name}:`, e));
      }, 250);
    },
    reset() {
      data = initial();
    },
  };
}

const chats = jsonFile<Record<string, ChatState>>("bot-chats.json", () => ({}));
const alertsFile = jsonFile<Alert[]>("bot-alerts.json", () => []);

export async function loadStore() {
  await Promise.all([chats.load(), alertsFile.load()]);
}

export function resetStore() {
  chats.reset();
  alertsFile.reset();
}

export function chatState(chatId: number): ChatState {
  const all = chats.get();
  const st = (all[String(chatId)] ??= { seenAt: Date.now() });
  st.seenAt = Date.now();
  return st;
}

export const saveChats = () => chats.save();

export const allAlerts = () => alertsFile.get();
export function setAlerts(list: Alert[]) {
  alertsFile.set(list);
  alertsFile.save();
}
export const saveAlerts = () => alertsFile.save();
