import { useCallback, useEffect, useRef } from "react";

type SoundName = "correct" | "error" | "backspace" | "complete";

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

type AudioChain = {
  context: AudioContext;
  input: GainNode;
};

type KeySampleOptions = {
  duration: number;
  gain: number;
  offset: number;
  playbackRate: number;
};

const KEYBOARD_SOUND_URL =
  "/audio/mechanical-keyboard-typing.mp3?v=dsg-423648-natural";
const MIN_GAIN = 0.0001;
const MASTER_GAIN = 1.08;

const KEY_HIT_OFFSETS = [
  0.085, 0.238, 0.338, 0.447, 0.6, 0.719, 0.781, 0.854, 0.938, 1.022,
  1.125, 1.257, 1.376, 1.46, 1.785, 1.92, 2.018, 2.132, 2.221
];

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function chooseOffset(previousOffset: number) {
  let offset =
    KEY_HIT_OFFSETS[Math.floor(Math.random() * KEY_HIT_OFFSETS.length)];

  if (Math.abs(offset - previousOffset) < 0.09) {
    offset =
      KEY_HIT_OFFSETS[Math.floor(Math.random() * KEY_HIT_OFFSETS.length)];
  }

  return offset;
}

function shapeEnvelope(
  gain: AudioParam,
  now: number,
  peakGain: number,
  duration: number,
  release = 0.045
) {
  const releaseStart = Math.max(now + 0.012, now + duration - release);

  gain.setValueAtTime(MIN_GAIN, now);
  gain.exponentialRampToValueAtTime(peakGain, now + 0.0015);
  gain.setValueAtTime(peakGain, releaseStart);
  gain.exponentialRampToValueAtTime(MIN_GAIN, now + duration);
}

export function useTypingSounds(enabled: boolean) {
  const contextRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<AudioChain | null>(null);
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

    const context = new AudioContextCtor();
    const input = context.createGain();
    const output = context.createGain();

    input.gain.setValueAtTime(1, context.currentTime);
    output.gain.setValueAtTime(MASTER_GAIN, context.currentTime);

    input.connect(output);
    output.connect(context.destination);

    contextRef.current = context;
    chainRef.current = { context, input };

    return context;
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

    keyboardBufferPromiseRef.current = fetch(KEYBOARD_SOUND_URL)
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

  const prepareChain = useCallback(() => {
    const context = getContext();
    const chain = chainRef.current;

    if (!context || !chain) {
      return null;
    }

    if (context.state === "suspended") {
      void context.resume();
    }

    return chain;
  }, [getContext]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void loadKeyboardBuffer();
  }, [enabled, loadKeyboardBuffer]);

  const playKeySample = useCallback(
    ({
      duration,
      gain,
      offset,
      playbackRate
    }: KeySampleOptions) => {
      const chain = prepareChain();
      const keyboardBuffer = keyboardBufferRef.current;

      if (!chain) {
        return;
      }

      if (!keyboardBuffer) {
        void loadKeyboardBuffer();
        return;
      }

      const { context, input } = chain;
      const now = context.currentTime;
      const source = context.createBufferSource();
      const envelope = context.createGain();
      const sampleDuration = Math.min(
        duration,
        Math.max(0.04, keyboardBuffer.duration - offset - 0.012)
      );
      const audibleDuration = sampleDuration / playbackRate;

      source.buffer = keyboardBuffer;
      source.playbackRate.setValueAtTime(playbackRate, now);
      shapeEnvelope(envelope.gain, now, gain, audibleDuration);

      source.connect(envelope);
      envelope.connect(input);
      source.start(now, offset, sampleDuration);
      source.stop(now + audibleDuration + 0.012);
    },
    [loadKeyboardBuffer, prepareChain]
  );

  const playMechanicalKey = useCallback(
    (kind: "correct" | "error" | "backspace") => {
      const offset = chooseOffset(lastOffsetRef.current);
      lastOffsetRef.current = offset;

      if (kind === "error") {
        playKeySample({
          duration: 0.24,
          gain: 0.72,
          offset,
          playbackRate: randomBetween(0.9, 0.95)
        });
        return;
      }

      if (kind === "backspace") {
        playKeySample({
          duration: 0.22,
          gain: 0.66,
          offset,
          playbackRate: randomBetween(0.94, 0.98)
        });
        return;
      }

      playKeySample({
        duration: 0.21,
        gain: 0.72,
        offset,
        playbackRate: randomBetween(0.98, 1.04)
      });
    },
    [playKeySample]
  );

  const playTone = useCallback(
    (frequency: number, duration: number, gain: number) => {
      const chain = prepareChain();

      if (!chain) {
        return;
      }

      const { context, input } = chain;
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      envelope.gain.setValueAtTime(MIN_GAIN, now);
      envelope.gain.exponentialRampToValueAtTime(gain, now + 0.006);
      envelope.gain.exponentialRampToValueAtTime(MIN_GAIN, now + duration);

      oscillator.connect(envelope);
      envelope.connect(input);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
    },
    [prepareChain]
  );

  return useCallback(
    (sound: SoundName) => {
      if (!enabled) {
        return;
      }

      if (sound === "correct") {
        playMechanicalKey("correct");
      }

      if (sound === "error") {
        playMechanicalKey("error");
      }

      if (sound === "backspace") {
        playMechanicalKey("backspace");
      }

      if (sound === "complete") {
        playTone(520, 0.08, 0.052);
        window.setTimeout(() => playTone(720, 0.09, 0.048), 80);
        window.setTimeout(() => playTone(920, 0.1, 0.044), 160);
      }
    },
    [enabled, playMechanicalKey, playTone]
  );
}
