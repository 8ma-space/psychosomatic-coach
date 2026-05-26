'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

interface UseVoiceOptions {
  onTranscript: (text: string) => void;
  /** Called with partial results while the user is still speaking — good for live display */
  onInterimTranscript?: (text: string) => void;
  onSpeakingChange?: (speaking: boolean) => void;
}

export function useVoice({ onTranscript, onInterimTranscript, onSpeakingChange }: UseVoiceOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSupported, setIsSupported] = useState(false);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Keep onInterimTranscript in a ref so we can update it without recreating the
  // recognition object (which would interrupt an active listening session).
  const onInterimRef = useRef(onInterimTranscript);
  useEffect(() => { onInterimRef.current = onInterimTranscript; }, [onInterimTranscript]);

  // Unlock AudioContext on first user gesture — called by parent on "Start session"
  const unlockAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  }, []);

  // Set up speech recognition
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    setIsSupported(true);
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    // Show words as they are spoken — helps accent users see what was heard
    recognition.interimResults = true;
    // Broader English model (not locked to en-US dialect)
    recognition.lang = 'en';

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0]?.transcript ?? '';
        if (event.results[i].isFinal) {
          final += text;
        } else {
          interim += text;
        }
      }

      if (final.trim()) {
        onTranscript(final.trim());
      } else if (interim.trim()) {
        // Stream interim results to parent for live display
        onInterimRef.current?.(interim.trim());
      }
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
  }, [onTranscript]);

  const startListening = useCallback(() => {
    unlockAudio();
    if (!recognitionRef.current || isListening) return;
    try {
      recognitionRef.current.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  }, [isListening, unlockAudio]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      if (sourceRef.current) {
        try { sourceRef.current.stop(); } catch { /* already stopped */ }
        sourceRef.current = null;
      }

      setIsSpeaking(true);
      onSpeakingChange?.(true);

      try {
        const resp = await fetch(`${API_URL}/api/tts/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });

        if (!resp.ok) throw new Error(`TTS error ${resp.status}`);

        const arrayBuffer = await resp.arrayBuffer();

        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        sourceRef.current = source;

        source.onended = () => {
          setIsSpeaking(false);
          onSpeakingChange?.(false);
          sourceRef.current = null;
        };

        source.start(0);
      } catch {
        setIsSpeaking(false);
        onSpeakingChange?.(false);
      }
    },
    [onSpeakingChange]
  );

  const stopSpeaking = useCallback(() => {
    if (sourceRef.current) {
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    setIsSpeaking(false);
    onSpeakingChange?.(false);
  }, [onSpeakingChange]);

  return { isListening, isSpeaking, isSupported, startListening, stopListening, speak, stopSpeaking, unlockAudio };
}
