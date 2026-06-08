# Recording the demo GIF

The headline GIF is the single most important portfolio asset — it shows the extension working without anyone having to install it. Aim for **15–25 seconds**, no audio.

## What to show (the script)

1. **Start on a real job application page** — a Workable or Greenhouse posting works well (e.g. `https://apply.workable.com/...`). Have the backend already running (`npm run dev`) and a resume already uploaded.
2. The **side panel slides in** automatically once the page is detected. Pause ~1s so it's visible.
3. The panel shows the **detected job title + resume dropdown**. (1s)
4. Fields **fill in one by one** with the resume data — let this play out; it's the money shot.
5. A **flagged field** (low confidence, e.g. salary) shows the ⚠ and the editable input. (1–2s)
6. End on the **filled form**, scrolled so several filled fields are visible. Do **not** click submit.

Trim dead air at the start/end. The fill animation should be the bulk of the clip.

## How to record (macOS)

**Option A — Kap (simplest, exports GIF directly)**
1. Install [Kap](https://getkap.co/) (free).
2. Record the Chrome window region.
3. Export as GIF, ~10–15 fps, width ~900px. Keep it under 10 MB.

**Option B — built-in screen record + convert**
1. `Cmd+Shift+5` → record the window → save the `.mov`.
2. Convert with ffmpeg:
   ```bash
   ffmpeg -i recording.mov -vf "fps=12,scale=900:-1:flags=lanczos" -loop 0 docs/assets/demo.gif
   ```

## After recording

1. Save it as `docs/assets/demo.gif`.
2. Also grab one still of the side panel in review state → `docs/assets/panel.png`.
3. The README already points at these paths — no edit needed once the files exist.

## Tip

If a live ATS form is flaky to record against (anti-bot, login walls), use one of the bundled sample forms in `demo-html/` instead — open the HTML file locally and run the extension against it. Cleaner and reproducible.
