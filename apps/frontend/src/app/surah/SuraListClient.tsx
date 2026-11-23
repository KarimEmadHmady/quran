"use client";

import Link from "next/link";
import { useState } from "react";
import { PlaySuraButton } from "@/components/audio/AyahPlayButton";
import { Icon } from "@/components/Icon";
import { PLACE_LABEL, type SuraInfo } from "@/lib/quran";
import { useBookmarkStore } from "@/store/useBookmarkStore";

/** Strip diacritics / hamza forms so "الاخلاص" finds "الإخلاص". */
const fold = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();

const toArabicDigits = (n: number) =>
  String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);

type Place = "all" | "mecca" | "medina";
const PLACES: { value: Place; label: string }[] = [
  { value: "all", label: "كل السور" },
  { value: "mecca", label: "المكية" },
  { value: "medina", label: "المدنية" },
];

/** Eight-pointed star behind the sura number (design). */
function NumberStar({ n, meccan }: { n: number; meccan: boolean }) {
  return (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center text-sm font-semibold text-[var(--accent)]">
      <svg viewBox="0 0 44 44" aria-hidden className="absolute inset-0">
        <g fill={meccan ? "var(--tile-mint-icon)" : "var(--surface-2)"}>
          <rect x="8" y="8" width="28" height="28" rx="5" />
          <rect
            x="8"
            y="8"
            width="28"
            height="28"
            rx="5"
            transform="rotate(45 22 22)"
          />
        </g>
      </svg>
      <span className="relative">{toArabicDigits(n)}</span>
    </span>
  );
}

/** Design: search field, index card, place filter chips, and one card per sura. */
export function SuraListClient({ suras }: { suras: SuraInfo[] }) {
  const [filter, setFilter] = useState("");
  const [place, setPlace] = useState<Place>("all");
  // The last-read sura gets a filled bookmark (from the existing reading bookmark).
  const bookmarkSura = useBookmarkStore((s) => s.bookmark?.suraNumber ?? null);
  // The place filter only makes sense when the data has revelation places (currently all null).
  const hasPlaces = suras.some((s) => s.revelationPlace);
  const f = fold(filter);
  const shown = suras.filter(
    (s) =>
      (place === "all" || s.revelationPlace === place) &&
      (!f ||
        fold(s.nameAr).includes(f) ||
        String(s.number) === f ||
        s.nameEn.toLowerCase().includes(f.toLowerCase())),
  );

  return (
    <div className="space-y-5">
      <label className="ui-elevated flex items-center gap-3 rounded-2xl px-4">
        <Icon name="search" className="h-5 w-5 shrink-0 text-[var(--muted)]" />
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="ابحث باسم السورة أو رقمها…"
          aria-label="تصفية السور"
          className="min-w-0 flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-[var(--muted)]"
        />
      </label>

      <div className="relative overflow-hidden flex items-center justify-between gap-4 rounded-[1.25rem] bg-[var(--tile-gray)] px-5 py-5">
                              <img
          src="/geometry-bg.png"
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-0 top-0 h-26 w-auto select-none opacity-60 "
        />
        <div className="min-w-0">
          <span className="block text-xs text-[var(--gold)]">
            القرآن الكريم
          </span>
          <h1 className="mt-1 text-xl font-bold text-[var(--accent)]">
            سور القرآن الكريم
          </h1>
          <span className="mt-1 block text-sm text-[var(--muted)]">
            {toArabicDigits(suras.length)} سورة • ٣٠ جزءاً • ترتيل وتدبر
          </span>
        </div>
        <span
          aria-hidden
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--tile-sand-icon)] text-[var(--accent)]"
        >
          <Icon name="book" className="h-6 w-6" />
        </span>
      </div>

      {hasPlaces && (
        <div
          role="radiogroup"
          aria-label="نوع السور"
          className="flex flex-wrap gap-2"
        >
          {PLACES.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={place === p.value}
              onClick={() => setPlace(p.value)}
              className={`rounded-full px-5 py-2 text-sm transition ${
                place === p.value
                  ? "bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)]"
                  : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--fg)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="py-6 text-center text-[var(--muted)]">
          مفيش سورة بالاسم ده.
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((s) => (
            <li
              key={s.number}
              className="ui-elevated flex items-center gap-2 py-3 pe-3 ps-4 transition hover:-translate-y-0.5"
            >
              <Link
                href={`/surah/${s.number}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <NumberStar
                  n={s.number}
                  meccan={s.revelationPlace === "mecca"}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-[family-name:var(--font-quran)] text-xl leading-9">
                      {s.nameAr}
                    </span>
                    {s.revelationPlace && (
                      <span
                        className={`ui-badge ${s.revelationPlace === "mecca" ? "ui-badge-green" : "ui-badge-blue"}`}
                      >
                        {PLACE_LABEL[s.revelationPlace]}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-[var(--muted)]">
                    <span dir="ltr">{s.nameEn}</span> •{" "}
                    {toArabicDigits(s.ayahCount)} آية
                  </span>
                </span>
              </Link>
              <PlaySuraButton suraNumber={s.number} iconOnly />
              <span className="flex w-7 shrink-0 justify-center">
                {bookmarkSura === s.number && (
                  <span
                    role="img"
                    aria-label="آخر قراءة"
                    title="آخر قراءة"
                    className="text-[var(--danger)]"
                  >
                    <Icon name="bookmark" filled className="h-5 w-5" />
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
