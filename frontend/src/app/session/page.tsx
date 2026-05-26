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
import { useSession } from '@/hooks/useSession';
import { useVoice } from '@/hooks/useVoice';
import type { ConsentRecord, VisionSignals } from '@/lib/types';

type AppState = 'consent' | 'session' | 'ended';

// How long (ms) the user has to review / edit a voice transcript before it auto-sends.
// Gives people with accents time to correct mis-recognitions without stopping the flow.
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

  // Final transcript: show in input + start the 2.5s correction window, then auto-send
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

  const { isListening, isSpeaking, isSupported, startListening, stopListening, speak, stopSpeaking, unlockAudio } =
    useVoice({
      onTranscript: handleTranscript,
      onInterimTranscript: handleInterimTranscript,
    });

  // After AI finishes speaking, automatically open the mic (voice conversation loop).
  // Don't open while a send is pending — let the user finish reviewing first.
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
    if (pendingSend) return; // wait for the correction window to resolve

    const timer = setTimeout(() => startListening(), 700);
    return () => clearTimeout(timer);
  }, [isSpeaking, isStreaming, isListening, pendingSend, consent?.audio_consent, appState, startListening]);

  // Speak last AI message when streaming ends.
  const lastSpokenIdRef = useRef('');
  useEffect(() => {
    if (!consent?.audio_consent) return;
    const last = messages.at(-1);
    if (!last || last.role !== 'assistant' || !last.content) return;
    if (last.isStreaming) return;
    if (last.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = last.id;
    speak(last.content);
  }, [isStreaming, messages, consent?.audio_consent, speak]);

  const handleConsentComplete = useCallback(
    async (c: ConsentRecord) => {
      unlockAudio();
      setConsent(c);
      setCameraEnabled(c.camera_consent);
      try {
        await startSession(c);
        setAppState('session');
      } catch {
        // error displayed in component
      }
    },
    [startSession, unlockAudio]
  );

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
    setAppState('ended');
  }, [cancelPendingSend, finishSession]);

  const handleGrounding = useCallback(() => {
    sendMessage("I'd like a grounding exercise, please.");
  }, [sendMessage]);

  // Consent step
  if (appState === 'consent') {
    return <ConsentFlow onComplete={handleConsentComplete} />;
  }

  // Ended state
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
              onClick={() => { setAppState('consent'); setInputText(''); cancelPendingSend(); }}
              className="flex-1 py-2.5 rounded-xl bg-sage-600 hover:bg-sage-700 text-white text-sm font-medium transition-colors"
            >
              New session
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Active session
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
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-hidden">
            <ChatInterface
              messages={messages}
              isStreaming={isStreaming}
              pacingAction={pacingAction}
            />
          </div>

          {/* Input area */}
          <div className="border-t border-stone-200 bg-white px-4 py-3">
            <div className="flex items-end gap-2 max-w-3xl mx-auto">
              <VoiceInput
                isListening={isListening}
                isSpeaking={isSpeaking}
                isSupported={isSupported && (consent?.audio_consent ?? false)}
                onStartListening={startListening}
                onStopListening={stopListening}
                onStopSpeaking={stopSpeaking}
              />

              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    pendingTextRef.current = e.target.value;
                    // User is manually editing — cancel the auto-send timer
                    cancelPendingSend();
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isStreaming    ? 'Coach is responding…' :
                    isListening    ? 'Listening… speak now' :
                    isSpeaking     ? 'Coach is speaking…' :
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

        {/* Side panel */}
        <div className="hidden lg:flex w-72 flex-col border-l border-stone-200 bg-white p-4 space-y-4 overflow-y-auto">
          <h3 className="text-xs font-medium text-stone-500 uppercase tracking-wide">
            Observation
          </h3>

          <CameraFeed
            enabled={cameraEnabled}
            onSignals={handleVisionSignals}
            onToggle={setCameraEnabled}
          />

          {!cameraEnabled && (
            <p className="text-xs text-stone-400 leading-relaxed">
              Camera is off. The coach will adapt based on your text responses only.
            </p>
          )}

          <div className="mt-auto space-y-1 border-t border-stone-100 pt-4">
            <p className="text-xs text-stone-400">Session info</p>
            <p className="text-xs text-stone-300">All analysis runs locally in your browser.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
