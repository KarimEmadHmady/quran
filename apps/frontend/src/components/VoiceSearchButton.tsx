'use client';

import { useEffect, useRef, useState } from 'react';
import {
  SPEECH_LANG,
  speechErrorMessage,
  speechRecognitionCtor,
  type SpeechRecognitionLike,
} from '@/lib/speech';
import { Icon } from './Icon';

export interface VoiceResult {
  /** Best transcript. */
  transcript: string;
  /** Other full transcripts, most likely first (sent as `alts`). */
  alternatives: string[];
}

/**
 * Microphone button (claude.md 5.10 / spec 4.5): Web Speech API with interim results and up to
 * 5 alternatives. The live transcript is reported while speaking; the final one (+ alts) on end.
 */
export function VoiceSearchButton({
  onInterim,
  onResult,
}: {
  onInterim: (text: string) => void;
  onResult: (r: VoiceResult) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(speechRecognitionCtor() !== null);
    return () => recRef.current?.abort();
  }, []);

  const start = () => {
    const Ctor = speechRecognitionCtor();
    if (!Ctor) return;
    setError('');
    // A NEW recognition instance on every start, always Egyptian Arabic.
    const rec = new Ctor();
    rec.lang = SPEECH_LANG;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    rec.continuous = false;
    let finals: { best: string; alts: string[] }[] = [];

    rec.onresult = (e) => {
      finals = [];
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          const alts: string[] = [];
          for (let k = 0; k < r.length; k++) alts.push(r[k].transcript.trim());
          finals.push({ best: alts[0] ?? '', alts: alts.slice(1) });
        } else {
          interim += r[0].transcript;
        }
      }
      onInterim([...finals.map((f) => f.best), interim].join(' ').trim());
    };
    rec.onerror = (e) => setError(speechErrorMessage(e.error));
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      if (finals.length === 0) return;
      const head = finals.slice(0, -1).map((f) => f.best);
      const last = finals[finals.length - 1];
      onResult({
        transcript: [...head, last.best].join(' ').trim(),
        // Alternatives differ in the last segment: keep the earlier segments' best text.
        alternatives: last.alts.map((a) => [...head, a].join(' ').trim()).filter(Boolean),
      });
    };
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const stop = () => recRef.current?.stop();

  // Status line under the search field (design: the mic lives inside the field).
  const status = (text: string, tone: 'muted' | 'danger', alert = false) => (
    <span
      role={alert ? 'alert' : undefined}
      className={`absolute right-0 top-full mt-2 text-xs ${tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--muted)]'}`}
    >
      {text}
    </span>
  );

  if (supported === false) {
    return (
      <div className="static">
        <p className="absolute right-0 top-full mt-2 text-xs text-[var(--muted)]">
          البحث الصوتي مش مدعوم في المتصفح ده (جرّب Chrome أو Edge).
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={listening ? stop : start}
        disabled={supported === null}
        aria-pressed={listening}
        aria-label={listening ? 'إيقاف التسجيل' : 'بحث صوتي'}
        className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
          listening ? 'animate-pulse bg-[var(--danger)] text-white' : 'text-[var(--accent)] hover:bg-[var(--surface-2)]'
        }`}
      >
        <Icon name="mic" className="h-6 w-6" />
      </button>
      {listening && status('بيسمع… اقرأ الآية', 'danger')}
      {error && status(error, 'danger', true)}
    </div>
  );
}
