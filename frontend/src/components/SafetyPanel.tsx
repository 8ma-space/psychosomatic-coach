'use client';

import { useState } from 'react';
import { X, Pause, Wind, AlertCircle, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PacingAction } from '@/lib/types';

interface Props {
  pacingAction: PacingAction;
  onEndSession: () => void;
  onSendGrounding: () => void;
}

const GROUNDING_STEPS = [
  'Notice 5 things you can see around you.',
  'Notice 4 things you can physically feel — your chair, your feet on the floor.',
  'Notice 3 things you can hear right now.',
  'Take a slow breath in through your nose for 4 counts.',
  'Hold gently for 2 counts, then exhale slowly for 6.',
];

export function SafetyPanel({ pacingAction, onEndSession, onSendGrounding }: Props) {
  const [showGrounding, setShowGrounding] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const isElevated = pacingAction !== 'continue';

  return (
    <>
      <div className={`flex items-center justify-between px-4 py-2 border-b transition-colors ${
        isElevated ? 'bg-amber-50 border-amber-200' : 'bg-white border-stone-100'
      }`}>
        <div className="flex items-center gap-3">
          {isElevated && (
            <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0" />
          )}
          <span className="text-xs text-stone-500">
            {isElevated ? 'Pacing adapted — you can stop or slow down anytime' : 'You can stop at any moment'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGrounding(v => !v)}
            className="flex items-center gap-1 text-xs text-stone-500 hover:text-sage-700 px-2 py-1 rounded-lg hover:bg-stone-100 transition-colors"
          >
            <Wind className="w-3.5 h-3.5" />
            Ground
            <ChevronDown className={`w-3 h-3 transition-transform ${showGrounding ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={() => setShowEndConfirm(true)}
            className="flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            End session
          </button>
        </div>
      </div>

      {/* Grounding drawer */}
      <AnimatePresence>
        {showGrounding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-sky-50 border-b border-sky-100"
          >
            <div className="px-4 py-3 space-y-2">
              <p className="text-xs font-medium text-sky-800">Quick grounding — 5-4-3-2-1</p>
              <ol className="space-y-1">
                {GROUNDING_STEPS.map((step, i) => (
                  <li key={i} className="text-xs text-sky-700 flex gap-2">
                    <span className="font-medium w-4 flex-shrink-0">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ol>
              <button
                onClick={() => { onSendGrounding(); setShowGrounding(false); }}
                className="text-xs text-sky-700 underline hover:text-sky-900"
              >
                Ask coach for a grounding exercise
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End session confirm */}
      <AnimatePresence>
        {showEndConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
            onClick={() => setShowEndConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full space-y-4"
            >
              <h3 className="font-semibold text-stone-800">End this session?</h3>
              <p className="text-sm text-stone-600">
                You can always return. Take a moment to notice how you feel before you close.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndConfirm(false)}
                  className="flex-1 py-2 rounded-xl border border-stone-200 text-stone-600 text-sm hover:bg-stone-50 transition-colors"
                >
                  Stay
                </button>
                <button
                  onClick={onEndSession}
                  className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium transition-colors"
                >
                  End session
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
