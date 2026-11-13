import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

const STORE_PATH = new URL('../../data/posted.json', import.meta.url).pathname;
const MAX_AGE_DAYS = 30;

async function load() {
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function save(entries) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, JSON.stringify(entries, null, 2));
}

function prune(entries) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  return Object.fromEntries(
    Object.entries(entries).filter(([, postedAt]) => new Date(postedAt).getTime() > cutoff)
  );
}

function key(deal) {
  return `${deal.store}:${deal.externalId}`;
}

export async function openDealStore() {
  const entries = prune(await load());

  return {
    wasPosted(deal) {
      return key(deal) in entries;
    },
    markPosted(deal) {
      entries[key(deal)] = new Date().toISOString();
    },
    async persist() {
      await save(entries);
    }
  };
}
