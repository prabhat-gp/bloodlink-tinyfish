"use client";

import { useState } from "react";
import { shareMessage, telegramUrl, whatsappUrl } from "@/lib/share";
import type { Bank, BloodGroup } from "@/lib/types";
import { Bell, Check, Copy, Share } from "./icons";

interface Props {
  group: BloodGroup;
  component: string;
  district: string;
  banks: Bank[];
  watching: boolean;
  onToggleWatch: () => void;
  watchNote: string | null;
  mock: boolean;
}

export function ActionsPanel({ group, component, district, banks, watching, onToggleWatch, watchNote, mock }: Props) {
  const [copied, setCopied] = useState(false);
  const text = shareMessage(group, component, banks);
  const found = watchNote?.startsWith("🔔");

  return (
    <section className="grid gap-3 pt-2 md:grid-cols-2">
      <div className="card flex flex-col p-5">
        <h2 className="flex items-center gap-2 font-semibold text-zinc-900">
          <Share className="h-4 w-4 text-zinc-500" /> Share with family &amp; donors
        </h2>
        <pre className="mt-3 max-h-36 flex-1 overflow-auto rounded-xl bg-zinc-50 p-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-zinc-700">
          {text}
        </pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={whatsappUrl(text)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1fa855] px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-[#178a45]"
          >
            Share on WhatsApp
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              } catch {
                setCopied(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className={`card flex flex-col p-5 ${found ? "ring-2 ring-emerald-400" : ""}`}>
        <h2 className="flex items-center gap-2 font-semibold text-zinc-900">
          <Bell className="h-4 w-4 text-zinc-500" /> Keep looking
        </h2>
        <p className="mt-1.5 flex-1 text-sm text-zinc-600">
          Re-runs this search every {mock ? "30 seconds (demo speed)" : "30 minutes"}, up to 6 times, and alerts you here the
          moment new {group} stock shows up. Keep this tab open.
        </p>
        {watching && (
          <p className="mt-3 flex items-center gap-2 text-[13px] font-medium text-zinc-700">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blood-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blood-500" />
            </span>
            {watchNote}
          </p>
        )}
        {/* The alert outlives the watch: watching stops once stock is found. */}
        {!watching && watchNote && (
          <p
            role="alert"
            className={`mt-3 rounded-xl p-3 text-sm font-semibold ${found ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
          >
            {watchNote}
          </p>
        )}
        <button
          onClick={onToggleWatch}
          aria-pressed={watching}
          className={`mt-3 inline-flex items-center justify-center gap-1.5 self-start rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
            watching ? "bg-zinc-100 text-zinc-800 hover:bg-zinc-200" : "bg-blood-600 text-white hover:bg-blood-500"
          }`}
        >
          <Bell className="h-4 w-4" />
          {watching ? "Stop looking" : "Start watching"}
        </button>
        <a
          href={telegramUrl({ group, component, district }, true)}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 self-start text-[13px] font-semibold text-[#229ED9] transition hover:translate-x-0.5"
        >
          Or get the alert on Telegram, even with this tab closed →
        </a>
      </div>
    </section>
  );
}
