import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Tiny JSON file store under `.data/` (git-ignored). Holds the spend ledger, last good
 * results per search, and ids created by `npm run setup` (dataset, monitor, research).
 */
const DIR = path.join(process.cwd(), ".data");

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path.join(DIR, name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(name: string, data: unknown) {
  await mkdir(DIR, { recursive: true });
  const file = path.join(DIR, name);
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, file);
}
