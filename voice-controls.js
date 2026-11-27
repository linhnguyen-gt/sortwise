// Hands-free Web Speech dictation and spoken bin-guidance helper for SortWise.

/**
 * Normalize speech-to-text transcripts for waste sorting commands.
 *
 * :param rawText: Transcript from Web Speech API or manual input.
 * :return: Parsed action { type: "triage"|"audit_sample"|"speak"|"stop", query?: string }.
 */
export function parseSortSpeech(rawText) {
  const clean = String(rawText || "").trim();
  if (!clean) {
    return { type: "noop" };
  }
  const lower = clean.toLowerCase().replace(/[.,!?;:]+$/g, "").trim();
  if (/^(stop speaking|mute|quiet|silence)$/.test(lower)) {
    return { type: "stop" };
  }
  if (/^(read result|repeat|speak result)$/.test(lower)) {
    return { type: "speak" };
  }
  if (/^(load sample audit|sample audit|run bin audit)$/.test(lower)) {
    return { type: "audit_sample" };
  }
  return { type: "triage", query: clean };
}

/**
 * Manages optional browser SpeechRecognition and SpeechSynthesis.
 */
export class SortVoiceController {
  constructor(handlers) {
    this.handlers = handlers;
    this.recognition = null;
    this.listening = false;
    this.stopping = false;
  }

  supportsRecognition() {
    return typeof window !== "undefined" && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  supportsSynthesis() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  toggleListening() {
    if (this.stopping) return false;
    if (this.listening) {
      this.stopListening();
      return false;
    }
    if (!this.supportsRecognition()) {
      this.handlers.onStatus?.("Voice dictation is unavailable in this browser. Type an item or pick a quick chip.");
      return false;
    }
    try {
      if (!this.recognition) this.recognition = this.createRecognition();
      this.recognition.start();
      this.listening = true;
      this.handlers.onListeningChange?.(true);
      this.handlers.onStatus?.("Listening for an item name (e.g. 'greasy pizza box' or 'swollen battery')...");
      return true;
    } catch (error) {
      this.listening = false;
      this.handlers.onListeningChange?.(false);
      this.handlers.onStatus?.(`Could not start microphone: ${error?.message || "permission required"}.`);
      return false;
    }
  }

  createRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = event => {
      const text = event.results?.[0]?.[0]?.transcript?.trim();
      if (this.listening && text) this.handlers.onTranscript?.(text);
    };
    recognition.onerror = event => {
      if (this.stopping && event.error === "aborted") return;
      this.listening = false;
      this.handlers.onListeningChange?.(false);
      this.handlers.onStatus?.(`Microphone warning: ${event.error || "unavailable"}.`);
    };
    recognition.onend = () => {
      this.stopping = false;
      this.listening = false;
      this.handlers.onListeningChange?.(false);
    };
    return recognition;
  }

  stopListening() {
    if (!this.listening) return;
    this.listening = false;
    this.stopping = true;
    try {
      this.recognition.abort();
    } catch {
      this.stopping = false;
    }
    this.handlers.onListeningChange?.(false);
    this.handlers.onStatus?.("Voice search stopped.");
  }

  speak(text) {
    const clean = String(text || "").trim();
    if (!clean || !this.supportsSynthesis()) {
      return false;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 0.98;
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
    return true;
  }

  stopSpeaking() {
    if (this.supportsSynthesis()) {
      window.speechSynthesis.cancel();
    }
  }
}
