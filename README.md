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

### Step2 doctor (config check + trigger stats)

```bash
pnpm tlvc doctor step2 --ep ep_0007 --in inbox/ep_0007
```

Prints: input path, messages.html, profile name/version, total messages, sample stats (first 20: ts missing, sender unknown, empty text), trigger hit counts (error/permission/action), and conclusion (将使用 error 切段 or 将使用 fallback 切段). Exit 0 unless input missing or parse error. Does not write build output.

### Step2 one-click acceptance

```bash
./scripts/accept_step2.sh
```

Runs two fixtures (inbox/ep_0007 and a minimal error-trigger HTML), writes logs to `build/acceptance_logs/step2_accept_<timestamp>/`, prints PASS/FAIL and the log dir. See `docs/ACCEPTANCE.md` for details and troubleshooting (segments=[], TS missing, sender unknown).

## Step2 Watch (inbox daemon)

A watch process monitors `inbox/` for new episode folders (`ep_####`). When it finds one that is fully delivered and stable, it runs Step2 CLI once and writes marker files under `build/episodes/<ep>/`. No LLM, no network, Node + fs only.

### How to deliver an episode

1. Create a staging folder (watcher ignores it): `inbox/ep_9999.__staging__`
2. Copy your Telegram export or messages.html into it.
3. Rename when ready: `mv inbox/ep_9999.__staging__ inbox/ep_9999`

Only directories named exactly `ep_####` are processed; names ending with `.__staging__` are ignored.

### How to start the watcher

From repo root:

```bash
cd /Users/yzliu/work/tlvc
pnpm watch:step2
```

Optional: `--inbox inbox` `--poll 5000` `--k 3` `--tz Asia/Tokyo`

### Marker files (under build/episodes/&lt;ep&gt;/)

- **step2.running** — Step2 is running (start_ts, pid).
- **step2.done** — Step2 finished with exit 0 (end_ts, exit_code, output_dir).
- **step2.fail** — Step2 failed or timed out (end_ts, exit_code, reason, optional lint_summary_path).

Idempotent: existing `step2.done` skips reprocessing. Stale `step2.running` (e.g. &gt;10 min) is marked fail and removed.

### Logs and troubleshooting

- Per-episode log: `build/episodes/<ep>/logs/step2_watch.log`. Console shows short status.
- On failure check `step2.fail` and, if present, `lint_report.step2.json` at the path in `lint_summary_path`.
- Episode folder must contain at least one HTML (e.g. messages.html). Watcher waits for directory stability (2s) before starting Step2.
