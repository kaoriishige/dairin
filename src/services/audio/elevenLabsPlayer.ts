import { splitIntoSpeechChunks } from './speechTextNormalizer';

export interface TtsPlaybackCallbacks {
  onStart?: () => void;
  onAudioLevel?: (level: number) => void;
  onEnd?: () => void;
  onFallbackToText?: (reason: string) => void;
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

  private monitorAudioLevel(audioEl: HTMLAudioElement, onLevel?: (lvl: number) => void) {
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
      analyser.fftSize = 64;
      source.connect(analyser);
      analyser.connect(this.audioCtx.destination);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!this.isPlayingFlag || this.currentAudio !== audioEl) {
          onLevel(0);
          return;
        }
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
        onLevel(Math.min(1, avg / 90));
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    } catch {
      onLevel(0.45);
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
        callbacks.onAudioLevel?.(0);
        callbacks.onEnd?.();
      }
      return true;
    } catch (err) {
      this.stop();
      callbacks.onAudioLevel?.(0);
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
    const chunks = splitIntoSpeechChunks(text, 85);
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
        callbacks.onAudioLevel?.(0);
        callbacks.onEnd?.();
      }
      return true;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') {
        return false;
      }
      this.stop();
      callbacks.onAudioLevel?.(0);
      callbacks.onFallbackToText?.(
        err instanceof Error ? err.message : '音声再生中にエラーが発生しました。'
      );
      callbacks.onEnd?.();
      return false;
    }
  }
}
