'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Mic, Database, Heart, ChevronRight, ChevronLeft, Check } from 'lucide-react';
import type { ConsentRecord } from '@/lib/types';

interface Props {
  onComplete: (consent: ConsentRecord) => void;
}

type Step = 'welcome' | 'camera' | 'audio' | 'data' | 'confirm';
const STEPS: Step[] = ['welcome', 'camera', 'audio', 'data', 'confirm'];

export function ConsentFlow({ onComplete }: Props) {
  const [step, setStep] = useState<Step>('welcome');
  const [consent, setConsent] = useState<ConsentRecord>({
    camera_consent: false,
    audio_consent: false,
    data_storage_consent: false,
    coaching_consent: true,
  });

  const idx = STEPS.indexOf(step);
  const next = () => STEPS[idx + 1] && setStep(STEPS[idx + 1]);
  const back = () => STEPS[idx - 1] && setStep(STEPS[idx - 1]);

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i <= idx ? 'bg-sage-600 w-8' : 'bg-stone-300 w-4'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8"
          >
            {step === 'welcome' && (
              <StepWelcome onNext={next} />
            )}
            {step === 'camera' && (
              <StepCamera
                value={consent.camera_consent}
                onChange={v => setConsent(c => ({ ...c, camera_consent: v }))}
                onNext={next}
                onBack={back}
              />
            )}
            {step === 'audio' && (
              <StepAudio
                value={consent.audio_consent}
                onChange={v => setConsent(c => ({ ...c, audio_consent: v }))}
                onNext={next}
                onBack={back}
              />
            )}
            {step === 'data' && (
              <StepData
                value={consent.data_storage_consent}
                onChange={v => setConsent(c => ({ ...c, data_storage_consent: v }))}
                onNext={next}
                onBack={back}
              />
            )}
            {step === 'confirm' && (
              <StepConfirm consent={consent} onStart={() => onComplete(consent)} onBack={back} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 bg-sage-100 rounded-full flex items-center justify-center mx-auto">
        <Heart className="w-8 h-8 text-sage-600" />
      </div>
      <div>
        <h1 className="text-2xl font-semibold text-stone-800 mb-3">Welcome</h1>
        <p className="text-stone-600 leading-relaxed">
          This is a private space for psychosomatic coaching — a practice that supports awareness of
          the connection between your body, breath, and inner experience.
        </p>
      </div>
      <div className="bg-stone-50 rounded-xl p-4 text-left space-y-2">
        <p className="text-sm font-medium text-stone-700">What to expect:</p>
        <ul className="text-sm text-stone-600 space-y-1">
          <li>• Gentle, paced exercises and reflections</li>
          <li>• You control the pace — stop anytime</li>
          <li>• No diagnosis, no pressure, no judgment</li>
          <li>• Everything happens with your consent</li>
        </ul>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
        This is a coaching tool, not a medical or therapeutic service. If you are in crisis,
        please contact a mental health professional.
      </div>
      <Button onClick={onNext}>
        Begin <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  );
}

function StepCamera({
  value, onChange, onNext, onBack,
}: { value: boolean; onChange: (v: boolean) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center">
        <Camera className="w-6 h-6 text-blue-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-2">Optional camera</h2>
        <p className="text-stone-600 leading-relaxed text-sm">
          With your camera on, the AI can observe non-diagnostic signals — visible breathing changes,
          facial expression shifts, and engagement level — to adapt pacing in real time.
        </p>
      </div>
      <div className="bg-stone-50 rounded-xl p-4 space-y-2 text-sm text-stone-600">
        <p className="font-medium text-stone-700">Privacy guarantees:</p>
        <ul className="space-y-1">
          <li>✓ Analysis runs entirely in your browser</li>
          <li>✓ No video is ever sent to the server</li>
          <li>✓ Only numbers (e.g. tension: 0.2) are transmitted</li>
          <li>✓ You can turn the camera off at any time</li>
        </ul>
      </div>
      <ConsentToggle
        label="Enable optional camera"
        value={value}
        onChange={onChange}
      />
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepAudio({
  value, onChange, onNext, onBack,
}: { value: boolean; onChange: (v: boolean) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="w-12 h-12 bg-violet-50 rounded-full flex items-center justify-center">
        <Mic className="w-6 h-6 text-violet-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-2">Voice input</h2>
        <p className="text-stone-600 leading-relaxed text-sm">
          You can speak your responses instead of typing. Voice processing happens in your browser
          (Web Speech API). You can always type instead.
        </p>
      </div>
      <ConsentToggle
        label="Enable voice input & read-aloud responses"
        value={value}
        onChange={onChange}
      />
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepData({
  value, onChange, onNext, onBack,
}: { value: boolean; onChange: (v: boolean) => void; onNext: () => void; onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center">
        <Database className="w-6 h-6 text-emerald-600" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-2">Session data</h2>
        <p className="text-stone-600 leading-relaxed text-sm">
          Your conversation is held in memory during the session. If you consent below, the session
          transcript may be stored to improve the coaching experience.
        </p>
      </div>
      <div className="bg-stone-50 rounded-xl p-4 text-sm text-stone-600">
        <p className="font-medium text-stone-700 mb-2">What is never stored:</p>
        <ul className="space-y-1">
          <li>✓ Raw video or images</li>
          <li>✓ Sensitive biometric data</li>
          <li>✓ Personal identifying information</li>
        </ul>
      </div>
      <ConsentToggle
        label="Allow session transcript storage"
        value={value}
        onChange={onChange}
      />
      <Nav onBack={onBack} onNext={onNext} />
    </div>
  );
}

function StepConfirm({
  consent, onStart, onBack,
}: { consent: ConsentRecord; onStart: () => void; onBack: () => void }) {
  const items = [
    { label: 'Camera analysis', value: consent.camera_consent },
    { label: 'Voice input', value: consent.audio_consent },
    { label: 'Session storage', value: consent.data_storage_consent },
    { label: 'Coaching session', value: consent.coaching_consent },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-stone-800 mb-2">Ready to begin</h2>
        <p className="text-stone-500 text-sm">Your preferences:</p>
      </div>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.label} className="flex items-center justify-between py-2 border-b border-stone-100">
            <span className="text-sm text-stone-700">{item.label}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              item.value ? 'bg-sage-100 text-sage-700' : 'bg-stone-100 text-stone-500'
            }`}>
              {item.value ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-stone-400">
        You can change any of these during the session.
      </p>
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1 px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        <button
          onClick={onStart}
          className="flex-1 flex items-center justify-center gap-2 bg-sage-600 hover:bg-sage-700 text-white font-medium py-3 rounded-xl transition-colors"
        >
          <Check className="w-4 h-4" /> Start session
        </button>
      </div>
    </div>
  );
}

function ConsentToggle({
  label, value, onChange,
}: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
        value ? 'border-sage-400 bg-sage-50' : 'border-stone-200 bg-white'
      }`}
    >
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <div className={`w-10 h-6 rounded-full transition-colors relative ${value ? 'bg-sage-500' : 'bg-stone-300'}`}>
        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'left-5' : 'left-1'}`} />
      </div>
    </button>
  );
}

function Button({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center bg-sage-600 hover:bg-sage-700 text-white font-medium py-3 rounded-xl transition-colors"
    >
      {children}
    </button>
  );
}

function Nav({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="flex gap-3">
      <button
        onClick={onBack}
        className="flex items-center gap-1 px-4 py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>
      <button
        onClick={onNext}
        className="flex-1 flex items-center justify-center gap-1 bg-sage-600 hover:bg-sage-700 text-white font-medium py-3 rounded-xl transition-colors"
      >
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
