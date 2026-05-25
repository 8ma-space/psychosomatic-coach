'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { VisionSignals } from '@/lib/types';

interface UseCameraOptions {
  enabled: boolean;
  onSignals?: (signals: VisionSignals) => void;
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
}

export function useCamera({ enabled, onSignals }: UseCameraOptions) {
  const [hasPermission, setHasPermission] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<unknown>(null);
  const poseLandmarkerRef = useRef<unknown>(null);
  const shoulderHistoryRef = useRef<number[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const requestPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setHasPermission(true);
      setError(null);
      return stream;
    } catch {
      setError('Camera access denied');
      return null;
    }
  }, []);

  const initMediaPipe = useCallback(async () => {
    try {
      const { FaceLandmarker, PoseLandmarker, FilesetResolver } = await import(
        '@mediapipe/tasks-vision'
      );

      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
      );

      const [face, pose] = await Promise.all([
        FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        }),
        PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numPoses: 1,
        }),
      ]);

      faceLandmarkerRef.current = face;
      poseLandmarkerRef.current = pose;
      return true;
    } catch (err) {
      console.warn('MediaPipe init failed, vision disabled:', err);
      return false;
    }
  }, []);

  const analyzeFrame = useCallback((video: HTMLVideoElement): VisionSignals => {
    const now = performance.now();
    let tension_level = 0;
    let expression_change = 0;
    let engagement = 0.8;
    let posture_change = 0;
    let breathing_change = 0;

    // Face analysis
    if (faceLandmarkerRef.current && video.readyState >= 2) {
      try {
        const fl = faceLandmarkerRef.current as {
          detectForVideo: (v: HTMLVideoElement, t: number) => {
            faceLandmarks?: unknown[][];
            faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
          };
        };
        const result = fl.detectForVideo(video, now);

        if ((result.faceLandmarks?.length ?? 0) > 0) {
          engagement = 0.9;
          const bs = result.faceBlendshapes?.[0]?.categories ?? [];
          const score = (name: string) => bs.find(b => b.categoryName === name)?.score ?? 0;
          const browDown = score('browDownLeft');
          const mouthFrown = score('mouthFrownLeft');
          tension_level = clamp(browDown * 0.5 + mouthFrown * 0.4);
          expression_change = clamp((browDown + mouthFrown) * 0.5);
        } else {
          engagement = 0.3;
        }
      } catch { /* ignore per-frame errors */ }
    }

    // Pose analysis (breathing + posture)
    if (poseLandmarkerRef.current && video.readyState >= 2) {
      try {
        const pl = poseLandmarkerRef.current as {
          detectForVideo: (v: HTMLVideoElement, t: number) => {
            landmarks?: { x: number; y: number; z: number }[][];
          };
        };
        const result = pl.detectForVideo(video, now);
        const lm = result.landmarks?.[0];

        if (lm) {
          const lShoulder = lm[11];
          const rShoulder = lm[12];

          if (lShoulder && rShoulder) {
            const shoulderY = (lShoulder.y + rShoulder.y) / 2;
            const elevation = 1 - shoulderY;
            if (elevation > 0.4) tension_level = clamp(tension_level + (elevation - 0.4) * 1.5);

            shoulderHistoryRef.current.push(shoulderY);
            if (shoulderHistoryRef.current.length > 30) shoulderHistoryRef.current.shift();

            if (shoulderHistoryRef.current.length >= 10) {
              const v = variance(shoulderHistoryRef.current);
              breathing_change = clamp((v - 0.0002) / 0.002);
            }

            const nose = lm[0];
            if (nose) {
              const cx = (lShoulder.x + rShoulder.x) / 2;
              posture_change = clamp(Math.abs(nose.x - cx) * 3);
            }
          }
        }
      } catch { /* ignore per-frame errors */ }
    }

    return {
      breathing_change: clamp(breathing_change),
      tension_level: clamp(tension_level),
      engagement: clamp(engagement),
      expression_change: clamp(expression_change),
      posture_change: clamp(posture_change),
    };
  }, []);

  const startAnalysis = useCallback(
    async (videoElement: HTMLVideoElement) => {
      videoRef.current = videoElement;
      const ok = await initMediaPipe();
      setIsAnalyzing(ok);

      if (!ok || !onSignals) return;

      intervalRef.current = setInterval(() => {
        if (videoRef.current && onSignals) {
          onSignals(analyzeFrame(videoRef.current));
        }
      }, 2000);
    },
    [initMediaPipe, analyzeFrame, onSignals]
  );

  const stopAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsAnalyzing(false);
  }, []);

  const stopCamera = useCallback(() => {
    stopAnalysis();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setHasPermission(false);
  }, [stopAnalysis]);

  useEffect(() => {
    if (!enabled) stopCamera();
  }, [enabled, stopCamera]);

  useEffect(() => () => stopCamera(), [stopCamera]);

  return { hasPermission, isAnalyzing, error, stream: streamRef.current, requestPermission, startAnalysis, stopAnalysis, stopCamera };
}
