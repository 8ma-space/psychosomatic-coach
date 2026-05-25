'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Heart, Leaf, Shield, ChevronRight } from 'lucide-react';

export default function LandingPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gradient-to-b from-stone-50 to-sage-50 flex flex-col">
      {/* Header */}
      <nav className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <Leaf className="w-5 h-5 text-sage-600" />
          <span className="font-medium text-stone-700">Psychosomatic Coach</span>
        </div>
      </nav>

      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 text-center py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl space-y-6"
        >
          <div className="w-20 h-20 bg-sage-100 rounded-full flex items-center justify-center mx-auto">
            <Heart className="w-10 h-10 text-sage-600" />
          </div>

          <h1 className="text-4xl font-light text-stone-800 leading-tight">
            A space for body-mind
            <br />
            <span className="font-semibold text-sage-700">awareness</span>
          </h1>

          <p className="text-lg text-stone-500 leading-relaxed max-w-lg mx-auto">
            AI-guided psychosomatic coaching that adapts to you — pacing each step with your
            consent, supporting your nervous system, never pushing.
          </p>

          {/* Feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8 text-left">
            {[
              {
                icon: Shield,
                title: 'Safety first',
                desc: 'You control the pace. Stop anytime, no explanation needed.',
              },
              {
                icon: Heart,
                title: 'Consent-driven',
                desc: 'Every step is offered, not imposed. Camera and voice are optional.',
              },
              {
                icon: Leaf,
                title: 'Adaptive',
                desc: 'The AI responds to visible signals of readiness and overload.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="bg-white border border-stone-200 rounded-xl p-4 space-y-2"
              >
                <div className="w-8 h-8 bg-sage-50 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-sage-600" />
                </div>
                <p className="font-medium text-stone-800 text-sm">{title}</p>
                <p className="text-xs text-stone-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3 pt-4">
            <button
              onClick={() => router.push('/session')}
              className="inline-flex items-center gap-2 bg-sage-600 hover:bg-sage-700 text-white font-medium px-8 py-4 rounded-2xl transition-colors text-lg"
            >
              Begin a session
              <ChevronRight className="w-5 h-5" />
            </button>
            <p className="text-xs text-stone-400">
              Not a medical service · No diagnosis · No data sold
            </p>
          </div>
        </motion.div>
      </div>
    </main>
  );
}
