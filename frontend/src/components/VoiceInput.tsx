'use client';

import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';

interface Props {
  isListening: boolean;
  isSpeaking: boolean;
  isSupported: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
}

export function VoiceInput({
  isListening,
  isSpeaking,
  isSupported,
  onStartListening,
  onStopListening,
  onStopSpeaking,
}: Props) {
  if (!isSupported) return null;

  return (
    <div className="flex items-center gap-2">
      {/* Mic button */}
      <motion.button
        onClick={isListening ? onStopListening : onStartListening}
        whileTap={{ scale: 0.92 }}
        title={isListening ? 'Stop listening' : 'Speak'}
        className={`relative p-3 rounded-xl transition-colors ${
          isListening
            ? 'bg-rose-100 text-rose-600 hover:bg-rose-200'
            : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
        }`}
      >
        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        {isListening && (
          <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
        )}
      </motion.button>

      {/* Speaking indicator / stop */}
      {isSpeaking && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={onStopSpeaking}
          title="Stop speaking"
          className="p-3 rounded-xl bg-violet-100 text-violet-600 hover:bg-violet-200 transition-colors"
        >
          <VolumeX className="w-5 h-5" />
        </motion.button>
      )}

      {isListening && (
        <span className="text-xs text-stone-500 animate-pulse">Listening...</span>
      )}
    </div>
  );
}
