"""
Transcription des épisodes du Floodcast avec faster-whisper (GPU CUDA si dispo).

- Lit la liste des épisodes dans data/floodcast.db (remplie par `npm run ingest`).
- Télécharge chaque MP3 depuis Acast, le transcrit, écrit data/transcripts/<guid>.json
- Reprise sur erreur : les épisodes déjà transcrits sont sautés.

Usage :
    python transcriber/transcribe.py                      # tout, du plus récent au plus ancien
    python transcriber/transcribe.py --limit 3            # 3 épisodes
    python transcriber/transcribe.py --only S10E42 S01E01 # épisodes précis
    python transcriber/transcribe.py --model large-v3 --oldest-first
    python transcriber/transcribe.py --resync             # retranscrit les épisodes désynchronisés

Synchronisation sans stocker l'audio : Acast assemble les pubs par "auditeur" (IP + User-Agent)
et ressert le même assemblage aux requêtes suivantes. On télécharge avec un User-Agent fixe
(ACAST_UA, partagé avec le serveur) et on note la taille du fichier transcrit (audio_bytes) :
le serveur relaie ensuite l'audio avec le même User-Agent et vérifie la taille pour savoir
si l'écoute correspond exactement à la transcription. Aucun MP3 n'est conservé.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("FLOOD_DATA_DIR", ROOT / "data"))
DB_PATH = DATA / "floodcast.db"
OUT_DIR = DATA / "transcripts"
ACAST_UA = os.environ.get("FLOOD_ACAST_UA", "floodcast-fan-transcriber/1.0")


def register_cuda_dlls() -> None:
    """Sous Windows, rend visibles les DLL cuBLAS/cuDNN installées via pip (nvidia-*-cu12)."""
    if os.name != "nt":
        return
    nvidia = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    if not nvidia.exists():
        return
    for bin_dir in nvidia.glob("*/bin"):
        os.add_dll_directory(str(bin_dir))
        os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"


def load_episodes(args) -> list[dict]:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    rows = con.execute(
        """
        SELECT e.id, e.code, e.full_title, e.audio_url, e.duration_sec,
               (SELECT group_concat(g.name, ', ') FROM episode_guests eg
                JOIN guests g ON g.id = eg.guest_id WHERE eg.episode_id = e.id) AS guests
        FROM episodes e WHERE e.audio_url IS NOT NULL
        ORDER BY e.pub_date {}
        """.format("ASC" if args.oldest_first else "DESC")
    ).fetchall()
    con.close()
    eps = [dict(r) for r in rows]
    if args.only:
        wanted = {o.upper() for o in args.only}
        eps = [e for e in eps if (e["code"] or "").upper() in wanted or e["id"] in args.only]
    return eps


def download(url: str, dest: Path) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": ACAST_UA})
    with urllib.request.urlopen(req, timeout=120) as r, open(dest, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)


def remote_size(url: str) -> int | None:
    """Taille totale du fichier qu'Acast nous servirait maintenant (requête d'1 octet)."""
    req = urllib.request.Request(url, headers={"User-Agent": ACAST_UA, "Range": "bytes=0-0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            total = (r.headers.get("Content-Range") or "").rpartition("/")[2]
            return int(total) if total.isdigit() else None
    except Exception:
        return None


def build_prompt(ep: dict) -> str:
    # Un court "prompt" oriente Whisper vers la bonne orthographe des noms propres.
    names = ["Florent Bernard", "Adrien Ménielle", "Floodcast"]
    if ep.get("guests"):
        names += [g.strip() for g in ep["guests"].split(",")]
    return "Bienvenue dans le Floodcast, avec " + ", ".join(names) + "."



def file_stem(episode_id: str) -> str:
    """Nom de fichier sûr : les vieux GUID SoundCloud ("tag:soundcloud,2010:tracks/123") contiennent
    des caractères interdits sous Windows. L'identifiant exact reste dans le JSON (episode_id)."""
    return re.sub(r"[^A-Za-z0-9._-]", "_", episode_id)

def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--model", default="large-v3-turbo",
                   help="large-v3-turbo (rapide, recommandé), large-v3 (précis), medium, small…")
    p.add_argument("--device", default="auto", choices=["auto", "cuda", "cpu"])
    p.add_argument("--compute-type", default=None, help="float16 (GPU), int8 (CPU)…")
    p.add_argument("--batch-size", type=int, default=8,
                   help="inférence par lots (3-4x plus rapide sur GPU). 0 = mode séquentiel classique")
    p.add_argument("--limit", type=int, default=0)
    p.add_argument("--only", nargs="*")
    p.add_argument("--oldest-first", action="store_true")
    p.add_argument("--force", action="store_true", help="retranscrire même si déjà fait")
    p.add_argument("--resync", action="store_true",
                   help="retranscrire les épisodes dont l'assemblage de pubs Acast a changé depuis")
    args = p.parse_args()

    if not DB_PATH.exists():
        sys.exit("Base introuvable : lance d'abord `npm run ingest` dans server/.")

    register_cuda_dlls()
    from faster_whisper import WhisperModel  # import après l'enregistrement des DLL

    device = args.device
    if device == "auto":
        import ctranslate2
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    compute_type = args.compute_type or ("float16" if device == "cuda" else "int8")
    print(f"→ Modèle {args.model} sur {device} ({compute_type})", flush=True)
    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    batched = None
    if args.batch_size > 0:
        from faster_whisper import BatchedInferencePipeline
        batched = BatchedInferencePipeline(model=model)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    def needs_work(e: dict) -> bool:
        path = OUT_DIR / f"{file_stem(e['id'])}.json"
        if args.force or not path.exists():
            return True
        if args.resync:
            known = json.loads(path.read_text(encoding="utf-8")).get("audio_bytes")
            return known is None or remote_size(e["audio_url"]) != known
        return False

    todo = [e for e in load_episodes(args) if needs_work(e)]
    if args.limit:
        todo = todo[: args.limit]
    print(f"→ {len(todo)} épisode(s) à transcrire", flush=True)

    for i, ep in enumerate(todo, 1):
        label = f"[{i}/{len(todo)}] {ep['code'] or ''} {ep['full_title']}"
        print(label, flush=True)
        t0 = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            mp3 = Path(tmp) / "episode.mp3"
            try:
                download(ep["audio_url"], mp3)
            except Exception as exc:  # réseau capricieux : on passe au suivant
                print(f"   ✗ téléchargement impossible : {exc}", flush=True)
                continue

            if batched:
                segments, info = batched.transcribe(
                    str(mp3),
                    language="fr",
                    batch_size=args.batch_size,
                    beam_size=5,
                    initial_prompt=build_prompt(ep),
                )
            else:
                segments, info = model.transcribe(
                    str(mp3),
                    language="fr",
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 500},
                    beam_size=5,
                    initial_prompt=build_prompt(ep),
                    # Évite les boucles d'hallucination typiques sur de longs fichiers.
                    condition_on_previous_text=False,
                )
            out = []
            for s in segments:
                text = s.text.strip()
                if text:
                    out.append({"start": round(s.start, 2), "end": round(s.end, 2), "text": text})
            audio_bytes = mp3.stat().st_size  # empreinte de l'assemblage de pubs transcrit

        payload = {
            "episode_id": ep["id"],
            "code": ep["code"],
            "title": ep["full_title"],
            "model": args.model,
            "language": info.language,
            "duration": info.duration,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "audio_bytes": audio_bytes,
            "user_agent": ACAST_UA,
            "segments": out,
        }
        tmp_json = OUT_DIR / f"{file_stem(ep['id'])}.json.part"
        tmp_json.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp_json.replace(OUT_DIR / f"{file_stem(ep['id'])}.json")

        elapsed = time.time() - t0
        speed = (info.duration or 0) / elapsed if elapsed else 0
        print(f"   ✓ {len(out)} segments en {elapsed:.0f}s (×{speed:.0f} temps réel)", flush=True)

    print("Terminé. Lance `npm run index` dans server/ pour indexer les nouvelles transcriptions.")


if __name__ == "__main__":
    main()
