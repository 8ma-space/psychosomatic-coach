'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ChatMessage, PacingAction } from '@/lib/types';

interface Props {
  messages: ChatMessage[];
  isStreaming: boolean;
  pacingAction: PacingAction;
}

const PACING_LABELS: Record<PacingAction, { label: string; color: string }> = {
  continue: { label: 'Flowing', color: 'bg-emerald-400' },
  slow_down: { label: 'Slowing', color: 'bg-yellow-400' },
  pause: { label: 'Pausing', color: 'bg-orange-400' },
  ask_permission: { label: 'Checking in', color: 'bg-violet-400' },
  grounding: { label: 'Grounding', color: 'bg-sky-400' },
};

export function ChatInterface({ messages, isStreaming, pacingAction }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pacing = PACING_LABELS[pacingAction];

  return (
    <div className="flex flex-col h-full">
      {/* Pacing indicator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-stone-100">
        <div className={`w-2 h-2 rounded-full ${pacing.color} ${pacingAction !== 'continue' ? 'animate-pulse' : ''}`} />
        <span className="text-xs text-stone-500">{pacing.label}</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-sage-600 text-white rounded-br-sm'
                    : 'bg-white border border-stone-200 text-stone-800 rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.content || (msg.isStreaming ? <TypingDots /> : null)}
                {msg.isStreaming && msg.content && (
                  <span className="inline-block w-1 h-4 bg-current ml-0.5 animate-pulse align-middle" />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isStreaming && messages.at(-1)?.role !== 'assistant' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="bg-white border border-stone-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <TypingDots />
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center h-4">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}
