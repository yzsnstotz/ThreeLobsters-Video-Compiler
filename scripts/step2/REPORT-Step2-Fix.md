# TLVC Step2 脚本错误检查与修复报告

## 运行结果摘要（修复前）

| 步骤 | 结果 | 现象 |
|------|------|------|
| 00-check-token-src.sh | OK | token 源文件存在 |
| 01-token-copy.sh | OK | 三用户 token 属主正确 (ao000/ao001/ao002) |
| 02-sync-tools.sh | 部分 | ao000 有 ls 输出，ao001/ao002 行为空 |
| 03-gateway-plist-inject.sh | 错误 | 三用户均报 MISSING plist，全部 skip |
| 04-gateway-restart.sh | 错误 | 三用户均 Skip (no plist or uid) |
| 05-validate.sh | OK | 三用户 PASS，FAIL=0 |

---

## 根因

- **02**：脚本里用 `ls -la "/Users/$u/..."` 时是以 **yzliu** 身份执行，yzliu 无法读 ao001/ao002 的 `~/.openclaw/`，`ls` 失败导致输出为空（sync 本身已成功）。
- **03 / 04**：用 `[[ ! -f "$PL" ]]` / `[[ ! -f "$PL" ]]` 时同样是以 **yzliu** 身份检查，yzliu 无法读其他用户目录（如 `/Users/ao000/Library/LaunchAgents/`），`-f` 为假，脚本误判为“plist 不存在”并 skip。

---

## 修复内容

1. **02-sync-tools.sh**  
   - 将“列出刚同步的文件”改为用 **`sudo ls -la`** 目标路径，这样任意用户目录下都能看到 tlvc_status / tlvc_deliver。

2. **03-gateway-plist-inject.sh**  
   - 将 plist 存在性检查改为 **`sudo test -f "$PL"`**，不再用 yzliu 的 `-f` 判断。

3. **04-gateway-restart.sh**  
   - 将 plist 存在性检查改为 **`sudo test -f "$PL"`**，与 03 一致。

---

## 修复后建议再跑一遍

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/02-sync-tools.sh
bash /Users/yzliu/work/tlvc/scripts/step2/03-gateway-plist-inject.sh
bash /Users/yzliu/work/tlvc/scripts/step2/04-gateway-restart.sh
```

或一键：

```bash
/Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-fix-all.sh
```

预期：02 对三用户都打印 ls 两行；03 能检测到 plist 并注入；04 能检测到 plist 并执行 bootout/bootstrap/kickstart。

---

## Step2 Telegram 脚本（01/02/04/05）执行报告

| 脚本 | 结果 | 说明 |
|------|------|------|
| **01-locate-telegram-entry.sh** | 符合预期 | 修复后重跑验证通过。每用户正确输出：HOME、OPENCLAW 路径（ao000 有，ao001/ao002 为 MISSING）、Gateway 状态（仅 ao000 有完整 openclaw 输出）、`ls` 与 find 的 Telegram 相关候选（TOOLS.md、AGENTS.md、telegram、credentials 等）。 |
| **02-insert-sentinel-and-check-log.sh** | 符合预期 | 三用户均插入哨兵 `# ROUTE_SENTINEL_TLVC`；ao000 成功重启 gateway 并打出 OpenClaw 版本；ao001/ao002 无 gateway 输出（openclaw 不在 PATH），属预期。 |
| **04-verify-tlvc-status-per-user.sh** | 符合预期 | 修复后重跑验证通过。三用户均：which tlvc_status（脚本 + .ts）、shasum 一致、grep token fallback 显示 `~/.secrets/tlvc.token` 逻辑、无 env 直接执行 `tlvc_status --ep ep_0007` 输出 `step2: done` 与 `artifacts: sanitized=true topk=true lint=true`。 |
| **05-grep-tlvc-conflict.sh** | 已执行 | 输出较长未贴；无报错。可用于排查 `/tlvc_status` 冲突及是否需改名为 tlvc2。 |

**修复要点（01/04 已应用）**：经 `sudo -u "$u" -i bash -lc '...'` 传入的脚本若含多行，易被压成一行导致语法/输出异常；统一改为**单行、分号分隔、避免子 shell `( ... )`**。

### 重跑验证结果（01 / 04）

- **01**：ao000 有完整 Gateway 信息（LaunchAgent、port 18790、RPC probe ok 等）及 `~/.openclaw` 下 telegram/TOOLS.md/AGENTS.md/credentials 等路径；ao001/ao002 为 OPENCLAW=MISSING、Gateway 空，find 仍列出三用户共有的 TOOLS.md、AGENTS.md、workspace/tools/tlvc 等候选。
- **04**：三用户 tlvc_status / tlvc_deliver 哈希一致（adaf4079... / 1b742d37...），token fallback 行 4/5/9/10 一致，直接运行均返回 step2 与 artifacts 行，无语法错误。

**后续**：真正实现「硬返回」需在 OpenClaw 侧按 `DIFF-Hard-Return-Telegram.md` 修改 Telegram 消息处理逻辑，本仓库仅脚本与文档。
