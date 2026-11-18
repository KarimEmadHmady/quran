/**
 * Minimal typings + factory for the Web Speech API (claude.md 5.10, spec 4.5). The DOM lib
 * does not ship these types; Chrome/Edge expose `webkitSpeechRecognition`, Safari is limited.
 */

export interface SpeechAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechAlternative;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: SpeechResult };
}

export interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type Ctor = new () => SpeechRecognitionLike;

export function speechRecognitionCtor(): Ctor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * claude.md 5.10: voice recognition language (BCP-47 tag given to SpeechRecognition.lang).
 * Fixed to Egyptian Arabic; assigned to every new recognition instance (VoiceSearchButton.start).
 */
export const SPEECH_LANG = 'ar-EG';

/** Arabic messages for the Web Speech error codes. */
export function speechErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'لازم تسمح للمتصفح باستخدام الميكروفون.';
    case 'no-speech':
      return 'ما سمعناش صوت. جرّب تاني.';
    case 'audio-capture':
      return 'مفيش ميكروفون متاح.';
    case 'network':
      return 'خدمة التعرف على الصوت محتاجة اتصال بالإنترنت.';
    case 'language-not-supported':
      return 'اللهجة دي مش مدعومة في المتصفح ده. جرّب اللهجة التانية.';
    case 'aborted':
      return '';
    default:
      return 'حصل خطأ في التعرف على الصوت.';
  }
}
