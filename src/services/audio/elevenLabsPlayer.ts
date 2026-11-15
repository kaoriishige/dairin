import { splitIntoSpeechChunks } from './speechTextNormalizer';

export type MouthVowelShape = 'closed' | 'a' | 'i' | 'u' | 'e' | 'o';

export type FemaleVoiceChoice = 'fn6Wir86vS59qP6PheHG';

export interface LiveVoiceMetrics {
  level: number;
  openY: number;
  formRow: number;
  vowel: MouthVowelShape;
  isPlaying: boolean;
}

export interface TtsPlaybackCallbacks {
  onStart?: () => void;
  onAudioLevel?: (level: number, vowel?: MouthVowelShape) => void;
  onEnd?: () => void;
  onFallbackToText?: (reason: string) => void;
}

export function estimateVowelFromSpectrum(dataArray: Uint8Array): {
  level: number;
  vowel: MouthVowelShape;
  targetOpenY: number;
  targetFormRow: number;
} {
  let sumAll = 0;
  for (let i = 1; i < 24 && i < dataArray.length; i++) {
    sumAll += dataArray[i];
  }
  const avg = sumAll / 23;
  const rawLevel = Math.min(1, avg / 78);

  if (rawLevel < 0.08) {
    return { level: 0, vowel: 'closed', targetOpenY: 0, targetFormRow: 1.0 };
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

  const f1Norm = Math.min(1, f1Band / 155);
  const continuousOpenY = Math.min(1, Math.max(0.08, rawLevel * 0.65 + f1Norm * 0.5));
  const highToLowRatio = (f2HighBand + f2MidBand * 0.5) / Math.max(15, lowBand * 0.7 + f1Band * 0.3);
  const continuousFormRow = Math.min(2.0, Math.max(0.0, (highToLowRatio - 0.32) * 2.2));

  let vowel: MouthVowelShape = 'u';
  if (rawLevel > 0.42 && f1Band >= lowBand * 0.85 && f1Band >= f2HighBand * 1.15) {
    vowel = 'a';
  } else if (f2HighBand > f1Band * 0.72 && rawLevel > 0.14) {
    vowel = 'i';
  } else if (f2MidBand > f1Band * 0.78 && rawLevel > 0.22) {
    vowel = 'e';
  } else if (lowBand > f1Band * 1.15 && f2HighBand < lowBand * 0.55) {
    vowel = 'u';
  } else if (rawLevel > 0.25) {
    vowel = 'o';
  }

  return {
    level: rawLevel,
    vowel,
    targetOpenY: continuousOpenY,
    targetFormRow: continuousFormRow,
  };
}

export class ElevenLabsStreamingPlayer {
  private abortController: AbortController | null = null;
  private sharedAudio: HTMLAudioElement | null = null;
  private activeObjectUrl: string | null = null;
  private rafId: number | null = null;
  private volume = 0.9;
  private voiceChoice: FemaleVoiceChoice = 'fn6Wir86vS59qP6PheHG';
  private isPlayingFlag = false;
  private playbackToken = 0;

  public setVoiceChoice(choice: FemaleVoiceChoice) {
    this.voiceChoice = choice;
  }

  public getVoiceChoice(): FemaleVoiceChoice {
    return this.voiceChoice;
  }

  private getOrCreateAudioElement(): HTMLAudioElement {
    if (!this.sharedAudio) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.setAttribute('playsinline', '');
      audio.setAttribute('webkit-playsinline', '');
      this.sharedAudio = audio;
    }
    this.sharedAudio.volume = this.volume;
    return this.sharedAudio;
  }

  public unlockAudioForMobile() {
    try {
      const audio = this.getOrCreateAudioElement();
      audio.load();
    } catch {
      // ignore
    }
  }

  public getLiveVoiceMetrics(): LiveVoiceMetrics {
    if (!this.isPlayingFlag) {
      return {
        level: 0,
        openY: 0,
        formRow: 1.0,
        vowel: 'closed',
        isPlaying: false,
      };
    }
    const t = performance.now() / 1000;
    const wave = 0.55 + 0.35 * Math.sin(t * 14.0);
    return {
      level: wave,
      openY: wave,
      formRow: 1.0,
      vowel: 'a',
      isPlaying: true,
    };
  }

  public setVolume(vol: number) {
    this.volume = Math.min(1, Math.max(0, vol));
    if (this.sharedAudio) {
      this.sharedAudio.volume = this.volume;
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
    if (this.sharedAudio) {
      try {
        this.sharedAudio.pause();
        this.sharedAudio.removeAttribute('src');
        this.sharedAudio.load();
      } catch {
        // ignore
      }
    }
    if (this.activeObjectUrl) {
      URL.revokeObjectURL(this.activeObjectUrl);
      this.activeObjectUrl = null;
    }
    this.isPlayingFlag = false;
  }

  private startLevelPulse(onLevel?: (lvl: number, vowel?: MouthVowelShape) => void) {
    if (!onLevel) return;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (!this.isPlayingFlag) {
        onLevel(0, 'closed');
        return;
      }
      if (now - lastUpdate >= 90) {
        lastUpdate = now;
        const lvl = 0.45 + 0.45 * Math.abs(Math.sin(now * 0.012));
        onLevel(lvl, 'a');
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public async playStaticAudioUrl(
    url: string,
    callbacks: TtsPlaybackCallbacks = {}
  ): Promise<boolean> {
    this.stop();
    const myToken = this.playbackToken;
    const audio = this.getOrCreateAudioElement();
    this.isPlayingFlag = true;
    callbacks.onStart?.();

    try {
      await new Promise<void>((resolve, reject) => {
        audio.src = url;
        audio.volume = this.volume;

        audio.onended = () => {
          resolve();
        };
        audio.onerror = () => {
          reject(new Error('音声の再生に失敗しました。'));
        };

        this.startLevelPulse(callbacks.onAudioLevel);
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
        err instanceof Error ? err.message : '音声の再生中にエラーが発生しました。'
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
    this.unlockAudioForMobile();

    const myToken = this.playbackToken;
    const chunks = splitIntoSpeechChunks(text, 220);
    if (chunks.length === 0) {
      callbacks.onEnd?.();
      return false;
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      const chunkBlobPromises = chunks.map(async (chunk) => {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(passcode ? { 'x-demo-passcode': passcode } : {}),
          },
          body: JSON.stringify({ text: chunk, voice: this.voiceChoice }),
          signal,
        });
        if (!res.ok) {
          const errData = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            errData.error || '音声合成が利用できないため、文字チャットで継続します。'
          );
        }
        return res.blob();
      });

      let startedCallbackFired = false;

      for (const blobPromise of chunkBlobPromises) {
        if (myToken !== this.playbackToken) return false;
        const blob = await blobPromise;
        if (myToken !== this.playbackToken) return false;

        if (!startedCallbackFired) {
          startedCallbackFired = true;
          this.isPlayingFlag = true;
          callbacks.onStart?.();
        }

        if (this.activeObjectUrl) {
          URL.revokeObjectURL(this.activeObjectUrl);
        }
        const objectUrl = URL.createObjectURL(blob);
        this.activeObjectUrl = objectUrl;
        const audio = this.getOrCreateAudioElement();

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          let watchdogTimer: ReturnType<typeof setInterval> | null = null;
          let maxTimer: ReturnType<typeof setTimeout> | null = null;

          const cleanup = () => {
            if (watchdogTimer) {
              clearInterval(watchdogTimer);
              watchdogTimer = null;
            }
            if (maxTimer) {
              clearTimeout(maxTimer);
              maxTimer = null;
            }
            if (this.rafId !== null) {
              cancelAnimationFrame(this.rafId);
              this.rafId = null;
            }
            if (this.activeObjectUrl === objectUrl) {
              URL.revokeObjectURL(objectUrl);
              this.activeObjectUrl = null;
            }
          };

          const finishOk = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          };

          const finishErr = (err: Error) => {
            if (settled) return;
            settled = true;
            cleanup();
            reject(err);
          };

          audio.src = objectUrl;
          audio.volume = this.volume;

          audio.onended = () => finishOk();
          audio.onerror = () => finishErr(new Error('音声の再生に失敗しました。'));

          // モバイルブラウザ等で onended が遅延・欠落した場合でも確実に口パクを停止する監視タイマー
          watchdogTimer = setInterval(() => {
            if (myToken !== this.playbackToken) {
              finishOk();
              return;
            }
            if (
              audio.ended ||
              (Number.isFinite(audio.duration) &&
                audio.duration > 0 &&
                audio.currentTime >= audio.duration - 0.04) ||
              (audio.paused && audio.currentTime > 0.15)
            ) {
              finishOk();
            }
          }, 120);

          const maxDurationMs = Math.max(8000, chunk.length * 320);
          maxTimer = setTimeout(() => {
            finishOk();
          }, maxDurationMs);

          this.startLevelPulse(callbacks.onAudioLevel);
          audio.play().catch(finishErr);
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
