import { splitIntoSpeechChunks } from './speechTextNormalizer';

export type MouthVowelShape = 'closed' | 'a' | 'i' | 'u' | 'e' | 'o';

export interface LiveVoiceMetrics {
  level: number; // 0.0 .. 1.0
  openY: number; // 0.0 .. 1.0 (連続的な口の縦開き量)
  formRow: number; // 0.0 (う・お狭口) .. 1.0 (あ・え標準) .. 2.0 (い広口) の連続値
  vowel: MouthVowelShape;
  isPlaying: boolean;
}

export interface TtsPlaybackCallbacks {
  onStart?: () => void;
  onAudioLevel?: (level: number, vowel?: MouthVowelShape) => void;
  onEnd?: () => void;
  onFallbackToText?: (reason: string) => void;
}

/**
 * FFT周波数ビンから日本語母音（あ・い・う・え・お）と連続口形パラメータを推定する。
 */
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
  // 0.0 .. 1.0 の連続エネルギー
  const rawLevel = Math.min(1, avg / 78);

  // 無音・子音間・息継ぎ時は口を閉じる
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

  // F1（口の縦の開きに比例）と音声レベルから連続的な縦開き量 (0.0 .. 1.0) を算出
  const f1Norm = Math.min(1, f1Band / 155);
  const continuousOpenY = Math.min(1, Math.max(0.08, rawLevel * 0.65 + f1Norm * 0.5));

  // F2高域・中域と低域の比率から、口の横幅（0.0=う/お狭口 〜 1.0=あ/え標準 〜 2.0=い広口）を連続値で算出
  const highToLowRatio = (f2HighBand + f2MidBand * 0.5) / Math.max(15, lowBand * 0.7 + f1Band * 0.3);
  const continuousFormRow = Math.min(2.0, Math.max(0.0, (highToLowRatio - 0.32) * 2.2));

  // 母音ラベル分類
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
  private currentAudio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private activeAnalyser: AnalyserNode | null = null;
  private freqBins: Uint8Array<ArrayBuffer> | null = null;
  private rafId: number | null = null;
  private volume = 0.9;
  private isPlayingFlag = false;
  private playbackToken = 0;

  // 60fps Canvasが直接読み取るリアルタイム平滑化メトリクス（React再レンダリングを介さない）
  private liveMetrics: LiveVoiceMetrics = {
    level: 0,
    openY: 0,
    formRow: 1.0,
    vowel: 'closed',
    isPlaying: false,
  };

  public getLiveVoiceMetrics(): LiveVoiceMetrics {
    if (!this.isPlayingFlag || !this.activeAnalyser || !this.freqBins) {
      // 音声停止時は滑らかに減衰して完全に口を閉じる
      this.liveMetrics.level = 0;
      this.liveMetrics.openY = this.liveMetrics.openY * 0.65;
      if (this.liveMetrics.openY < 0.01) this.liveMetrics.openY = 0;
      this.liveMetrics.formRow += (1.0 - this.liveMetrics.formRow) * 0.2;
      this.liveMetrics.vowel = 'closed';
      this.liveMetrics.isPlaying = false;
      return this.liveMetrics;
    }

    this.activeAnalyser.getByteFrequencyData(this.freqBins);
    const est = estimateVowelFromSpectrum(this.freqBins);

    // アタックは素早く(0.42)、リリースは自然な速度(0.24)で補間し、カクつきを完全排除
    const openRate = est.targetOpenY > this.liveMetrics.openY ? 0.42 : 0.24;
    this.liveMetrics.openY += (est.targetOpenY - this.liveMetrics.openY) * openRate;
    if (this.liveMetrics.openY < 0.015 && est.targetOpenY === 0) {
      this.liveMetrics.openY = 0;
    }

    // 口の横幅フォームも滑らかに補間 (0.18)
    this.liveMetrics.formRow += (est.targetFormRow - this.liveMetrics.formRow) * 0.18;
    this.liveMetrics.level += (est.level - this.liveMetrics.level) * 0.35;
    this.liveMetrics.vowel = this.liveMetrics.openY < 0.04 ? 'closed' : est.vowel;
    this.liveMetrics.isPlaying = true;

    return this.liveMetrics;
  }

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
    this.activeAnalyser = null;
    this.freqBins = null;
    if (this.currentAudio) {
      this.currentAudio.pause();
      if (this.currentAudio.src.startsWith('blob:')) {
        URL.revokeObjectURL(this.currentAudio.src);
      }
      this.currentAudio.src = '';
      this.currentAudio = null;
    }
    this.isPlayingFlag = false;
    this.liveMetrics = {
      level: 0,
      openY: 0,
      formRow: 1.0,
      vowel: 'closed',
      isPlaying: false,
    };
  }

  private attachAudioAnalyser(
    audioEl: HTMLAudioElement,
    onLevel?: (lvl: number, vowel?: MouthVowelShape) => void
  ) {
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
      analyser.smoothingTimeConstant = 0.45;
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);

      this.activeAnalyser = analyser;
      this.freqBins = new Uint8Array(analyser.frequencyBinCount);

      if (onLevel) {
        // React側のUIインジケータ更新は負荷を抑えるため約12Hz（80ms間隔）に間引く
        let lastUiUpdate = 0;
        const tick = (now: number) => {
          if (!this.isPlayingFlag || this.currentAudio !== audioEl) {
            onLevel(0, 'closed');
            return;
          }
          const metrics = this.getLiveVoiceMetrics();
          if (now - lastUiUpdate >= 80) {
            lastUiUpdate = now;
            onLevel(metrics.level, metrics.vowel);
          }
          this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
      }
    } catch {
      onLevel?.(0.45, 'a');
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

        this.attachAudioAnalyser(audio, callbacks.onAudioLevel);
        audio.play().catch(reject);
      });

      if (myToken === this.playbackToken) {
        this.isPlayingFlag = false;
        this.activeAnalyser = null;
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
    // 文間の途切れを最小化するため、160文字以内の挨拶・短文は1チャンクで一括生成
    const chunks = splitIntoSpeechChunks(text, 160);
    if (chunks.length === 0) {
      callbacks.onEnd?.();
      return false;
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;
    this.isPlayingFlag = true;
    callbacks.onStart?.();

    try {
      // 全チャンクのTTSリクエストを並列プリフェッチして文と文の間の無音待ちをゼロにする
      const chunkBlobPromises = chunks.map(async (chunk) => {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(passcode ? { 'x-demo-passcode': passcode } : {}),
          },
          body: JSON.stringify({ text: chunk }),
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

      for (const blobPromise of chunkBlobPromises) {
        if (myToken !== this.playbackToken) return false;
        const blob = await blobPromise;
        if (myToken !== this.playbackToken) return false;

        const objectUrl = URL.createObjectURL(blob);
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(objectUrl);
          audio.volume = this.volume;
          this.currentAudio = audio;

          audio.onended = () => {
            URL.revokeObjectURL(objectUrl);
            if (this.currentAudio === audio) this.currentAudio = null;
            resolve();
          };
          audio.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            if (this.currentAudio === audio) this.currentAudio = null;
            reject(new Error('音声の再生に失敗しました。'));
          };

          this.attachAudioAnalyser(audio, callbacks.onAudioLevel);
          audio.play().catch(reject);
        });
      }

      if (myToken === this.playbackToken) {
        this.isPlayingFlag = false;
        this.activeAnalyser = null;
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
