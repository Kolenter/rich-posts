# Optional bundled ffmpeg

Rich Posts uses ffmpeg to convert browser voice recordings (WebM) to OGG/Opus for Telegram Rich Messages.

**HEIC photos** from iPhone are converted to JPEG via `pillow-heif` (see `requirements.txt`).

**This binary is NOT included in the repository** (77 MB).

## Options

1. **System ffmpeg (recommended):**
   ```bash
   sudo apt install ffmpeg
   ```

2. **Custom path:**
   ```env
   FFMPEG_PATH=/usr/bin/ffmpeg
   ```

3. **Bundled binary:** download a static build and place it here:
   ```bash
   # Example (adjust URL for your platform)
   curl -L -o ffmpeg https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
   chmod +x ffmpeg
   ```

Resolution order: `FFMPEG_PATH` → `backend/bin/ffmpeg` → `ffmpeg` on PATH.
