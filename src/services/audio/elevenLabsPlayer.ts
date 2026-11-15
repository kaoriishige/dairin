import { splitIntoSpeechChunks } from './speechTextNormalizer';

export type MouthVowelShape = 'closed' | 'a' | 'i' | 'u' | 'e' | 'o';

export interface TtsPlaybackCallbacks {
  onStart?: () => void;
  onAudioLevel?: (level: number, vowel?: MouthVowelShape) => void;
  onEnd?: () => void;
  onFallbackToText?: (reason: string) => void;
}

/**
 * FFT周波数ビン（0〜ナイキスト周波数）から日本語母音（あ・い・う・え・お）を推定する。
 * sampleRate=44100, fftSize=256 の場合、1ビンあたり約 172Hz。
 * - 低域 (bin 1..2: ~170-510Hz)
 * - 第1フォルマント F1帯 (bin 3..5: ~510-1030Hz) -> 口の開き具合 (あ・お で強い)
 * - 第2フォルマント F2中帯 (bin 6..10: ~1030-1890Hz) -> え・あ
 * - 第2フォルマント F2高帯 (bin 11..18: ~1890-3100Hz) -> い で顕著に強い
 */
export function estimateVowelFromSpectrum(dataArray: Uint8Array): {
  level: number;
  vowel: MouthVowelShape;
} {
  let sumAll = 0;
  for (let i = 1; i < 24 && i < dataArray.length; i++) {
    sumAll += dataArray[i];
  }
  const avg = sumAll / 23;
  const level = Math.min(1, avg / 85);

  // 無音・子音間・息継ぎ時は即座に口を閉じる
  if (level < 0.08) {
    return { level: 0, vowel: 'closed' };
  }

  const lowBand = ((dataArray[1] || 0) + (dataArray[2] || 0)) / 2;
  const f1Band = ((dataArray[3] || 0) + (dataArray[4] || 0) + (dataArray[5] || 0)) / 3;
  const f2MidBand =
    ((dataArray[6] || 0) + (dataArray[7] || 0) + (dataArray[8] || 0) + (dataArray[9] || 0)) / 4;
  const f2HighBand =
    ((dataArray[10] || 0) +
      (dataArray[11] || 0) +
      (dataArray[12] || 0) +
      (dataArray[13] || 0) +
      (dataArray[14] || 0)) /
    5;

  // 母音分類
  if (level > 0.42 && f1Band >= lowBand * 0.85 && f1Band >= f2HighBand * 1.15) {
    return { level, vowel: 'a' };
  }
  if (f2HighBand > f1Band * 0.72 && level > 0.14) {
    return { level, vowel: 'i' };
  }
  if (f2MidBand > f1Band * 0.78 && level > 0.22) {
    return { level, vowel: 'e' };
  }
  if (lowBand > f1Band * 1.15 && f2HighBand < lowBand * 0.55) {
    return { level, vowel: 'u' };
  }
  if (level > 0.25) {
    return { level, vowel: 'o' };
  }
  return { level, vowel: 'u' };
}

export class ElevenLabsStreamingPlayer {
  private abortController: AbortController | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private rafId: number | null = null;
  private volume = 0.9;
  private isPlayingFlag = false;
  private playbackToken = 0;

  public setVolume(vol: number) {
    this.volume = Math.min(1, Math.max(0, vol));
    if (this.currentAudio) {
      this.currentAudio.volume = this.volume;
    }
  }

  public getVolume(): number {
    return this.volume;
  }

  public isPlaying(): boolean {
    return this.isPlayingFlag;
  }

  public stop() {
    this.playbackToken += 1;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.currentAudio) {
      this.currentAudio.pause();
      if (this.currentAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentAudio.src);
      }
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.isPlayingFlag = false;
  }

  private monitorAudioLevel(
    audioEl: HTMLAudioElement,
    onLevel?: (lvl: number, vowel?: MouthVowelShape) => void
  ) {
    if (!onLevel) return;
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }

      const source = this.audioCtx.createMediaElementSource(audioEl);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.isPlayingFlag || this.currentAudio !== audioEl) {
          onLevel(0, 'closed');
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        const { level, vowel } = estimateVowelFromSpectrum(dataArray);
        onLevel(level, vowel);
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    } catch {
      onLevel(0.45, 'a');
    }
  }

  public async playStaticAudioUrl(
    url: string,
    callbacks: TtsPlaybackCallbacks = {}
  ): Promise<boolean> {
    this.stop();
    const myToken = this.playbackToken;
    this.isPlayingFlag = true;
    callbacks.onStart?.();

    try {
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        audio.volume = this.volume;
        this.currentAudio = audio;

        audio.onended = () => {
          if (this.currentAudio === audio) this.currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          if (this.currentAudio === audio) this.currentAudio = null;
          reject(new Error('サンプル音声の再生に失敗しました。'));
        };

        this.monitorAudioLevel(audio, callbacks.onAudioLevel);
        audio.play().catch(reject);
      });

      if (myToken === this.playbackToken) {
        this.isPlayingFlag = false;
        callbacks.onAudioLevel?.(0, 'closed');
        callbacks.onEnd?.();
      }
      return true;
    } catch (err) {
      this.stop();
      callbacks.onAudioLevel?.(0, 'closed');
      callbacks.onFallbackToText?.(
        err instanceof Error ? err.message : 'サンプル音声の再生中にエラーが発生しました。'
      );
      callbacks.onEnd?.();
      return false;
    }
  }

  public async speak(
    text: string,
    passcode: string,
    callbacks: TtsPlaybackCallbacks = {}
  ): Promise<boolean> {
    this.stop();
    const myToken = this.playbackToken;
    const chunks = splitIntoSpeechChunks(text, 95);
    if (chunks.length === 0) {
      callbacks.onEnd?.();
      return false;
    }

    this.abortController = new AbortController();
    this.isPlayingFlag = true;
    callbacks.onStart?.();

    try {
      for (const chunk of chunks) {
        if (myToken !== this.playbackToken) return false;

        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(passcode ? { 'x-demo-passcode': passcode } : {}),
          },
          body: JSON.stringify({ text: chunk }),
          signal: this.abortController.signal,
        });

        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          const reason =
            errData.error || '音声合成が利用できないため、文字チャットで継続します。';
          this.stop();
          callbacks.onFallbackToText?.(reason);
          callbacks.onEnd?.();
          return false;
        }

        const blob = await res.blob();
        if (myToken !== this.playbackToken) return false;

        const objectUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(objectUrl);
          audio.volume = this.volume;
          this.currentAudio = audio;

          audio.onended = () => {
            URL.revokeObjectURL(objectUrl);
            if (this.currentAudio === audio) this.currentAudio = null;
            callbacks.onAudioLevel?.(0, 'closed');
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            if (this.currentAudio === audio) this.currentAudio = null;
            reject(new Error('音声の再生に失敗しました。'));
          };

          this.monitorAudioLevel(audio, callbacks.onAudioLevel);
          audio.play().catch(reject);
        });
      }

      if (myToken === this.playbackToken) {
        this.isPlayingFlag = false;
        callbacks.onAudioLevel?.(0, 'closed');
        callbacks.onEnd?.();
      }
      return true;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        callbacks.onAudioLevel?.(0, 'closed');
        return false;
      }
      this.stop();
      callbacks.onAudioLevel?.(0, 'closed');
      callbacks.onFallbackToText?.(
        err instanceof Error ? err.message : '音声再生中にエラーが発生しました。'
      );
      callbacks.onEnd?.();
      return false;
    }
  }
}
