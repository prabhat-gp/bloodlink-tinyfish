import type { Camp } from "../mock/fixtures";
import type { SearchResult } from "./tinyfish";

export const CAMP_QUERY = "blood donation camp Bengaluru";

/** Search / Monitor results → camp cards. We don't invent dates: unknown stays blank. */
export function toCamps(results: SearchResult[]): Camp[] {
  const seen = new Set<string>();
  return results
    .filter((r) => /blood|donat/i.test(`${r.title} ${r.snippet ?? ""}`))
    .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
    .slice(0, 6)
    .map((r) => ({
      title: plain(r.title),
      date: r.date ? r.date.slice(0, 10) : "",
      place: plain(r.snippet ?? "").slice(0, 90),
      organiser: r.publisher ?? r.site_name ?? new URL(r.url).hostname,
      url: r.url,
    }));
}

export interface MonitorState {
  id: string;
  name: string;
  schedule: string;
  createdAt: string;
  lastRunAt?: string;
  camps: Camp[];
}

/** Search snippets carry markdown and emoji; the card wants plain text. */
const plain = (s: string) =>
  s
    .replace(/[*_#`>]+/g, "")
    .replace(/\p{Extended_Pictographic}\uFE0F?/gu, "")
    .replace(/\s+/g, " ")
    .trim();
