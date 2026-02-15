# TLVC Step2 Telegram 端到端 — 交付报告

## 0) 变量（统一）

| 变量 | 值 |
|------|-----|
| HOST | 100.114.240.117 (本机 YZ-Mac-mini.local) |
| USERS | ao000, ao001, ao002 |
| TLVC_API_BASE | http://127.0.0.1:8789 |
| TLVC_TOKEN_SOURCE | /Users/yzliu/work/tlvc/.secrets/tlvc.token |
| EP（验证用） | ep_0007 |

---

## 1) yzliu：token + API 存活 — 已完成

- **Token 文件**：存在，已 chmod 600，未打印全文；tokenHint：约 65 字节。
- **API 存活**：`curl -H "x-tlvc-token: $TOK" http://127.0.0.1:8789/v1/episodes/ep_0007/status` → **HTTP:200**。
- **本地 tlvc_status 输出（yzliu）**：
  ```
  step2: done
  artifacts: sanitized=true topk=true lint=true
  ```

---

## 2) ao000/ao001/ao002：需在终端执行（sudo 需密码）

当前环境无法在无交互下执行 `sudo -u ao000/ao001/ao002`，以下步骤需在 **Mac mini 本机终端** 执行一次。

### 一键执行（复制整段到终端，按提示输入 sudo 密码）

```bash
for u in ao000 ao001 ao002; do
  sudo bash /Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-setup.sh "$u"
done
```

每轮会提示输入 sudo 密码；脚本会：
- 将 token 复制到对应用户的 `~/.secrets/tlvc.token`
- 以该用户身份执行：工具检查、allowlist、定位 TG_ENTRY_FILE、注入路由块、重启 gateway

### 单用户执行示例

```bash
# 仅配置 ao000
sudo bash /Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-setup.sh ao000
```

### 若 token 已由其他方式分发

可跳过 token 复制，直接以对应用户运行（需先能切换到该用户，例如 sudo）：

```bash
sudo -u ao000 bash -c 'HOME=/Users/ao000 bash /Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-setup.sh --skip-token-copy ao000'
```

---

## 3) 脚本与路由块说明

### 新增/使用的脚本

| 路径 | 说明 |
|------|------|
| `scripts/tlvc_status` | 调用 GET /v1/episodes/:ep/status，输出 step2 + artifacts 行（可安装到各用户 `~/.openclaw/workspace/tools/tlvc/tlvc_status`） |
| `scripts/tlvc-step2-telegram-setup.sh` | 单用户 Step2 Telegram 配置：token、工具、allowlist、TG 入口定位、路由注入、gateway 重启 |

### 路由块内容（已写入 TG_ENTRY_FILE 顶部，幂等）

命令名精确匹配：**/tlvc_status**、**/tlvc_deliver**（不再使用 /status、/deliver）。

```
【BEGIN TLVC TELEGRAM ROUTING】
When the user message matches:
1) "/tlvc_status <epId>" → 直接 exec tlvc_status，回复 stdout
2) "/tlvc_deliver <epId> <zipPath> [outDir]" → 直接 exec tlvc_deliver，回复 stdout + artifacts_dir
【END TLVC TELEGRAM ROUTING】
```

脚本会优先写入 `~/.openclaw/workspace/TOOLS.md`，若不存在则创建；若已有块且已是 /tlvc_status、/tlvc_deliver 则不重复插入。

**仅更新路由块（把 /status、/deliver 改为 /tlvc_status、/tlvc_deliver）并重启 gateway**（三用户一致）：

```bash
for u in ao000 ao001 ao002; do
  sudo -u "$u" bash /Users/yzliu/work/tlvc/scripts/update-telegram-routing-block.sh
  sudo -u "$u" bash -c 'openclaw gateway stop && openclaw gateway start'
done
```

单用户：`sudo -u ao000 bash /Users/yzliu/work/tlvc/scripts/update-telegram-routing-block.sh`，再在该用户下 `openclaw gateway stop && openclaw gateway start`。

---

## 4) 每用户交付检查清单（执行上述一键命令后自检）

对 **ao000 / ao001 / ao002** 各检查：

| 项 | 检查命令（以 ao000 为例，替换用户） |
|----|--------------------------------------|
| token 文件 | `sudo ls -la /Users/ao000/.secrets/tlvc.token` → 应为 -rw------- |
| allowlist | `sudo cat /Users/ao000/.openclaw/exec-approvals.json \| grep -E "tlvc_(deliver\|status)"` → 应有命中行 |
| TG_ENTRY_FILE | 脚本输出中的 `TG_ENTRY_FILE=...`，以及 `grep -n "【BEGIN TLVC TELEGRAM ROUTING】"` 行号 |
| gateway | `sudo -u ao000 openclaw gateway status` → 前 30 行 |
| 本地 tlvc_status | `sudo -u ao000 bash -c 'export TLVC_API_BASE=http://127.0.0.1:8789 TLVC_TOKEN_FILE=$HOME/.secrets/tlvc.token; $HOME/.openclaw/workspace/tools/tlvc/tlvc_status --ep ep_0007'` |

---

## 5) Telegram 端到端验收（你在手机上操作）

在 Telegram 对 **ao000 / ao001 / ao002** 的 bot 分别发：

1. **`/tlvc_status ep_0007`**  
   - 期望：回复含 `step2: done`（或 running）及 `artifacts: sanitized=... topk=... lint=...`  
   - 不应出现 “What’s ep_0007?” 等 LLM 闲聊。

2. **`/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip`**  
   - 期望：回复含 `top1:` 行及 `outDir:` 或 `artifacts_dir:` 行；随后 `/tlvc_status ep_0007` 可变为 done。

---

## 6) 常见故障与一键修复（Cursor/你本地可自动执行）

### 7.1 本地 curl http://127.0.0.1:8789 连接拒绝

```bash
lsof -nP -iTCP:8789 -sTCP:LISTEN
launchctl print "gui/$(id -u)/com.tlvc.api" | sed -n '1,200p'
tail -n 120 /Users/yzliu/work/tlvc/build/logs/tlvc-api.log
# 若未启动：cd /Users/yzliu/work/tlvc && pnpm tlvc-api
```

### 7.2 tlvc_status 报 token file missing

```bash
# 对应用户下（或 sudo -u <user>）
mkdir -p "$HOME/.secrets"
install -m 600 /Users/yzliu/work/tlvc/.secrets/tlvc.token "$HOME/.secrets/tlvc.token"
```

（需在能访问 yzliu 的 tlvc 目录的环境执行；若用 sudo 则为 root 可读，再 install 到对应用户。）

### 重启 gateway（ao000/ao001/ao002 每个用户都要）

在各自用户下执行（或使用 sudo -u \<user\>）：

```bash
openclaw gateway stop && openclaw gateway start
```

一键为三用户重启（需 sudo 密码）：

```bash
for u in ao000 ao001 ao002; do sudo -u "$u" bash -c 'openclaw gateway stop; openclaw gateway start'; done
```

若 gateway 由 launchd 管理，则用对应 label 重启（如 `launchctl kick -k -p gui/$(id -u)/com.openclaw.gateway`，按实际 label 调整）。

### 7.3 Telegram 仍走 LLM（“需要更多上下文”）

- 说明当前 TG_ENTRY_FILE 未被 gateway 加载。  
- 在 `$HOME/.openclaw` 下扩大搜索 Telegram/agent 指令文件；查看 `openclaw gateway status` / config 中真正的 agent prompt 路径。  
- 将路由块写入该文件后，再次执行 gateway 重启（见脚本步骤 5）。

---

## 7) 下一步你在 Telegram 该发的命令与预期

| 命令 | 预期回复格式 |
|------|----------------|
| `/tlvc_status ep_0007` | `step2: done`（或 running）<br>`artifacts: sanitized=true topk=true lint=true` |
| `/tlvc_deliver ep_0007 /Users/yzliu/work/tlvc/uploads/ep_0007.zip` | 含 `top1:`、`outDir:` 或 `artifacts_dir:` 的脚本 stdout |

---

**注意**：所有日志与输出不得包含完整 token，仅使用 tokenHint 或 [REDACTED]。
