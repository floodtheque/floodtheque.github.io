import { Injectable, computed, signal } from '@angular/core';
import { Episode } from './models';

/** Lecteur audio global : on peut naviguer dans le site sans couper l'épisode. */
@Injectable({ providedIn: 'root' })
export class PlayerService {
  private readonly audio = typeof Audio !== 'undefined' ? new Audio() : null;

  readonly episode = signal<Episode | null>(null);
  readonly playing = signal(false);
  readonly time = signal(0);
  readonly duration = signal(0);
  readonly loading = signal(false);
  readonly progress = computed(() => (this.duration() ? this.time() / this.duration() : 0));

  constructor() {
    const a = this.audio;
    if (!a) return;
    a.preload = 'metadata';
    a.addEventListener('timeupdate', () => this.time.set(a.currentTime));
    a.addEventListener('durationchange', () => this.duration.set(a.duration || 0));
    a.addEventListener('play', () => this.playing.set(true));
    a.addEventListener('pause', () => this.playing.set(false));
    a.addEventListener('waiting', () => this.loading.set(true));
    a.addEventListener('playing', () => this.loading.set(false));
    a.addEventListener('canplay', () => this.loading.set(false));
  }

  play(ep: Episode, at?: number) {
    const a = this.audio;
    const src = ep.audio_proxy ? `/audio/${encodeURIComponent(ep.id)}.mp3` : ep.audio_url;
    if (!a || !src) return;
    if (this.episode()?.id !== ep.id) {
      this.episode.set(ep);
      this.duration.set(ep.duration_sec ?? 0);
      this.loading.set(true);
      // Relais local = même assemblage de pubs que le fichier transcrit (timecodes exacts).
      // Flux Acast direct = pubs différentes, timecodes approximatifs.
      a.src = src;
    }
    if (at != null) {
      // On recule de 2 s pour entendre la phrase en entier.
      a.currentTime = Math.max(0, at - 2);
      this.time.set(a.currentTime);
    }
    void a.play().catch(() => this.playing.set(false));
  }

  isCurrent(ep: { id: string } | null | undefined) {
    return !!ep && this.episode()?.id === ep.id;
  }

  toggle() {
    const a = this.audio;
    if (!a || !this.episode()) return;
    if (a.paused) void a.play();
    else a.pause();
  }

  seek(sec: number) {
    if (this.audio) this.audio.currentTime = Math.max(0, Math.min(sec, this.duration() || sec));
  }

  skip(delta: number) {
    this.seek(this.time() + delta);
  }

  close() {
    this.audio?.pause();
    this.episode.set(null);
  }
}
