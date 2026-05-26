'use client';

import { type RefObject } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Proxied through our backend so the browser never hits the auth-gated D-ID CDN directly
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const FIONA_THUMBNAIL = `${API_URL}/api/avatar/thumbnail`;
// Generic fallback if even the proxy fails
const FIONA_FALLBACK =
  'https://ui-avatars.com/api/?name=Fiona&background=a3b899&color=fff&size=300&rounded=true&bold=true';

interface AvatarDisplayProps {
  videoRef: RefObject<HTMLVideoElement>;
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  /** Show a smaller card with no name tag (for the mobile top-strip) */
  compact?: boolean;
}

export function AvatarDisplay({
  videoRef,
  isConnected,
  isConnecting,
  isSpeaking,
  compact = false,
}: AvatarDisplayProps) {
  const width  = compact ? 68 : 220;
  const height = compact ? 84 : 270;

  return (
    <div className={`relative flex flex-col items-center ${compact ? 'gap-0' : 'gap-2'}`}>
      {/* ── Avatar frame ─────────────────────────────────────────────── */}
      <div
        className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-500 flex-shrink-0 ${
          isSpeaking
            ? 'border-sage-400 shadow-lg shadow-sage-100/60'
            : isConnected
            ? 'border-stone-200 shadow-sm'
            : 'border-stone-100'
        }`}
        style={{ width, height }}
      >
        {/* Thumbnail — always rendered underneath (fallback + fast initial load) */}
        <img
          src={FIONA_THUMBNAIL}
          alt="Fiona"
          onError={e => { (e.target as HTMLImageElement).src = FIONA_FALLBACK; }}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />

        {/* Live WebRTC video — fades in once connected */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
            isConnected ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* Soft speaking glow */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              key="glow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 80%, rgba(134,169,137,0.35) 0%, transparent 65%)',
              }}
            />
          )}
        </AnimatePresence>

        {/* Connecting badge */}
        <AnimatePresence>
          {isConnecting && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-stone-900/25 flex items-end justify-center pb-3"
            >
              <span className="bg-white/90 rounded-lg px-2 py-1 text-[10px] text-stone-600 font-medium">
                Connecting…
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Name tag (desktop only) ──────────────────────────────────── */}
      {!compact && (
        <div className="text-center">
          <p className="text-sm font-semibold text-stone-700 leading-tight">Fiona</p>
          <p className="text-xs text-stone-400 leading-tight">Psychosomatic Coach</p>
        </div>
      )}

      {/* ── Animated voice bars ──────────────────────────────────────── */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            key="bars"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="flex items-end gap-[3px]"
            style={{ height: 14 }}
          >
            {[0, 1, 2, 3, 2].map((delay, i) => (
              <motion.div
                key={i}
                className="w-[3px] rounded-full bg-sage-500"
                animate={{ height: [4, 14, 4] }}
                transition={{
                  duration: 0.75,
                  repeat: Infinity,
                  delay: delay * 0.12,
                  ease: 'easeInOut',
                }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
