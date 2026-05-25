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

export default function SessionPage() {
  const router = useRouter();
  const [appState, setAppState] = useState<AppState>('consent');
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  const handleTranscript = useCallback(
    (text: string) => {
      setInputText(text);
    },
    []
  );

  const { isListening, isSpeaking, isSupported, startListening, stopListening, speak, stopSpeaking } =
    useVoice({
      onTranscript: handleTranscript,
    });

  // Speak last AI message when streaming ends
  useEffect(() => {
    if (!consent?.audio_consent) return;
    const last = messages.at(-1);
    if (last?.role === 'assistant' && !last.isStreaming && last.content) {
      speak(last.content);
    }
  }, [messages, consent?.audio_consent, speak]);

  const handleConsentComplete = useCallback(
    async (c: ConsentRecord) => {
      setConsent(c);
      setCameraEnabled(c.camera_consent);
      try {
        await startSession(c);
        setAppState('session');
      } catch {
        // error displayed in component
      }
    },
    [startSession]
  );

  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isStreaming) return;
    sendMessage(text);
    setInputText('');
    inputRef.current?.focus();
  }, [inputText, isStreaming, sendMessage]);

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
    await finishSession();
    setAppState('ended');
  }, [finishSession]);

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
              onClick={() => { setAppState('consent'); setInputText(''); }}
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
      {/* Safety panel + header */}
      <SafetyPanel
        pacingAction={pacingAction}
        onEndSession={handleEndSession}
        onSendGrounding={handleGrounding}
      />

      {/* Error banner */}
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

      {/* Main layout */}
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
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isStreaming ? 'Coach is responding...' : 'Type or speak...'}
                  disabled={isStreaming || !isConnected}
                  rows={1}
                  className="w-full resize-none rounded-xl border border-stone-200 px-4 py-2.5 text-sm text-stone-800 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-transparent transition-shadow disabled:opacity-50 max-h-32 overflow-y-auto"
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

        {/* Side panel — camera + signals */}
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
