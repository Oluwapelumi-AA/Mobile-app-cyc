import { useSyncExternalStore } from "react";

import type { Category, Resource } from "./types";

export type DateRange = "any" | "month" | "3months" | "year";
export type SortOrder = "newest" | "oldest" | "title";

export type SermonFilters = {
  format: ("audio" | "video")[];
  speakers: string[];
  categoryIds: string[];
  book: string | null;
  date: DateRange;
};

export const EMPTY_FILTERS: SermonFilters = { format: [], speakers: [], categoryIds: [], book: null, date: "any" };

type Store = { filters: SermonFilters; sermons: Resource[]; categories: Category[]; sort: SortOrder };

let state: Store = { filters: EMPTY_FILTERS, sermons: [], categories: [], sort: "newest" };
const listeners = new Set<() => void>();

export const sermonStore = {
  get: () => state,
  set(patch: Partial<Store>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/** Shared between the sermon list and its filter sheet. */
export function useSermonStore() {
  return useSyncExternalStore(sermonStore.subscribe, sermonStore.get, sermonStore.get);
}

export const BOOKS = [
  "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy", "Joshua", "Judges", "Ruth", "1 Samuel", "2 Samuel",
  "1 Kings", "2 Kings", "1 Chronicles", "2 Chronicles", "Ezra", "Nehemiah", "Esther", "Job", "Psalms", "Proverbs",
  "Ecclesiastes", "Song of Songs", "Isaiah", "Jeremiah", "Lamentations", "Ezekiel", "Daniel", "Hosea", "Joel", "Amos",
  "Obadiah", "Jonah", "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai", "Zechariah", "Malachi", "Matthew", "Mark",
  "Luke", "John", "Acts", "Romans", "1 Corinthians", "2 Corinthians", "Galatians", "Ephesians", "Philippians",
  "Colossians", "1 Thessalonians", "2 Thessalonians", "1 Timothy", "2 Timothy", "Titus", "Philemon", "Hebrews",
  "James", "1 Peter", "2 Peter", "1 John", "2 John", "3 John", "Jude", "Revelation",
];

/** "John 3:16" → "John"; "Psalm 23" → "Psalms". */
export function bookOf(ref: string | null): string | null {
  if (!ref) return null;
  const r = ref.trim().toLowerCase().replace(/^psalm\b/, "psalms");
  return BOOKS.find((b) => r.startsWith(b.toLowerCase())) ?? null;
}

export function countFilters(f: SermonFilters) {
  return f.format.length + f.speakers.length + f.categoryIds.length + (f.book ? 1 : 0) + (f.date !== "any" ? 1 : 0);
}

export function applyFilters(list: Resource[], f: SermonFilters, sort: SortOrder = "newest") {
  const now = Date.now();
  const days = { any: Infinity, month: 31, "3months": 92, year: 366 }[f.date];
  const out = list.filter((r) => {
    if (f.format.length && !f.format.includes(r.kind as "audio" | "video")) return false;
    if (f.speakers.length && !f.speakers.includes(r.author_name ?? "")) return false;
    if (f.categoryIds.length && !f.categoryIds.includes(r.category_id ?? "")) return false;
    if (f.book && bookOf(r.scripture_reference) !== f.book) return false;
    if (days !== Infinity) {
      const at = new Date(r.published_at ?? r.created_at).getTime();
      if (now - at > days * 86400000) return false;
    }
    return true;
  });
  const when = (r: Resource) => new Date(r.published_at ?? r.created_at).getTime();
  return out.sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title) : sort === "oldest" ? when(a) - when(b) : when(b) - when(a)));
}
