import { useCallback, useEffect, useRef } from "react";

type SoundName = "correct" | "error" | "backspace" | "complete";

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

export function useTypingSounds(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const keyboardBufferRef = useRef<AudioBuffer | null>(null);
  const keyboardBufferPromiseRef = useRef<Promise<AudioBuffer | null> | null>(
    null
  );
  const lastOffsetRef = useRef(0);

  const getContext = useCallback(() => {
    if (!enabled) {
      return null;
    }

    if (contextRef.current) {
      return contextRef.current;
    }

    const audioWindow = window as AudioWindow;
    const AudioContextCtor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;

    if (!AudioContextCtor) {
      return null;
    }

    contextRef.current = new AudioContextCtor();
    return contextRef.current;
  }, [enabled]);

  const loadKeyboardBuffer = useCallback(() => {
    const context = getContext();

    if (!context) {
      return Promise.resolve(null);
    }

    if (keyboardBufferRef.current) {
      return Promise.resolve(keyboardBufferRef.current);
    }

    if (keyboardBufferPromiseRef.current) {
      return keyboardBufferPromiseRef.current;
    }

    keyboardBufferPromiseRef.current = fetch(
      "/audio/mechanical-keyboard-typing.mp3"
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error("Keyboard sound could not be loaded.");
        }

        return response.arrayBuffer();
      })
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        keyboardBufferRef.current = audioBuffer;
        return audioBuffer;
      })
      .catch(() => {
        keyboardBufferPromiseRef.current = null;
        return null;
      });

    return keyboardBufferPromiseRef.current;
  }, [getContext]);

  const prepareContext = useCallback(() => {
    const context = getContext();

    if (!context) {
      return null;
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    return context;
  }, [getContext]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void loadKeyboardBuffer();
  }, [enabled, loadKeyboardBuffer]);

  const playMechanicalKey = useCallback(
    ({
      duration,
      gain,
      playbackRate,
      filterFrequency
    }: {
      duration: number;
      gain: number;
      playbackRate: number;
      filterFrequency: number;
    }) => {
      const context = prepareContext();
      const keyboardBuffer = keyboardBufferRef.current;

      if (!context) {
        return;
      }

      if (!keyboardBuffer) {
        void loadKeyboardBuffer();
        return;
      }

      const now = context.currentTime;
      const source = context.createBufferSource();
      const highPass = context.createBiquadFilter();
      const filter = context.createBiquadFilter();
      const envelope = context.createGain();
      const compressor = context.createDynamicsCompressor();
      const playableDuration = Math.max(0.2, keyboardBuffer.duration - duration);
      let offset = Math.random() * playableDuration;

      if (Math.abs(offset - lastOffsetRef.current) < 0.18) {
        offset = (offset + 0.31) % playableDuration;
      }

      lastOffsetRef.current = offset;
      source.buffer = keyboardBuffer;
      source.playbackRate.setValueAtTime(playbackRate, now);
      highPass.type = "highpass";
      highPass.frequency.setValueAtTime(110, now);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(filterFrequency, now);
      filter.Q.setValueAtTime(0.7, now);
      compressor.threshold.setValueAtTime(-10, now);
      compressor.knee.setValueAtTime(10, now);
      compressor.ratio.setValueAtTime(4, now);
      compressor.attack.setValueAtTime(0.002, now);
      compressor.release.setValueAtTime(0.08, now);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      source.connect(highPass);
      highPass.connect(filter);
      filter.connect(envelope);
      envelope.connect(compressor);
      compressor.connect(context.destination);
      source.start(now, offset, duration);
      source.stop(now + duration + 0.01);
    },
    [loadKeyboardBuffer, prepareContext]
  );

  const playTone = useCallback(
    (frequency: number, duration: number, gain: number, type: OscillatorType) => {
      const context = prepareContext();

      if (!context) {
        return;
      }

      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();

      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, now);
      oscillator.detune.setValueAtTime((Math.random() - 0.5) * 18, now);
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      oscillator.connect(envelope);
      envelope.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.015);
    },
    [prepareContext]
  );

  return useCallback(
    (sound: SoundName) => {
      if (!enabled) {
        return;
      }

      if (sound === "correct") {
        playMechanicalKey({
          duration: 0.088,
          gain: 0.68,
          playbackRate: 0.96 + Math.random() * 0.1,
          filterFrequency: 6_500 + Math.random() * 1_400
        });
      }

      if (sound === "error") {
        playMechanicalKey({
          duration: 0.11,
          gain: 0.76,
          playbackRate: 0.72 + Math.random() * 0.08,
          filterFrequency: 2_500
        });
      }

      if (sound === "backspace") {
        playMechanicalKey({
          duration: 0.096,
          gain: 0.7,
          playbackRate: 0.84 + Math.random() * 0.06,
          filterFrequency: 4_200
        });
      }

      if (sound === "complete") {
        playTone(520, 0.08, 0.048, "sine");
        window.setTimeout(() => playTone(720, 0.09, 0.044, "sine"), 80);
        window.setTimeout(() => playTone(920, 0.1, 0.038, "sine"), 160);
      }
    },
    [enabled, playMechanicalKey, playTone]
  );
}
