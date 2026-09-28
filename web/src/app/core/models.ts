export interface GuestRef {
  name: string;
  slug: string;
}

export interface Episode {
  id: string;
  code: string | null;
  season: number | null;
  number: number | null;
  title: string;
  full_title: string;
  slug: string;
  pub_date: string;
  duration_sec: number | null;
  image: string | null;
  topics: string | null;
  has_transcript: boolean;
  audio_url: string | null;
  apple_url: string | null;
  deezer_url: string | null;
  /** Écoute via le relais local qui ressert l'assemblage de pubs transcrit (timecodes exacts). */
  audio_proxy: boolean;
  guests: GuestRef[];
}

export interface EpisodeDetail extends Episode {
  description: string | null;
  link: string | null;
  transcript_model: string | null;
  prev: string | null;
  next: string | null;
  ad_spans: { start: number; end: number }[];
  /** false : transcription intégrale non publiée (site public), seule la recherche l'exploite. */
  full_transcript: boolean;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  is_ad: boolean;
}

export interface Person {
  slug: string;
  name: string;
  nickname: string | null;
  tagline: string;
  website: string;
  sources: string[];
  socials: { label: string; handle: string | null; url: string }[];
  projects: { title: string; type: string; year: number | null; role: string | null; status?: string; note?: string }[];
}

export type OffsiteStatus = 'pending' | 'kept' | 'rejected';

export interface OffsiteItem {
  id: string;
  source: 'youtube' | 'apple';
  url: string;
  title: string;
  show: string | null;
  date: string | null;
  duration: number | null;
  people: ('flo' | 'adrien')[];
  type: string;
  thumbnail: string | null;
  excerpt?: string;
  status?: OffsiteStatus;
}

export interface OffsiteResponse {
  types: string[];
  items: OffsiteItem[];
}

export interface AdminOffsiteResponse extends OffsiteResponse {
  counts: Record<OffsiteStatus, number>;
  updated_at?: string;
}

export interface AdminMe {
  enabled: boolean;
  admin: boolean;
}

export interface SyncStatus {
  status: 'synced' | 'desynced' | 'unknown';
  reason?: string;
}

export interface Platforms {
  spotify: string;
  deezer: string;
  apple: string;
}

export interface Guest extends GuestRef {
  episodes: number;
  first_date: string;
  last_date: string;
}

export interface GuestDetail extends GuestRef {
  episodes: Episode[];
  buddies: (GuestRef & { n: number })[];
}

export interface Stats {
  episodes: number;
  transcribed: number;
  guests: number;
  total_seconds: number;
  embedded_chunks: number;
  ad_seconds: number;
  first_date: string;
  last_date: string;
}

export interface Season {
  season: number;
  episodes: number;
  first_date: string;
  last_date: string;
}

export interface HitPart {
  t: string;
  hit: boolean;
}

export interface SearchHit {
  start: number;
  end: number;
  exact: boolean;
  parts: HitPart[];
}

export interface SearchResult {
  episode: Episode;
  relevance: number;
  metaMatch: boolean;
  hits: SearchHit[];
}

export interface SearchResponse {
  query: string;
  tookMs: number;
  semantic: boolean;
  total: number;
  results: SearchResult[];
}
