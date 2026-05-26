'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Leaf } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { ConsentFlow } from '@/components/ConsentFlow';
import { ChatInterface } from '@/components/ChatInterface';
import { CameraFeed } from '@/components/CameraFeed';
import { VoiceInput } from '@/components/VoiceInput';
import { SafetyPanel } from '@/components/SafetyPanel';
import { AvatarDisplay } from '@/components/AvatarDisplay';
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import { useAvatar } from '@/hooks/useAvatar';
import type { ConsentRecord, VisionSignals } from '@/lib/types';

type AppState = 'consent' | 'session' | 'ended';

// How long (ms) the user has to review / edit a voice transcript before it auto-sends.
const VOICE_SEND_DELAY_MS = 2500;

export default function SessionPage() {
  const router = useRouter();
  const [appState, setAppState] = useState<AppState>('consent');
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [inputText, setInputText] = useState('');
  const [pendingSend, setPendingSend] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Timer for the voice auto-send delay
  const sendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keeps the latest input value accessible inside timer callbacks without stale closures
  const pendingTextRef = useRef('');

  const {
    messages,
    isConnected,
    isStreaming,
    pacingAction,
    error,
    startSession,
    sendMessage,
    sendVisionSignals,
    finishSession,
  } = useSession();

  // ── Avatar (D-ID + ElevenLabs voice) ───────────────────────────────────
  const {
    videoRef: avatarVideoRef,
    isConnected: avatarConnected,
    isConnecting: avatarConnecting,
    isSpeaking: avatarSpeaking,
    avatarError,
    connect: connectAvatar,
    disconnect: disconnectAvatar,
    speak: avatarSpeak,
    stopSpeaking: avatarStop,
  } = useAvatar();

  // ── Voice (speech recognition + TTS fallback) ──────────────────────────
  // Cancel any pending auto-send (called when user manually types or sends)
  const cancelPendingSend = useCallback(() => {
    if (sendTimerRef.current) {
      clearTimeout(sendTimerRef.current);
      sendTimerRef.current = null;
    }
    setPendingSend(false);
  }, []);

  // Schedule an auto-send after VOICE_SEND_DELAY_MS — user can edit before it fires
  const scheduleSend = useCallback((text: string) => {
    cancelPendingSend();
    pendingTextRef.current = text;
    setPendingSend(true);
    sendTimerRef.current = setTimeout(() => {
      const toSend = pendingTextRef.current.trim();
      if (toSend) {
        sendMessage(toSend);
        setInputText('');
        pendingTextRef.current = '';
      }
      setPendingSend(false);
      sendTimerRef.current = null;
    }, VOICE_SEND_DELAY_MS);
  }, [cancelPendingSend, sendMessage]);

  // Use a ref so handleTranscript stays stable (avoids recreating SpeechRecognition on every render)
  const audioConsentRef = useRef<boolean>(false);
  useEffect(() => {
    audioConsentRef.current = consent?.audio_consent ?? false;
  }, [consent?.audio_consent]);

  // Interim (partial) transcript: show in real-time while user is still speaking
  const handleInterimTranscript = useCallback((text: string) => {
    setInputText(text);
    pendingTextRef.current = text;
  }, []);

  // Final transcript: show in input + start the 2.5 s correction window, then auto-send
  const handleTranscript = useCallback(
    (text: string) => {
      setInputText(text);
      pendingTextRef.current = text;
      if (audioConsentRef.current) {
        scheduleSend(text);
      }
    },
    [scheduleSend]
  );

  const {
    isListening,
    isSpeaking: ttsSpeaking,
    isSupported,
    startListening,
    stopListening,
    speak: ttsSpeak,
    stopSpeaking: ttsStop,
    unlockAudio,
  } = useVoice({
    onTranscript: handleTranscript,
    onInterimTranscript: handleInterimTranscript,
  });

  // Combined speaking flag — avatar takes priority; fall back to TTS if avatar fails
  const isSpeaking = avatarSpeaking || ttsSpeaking;

  // ── Speak last AI message ───────────────────────────────────────────────
  // ID-deduplicated so the same message is only spoken once.
  const lastSpokenIdRef = useRef('');
  useEffect(() => {
    if (!consent?.audio_consent) return;
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant' || !last.content) return;
    if (last.isStreaming) return;
    if (last.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = last.id;

    // Prefer avatar; if it has a hard error use ElevenLabs TTS as fallback
    if (!avatarError) {
      avatarSpeak(last.content);
    } else {
      ttsSpeak(last.content);
    }
  }, [isStreaming, messages, consent?.audio_consent, avatarSpeak, ttsSpeak, avatarError]);

  // ── Auto-listen loop after speaking ends ───────────────────────────────
  // Don't open mic while a send is pending — let the user finish reviewing first.
  const hasSpokenRef = useRef(false);
  useEffect(() => {
    if (isSpeaking) {
      hasSpokenRef.current = true;
      return;
    }
    if (!hasSpokenRef.current) return;
    if (!consent?.audio_consent) return;
    if (appState !== 'session') return;
    if (isStreaming) return;
    if (isListening) return;
    if (pendingSend) return;

    const timer = setTimeout(() => startListening(), 700);
    return () => clearTimeout(timer);
  }, [isSpeaking, isStreaming, isListening, pendingSend, consent?.audio_consent, appState, startListening]);

  // ── Consent complete ────────────────────────────────────────────────────
  const handleConsentComplete = useCallback(
    async (c: ConsentRecord) => {
      unlockAudio();
      setConsent(c);
      setCameraEnabled(c.camera_consent);

      // Start the WebRTC connection eagerly so Fiona is ready by the time the
      // opening message arrives.
      if (c.audio_consent) {
        connectAvatar();
      }

      try {
        await startSession(c);
        setAppState('session');
      } catch {
        // error displayed in component
      }
    },
    [startSession, unlockAudio, connectAvatar]
  );

  // ── Message send helpers ────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    cancelPendingSend();
    const text = inputText.trim();
    if (!text || isStreaming) return;
    sendMessage(text);
    setInputText('');
    pendingTextRef.current = '';
    inputRef.current?.focus();
  }, [cancelPendingSend, inputText, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleVisionSignals = useCallback(
    (signals: VisionSignals) => {
      sendVisionSignals(signals);
    },
    [sendVisionSignals]
  );

  const handleEndSession = useCallback(async () => {
    cancelPendingSend();
    await finishSession();
    disconnectAvatar();
    setAppState('ended');
  }, [cancelPendingSend, finishSession, disconnectAvatar]);

  const handleGrounding = useCallback(() => {
    sendMessage("I'd like a grounding exercise, please.");
  }, [sendMessage]);

  const handleStopSpeaking = useCallback(() => {
    avatarStop();
    ttsStop();
  }, [avatarStop, ttsStop]);

  // ── Consent step ────────────────────────────────────────────────────────
  if (appState === 'consent') {
    return <ConsentFlow onComplete={handleConsentComplete} />;
  }

  // ── Ended state ─────────────────────────────────────────────────────────
  if (appState === 'ended') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl border border-stone-200 shadow-sm p-8 max-w-sm w-full text-center space-y-4"
        >
          <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto">
            <Leaf className="w-8 h-8 text-sage-600" />
          </div>
          <h2 className="text-xl font-semibold text-stone-800">Session complete</h2>
          <p className="text-stone-500 text-sm leading-relaxed">
            Take a moment to notice how you feel. There is no need to do anything — just be here.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push('/')}
              className="flex-1 py-2.5 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
            >
              Home
            </button>
            <button
              onClick={() => {
                setAppState('consent');
                setInputText('');
                cancelPendingSend();
              }}
              className="flex-1 py-2.5 rounded-xl bg-sage-600 hover:bg-sage-700 text-white text-sm font-medium transition-colors"
            >
              New session
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Active session ───────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-stone-50">
      <SafetyPanel
        pacingAction={pacingAction}
        onEndSession={handleEndSession}
        onSendGrounding={handleGrounding}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs text-red-700">
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-hidden flex">

        {/* ── Avatar side-panel (desktop) ──────────────────────────── */}
        <div className="hidden lg:flex w-72 flex-col items-center border-r border-stone-200 bg-white px-4 py-6 gap-6 overflow-y-auto">
          <AvatarDisplay
            videoRef={avatarVideoRef}
            isConnected={avatarConnected}
            isConnecting={avatarConnecting}
            isSpeaking={avatarSpeaking}
          />

          {/* Avatar error hint */}
          {avatarError && (
            <p className="text-[10px] text-amber-500 text-center leading-relaxed px-2">
              Avatar unavailable — voice-only mode active
            </p>
          )}

          {/* Camera feed */}
          <div className="w-full space-y-2">
            <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wide">
              Your camera
            </h3>
            <CameraFeed
              enabled={cameraEnabled}
              onSignals={handleVisionSignals}
              onToggle={setCameraEnabled}
            />
            {!cameraEnabled && (
              <p className="text-xs text-stone-400 leading-relaxed">
                Camera off — coach adapts to your text responses.
              </p>
            )}
          </div>

          <div className="mt-auto text-center space-y-1">
            <p className="text-[10px] text-stone-300 leading-relaxed">
              All analysis runs locally in your browser.
            </p>
          </div>
        </div>

        {/* ── Main: chat + input ───────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Mobile: compact avatar strip */}
          <div className="lg:hidden flex items-center gap-3 px-4 py-2 border-b border-stone-200 bg-white">
            <AvatarDisplay
              videoRef={avatarVideoRef}
              isConnected={avatarConnected}
              isConnecting={avatarConnecting}
              isSpeaking={avatarSpeaking}
              compact
            />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-stone-700">Fiona</p>
              <p className="text-xs text-stone-400">Psychosomatic Coach</p>
              {avatarError && (
                <p className="text-[10px] text-amber-500">Voice-only mode</p>
              )}
            </div>
          </div>

          {/* Chat transcript */}
          <div className="flex-1 overflow-hidden">
            <ChatInterface
              messages={messages}
              isStreaming={isStreaming}
              pacingAction={pacingAction}
            />
          </div>

          {/* ── Input area ─────────────────────────────────────────── */}
          <div className="border-t border-stone-200 bg-white px-4 py-3">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <VoiceInput
                isListening={isListening}
                isSpeaking={isSpeaking}
                isSupported={isSupported && (consent?.audio_consent ?? false)}
                onStartListening={startListening}
                onStopListening={stopListening}
                onStopSpeaking={handleStopSpeaking}
              />

              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    pendingTextRef.current = e.target.value;
                    cancelPendingSend();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isStreaming    ? 'Coach is responding…' :
                    isListening    ? 'Listening… speak now' :
                    isSpeaking     ? 'Fiona is speaking…' :
                    pendingSend    ? 'Edit to correct, or press Enter to send now…' :
                    consent?.audio_consent ? 'Speak or type your response…' :
                    'Type your message…'
                  }
                  disabled={isStreaming || !isConnected}
                  rows={1}
                  className={`w-full resize-none rounded-xl border px-4 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-shadow disabled:opacity-50 max-h-32 overflow-y-auto ${
                    pendingSend ? 'border-sage-300 bg-sage-50' : 'border-stone-200'
                  }`}
                  style={{ lineHeight: '1.5' }}
                />
              </div>

              <button
                onClick={handleSend}
                disabled={!inputText.trim() || isStreaming || !isConnected}
                className="p-2.5 bg-sage-600 hover:bg-sage-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* Accent correction hint — shown during the auto-send countdown */}
            <AnimatePresence>
              {pendingSend && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-center text-xs text-sage-600 mt-1"
                >
                  Sending in a moment — edit above if it heard you wrong, or press Enter to send now
                </motion.p>
              )}
            </AnimatePresence>

            <p className="text-center text-xs text-stone-400 mt-2">
              {isConnected ? (
                <span className="flex items-center justify-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Connected
                </span>
              ) : (
                'Connecting...'
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
