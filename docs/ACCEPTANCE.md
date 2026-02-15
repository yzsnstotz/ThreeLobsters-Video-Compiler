# Step2 acceptance

## 0 error trigger 输入也能产出 segments

**目标**: 当没有任何 error trigger 命中时，Step2 仍产出至少 1 个 segment（fallback 切段），保证 Step3/4 有输入。

**行为**:
- Error trigger 切段优先：有 error 命中时仅用 error 切段。
- 若 error 切段结果为 0，则启用 fallback 切段（固定窗口 WIN=40, OVERLAP=10，10–60 条约束）。
- Lint: `segments.length === 0` 时报错 `NO_SEGMENTS`（exit_code=2），不再 silent pass。

**验收**:
1. 使用无 error trigger 的输入（如当前 inbox/ep_0007 若未命中任何 error）跑 Step2，应得到 `segment_mode: "fallback"` 且 `segments` 非空。
2. 使用含 error trigger 的 fixture（如 `scripts/fixtures/step2_error_trigger.html`）跑 Step2，应得到 `segment_mode: "error"` 且 `segments` 非空。
3. 一键验收：`./scripts/accept_step2.sh`，输出 PASS 及日志目录。

**输出可观测**:
- `segments.topk.json` 的 `meta` 含 `segment_mode`、`trigger_stats`。
- `lint_report.step2.json` 的 `summary` 含 `segment_mode`、`trigger_stats`。

## 如何运行 doctor

```bash
pnpm tlvc doctor step2 --ep ep_0007 --in inbox/ep_0007
```

可选 `--profile` 指定 extractor profile。输出：input_path、messages_html、profile、total_messages、sample 统计（前 20 条）、trigger_stats、结论（将使用 error 切段 / 将使用 fallback 切段）。

## 如何一键验收

```bash
./scripts/accept_step2.sh
```

从 repo 根目录执行。会跑两个 fixture（inbox/ep_0007 与 error trigger 最小 HTML），将 doctor 输出、Step2 三文件、summary 写入 `build/acceptance_logs/step2_accept_<timestamp>/`，终端打印 PASS/FAIL 及日志目录。

## 验收输出目录

`build/acceptance_logs/step2_accept_<timestamp>/`

- `fixture1_inbox_ep0007/`：doctor.txt、step2.txt、out/step2_preprocess/（三 JSON）、summary.txt
- `fixture2_error_trigger/`：同上
- 终端最后一行：`Log dir: build/acceptance_logs/step2_accept_<ts>`

## 常见问题

- **segments=[]**：先跑 `pnpm tlvc doctor step2 --ep <ep> --in <input>` 看 trigger_stats；若 error=0 应走 fallback，若仍空则属 bug（lint 会报 NO_SEGMENTS）。
- **TS_PARSE_MISSING / sender unknown**：doctor 的 sample 会打印 ts_missing_count、sender_unknown_count；检查 extractor profile 与 HTML 结构（data-ts / div.pull_right.date.details 等）。
