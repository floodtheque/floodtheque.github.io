import { Pipe, PipeTransform } from '@angular/core';
import { HitPart } from './models';

export function timecode(sec: number | null | undefined): string {
  if (sec == null || Number.isNaN(sec)) return '--:--';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function humanDuration(sec: number | null | undefined): string {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Date façon appareil photo jetable : '25 7 21 */
export function cameraDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `'${String(d.getFullYear()).slice(2)}  ${d.getMonth() + 1}  ${d.getDate()}`;
}

export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Surlignage insensible aux accents/majuscules, renvoyé en morceaux (pas d'innerHTML). */
export function highlightParts(text: string, query: string): HitPart[] {
  const words = fold(query).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!words.length) return [{ t: text, hit: false }];
  const hay = fold(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const w of words) {
    let i = hay.indexOf(w);
    while (i >= 0) {
      for (let k = i; k < i + w.length; k++) marks[k] = true;
      i = hay.indexOf(w, i + w.length);
    }
  }
  const out: HitPart[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out.at(-1);
    if (last && last.hit === marks[i]) last.t += text[i];
    else out.push({ t: text[i], hit: marks[i] });
  }
  return out;
}

@Pipe({ name: 'timecode' })
export class TimecodePipe implements PipeTransform {
  transform = timecode;
}

@Pipe({ name: 'duration' })
export class DurationPipe implements PipeTransform {
  transform = humanDuration;
}

@Pipe({ name: 'cameraDate' })
export class CameraDatePipe implements PipeTransform {
  transform = cameraDate;
}
