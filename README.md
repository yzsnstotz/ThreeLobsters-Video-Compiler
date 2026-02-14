# TLVC

TLVC monorepo: CLI, preprocessor, rules, schema, extractor, and **TLVC Studio** (project-level GUI for Step2 extractor/profile editing and run).

## TLVC Studio

Web UI for editing Step2 extractor profiles and running the preprocess pipeline. Works on desktop and mobile (e.g. iPhone Safari). Intended to run on a host (e.g. YZ-Mac-mini) and be reached via LAN or Tailscale.

### Start Studio

From repo root:

```bash
pnpm studio
```

- Dev server: Express + Vite HMR on one port (default **4173**).
- Set `TLVC_STUDIO_PORT` to use another port.
- Server listens on **0.0.0.0** so other devices on the network can connect.

### Access from phone

1. On the host, run `pnpm studio`.
2. Find the host IP (e.g. `192.168.x.x` or Tailscale IP).
3. On the phone browser open: `http://<host-ip>:4173`

### Production

```bash
pnpm studio:prod
```

Builds the client and server, then runs the server. Serve the built app with the same port and 0.0.0.0.

### Optional token

If the server has `TLVC_STUDIO_TOKEN` set, any **write or run** API (save profile, run Step2) requires the header `x-tlvc-token` to match. Enter the token in the sidebar “Token (if required)” so the UI can send it.

### Run Step2 from Studio

1. Open **Run Step2**.
2. Upload a Telegram HTML file.
3. Choose profile, set Episode ID (e.g. `ep_0007`), Top-K, timezone.
4. Click **Run Step2**. Output is written to `build/episodes/<epId>/step2_preprocess/` (transcript, segments, lint report).
5. The UI shows the lint report and the top-1 segment summary. The output path is shown as text for you to open in a file manager.

### Profiles

Profiles live under `profiles/extractors/*.json` and are versioned with the repo. Default profile: `profiles/extractors/telegram_export_v1.json`. CLI and Studio both use it when no profile is specified.

## CLI

```bash
pnpm tlvc preprocess <input.html> --ep <ep_id> --out <out_dir> --k <k> [--tz Asia/Tokyo] [--profile path_or_name]
```

Example:

```bash
pnpm tlvc preprocess ./telegram.html --ep ep_0007 --out build/episodes/ep_0007 --k 3 --profile telegram_export_v1
```

Step2 output is written to `<out_dir>/step2_preprocess/`.
