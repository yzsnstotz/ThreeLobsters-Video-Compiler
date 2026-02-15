# 定位 Telegram 入口文件 + 更新路由块与重启

## 一键全量修复（推荐先跑）

在 Mac mini 上以 yzliu 在终端执行（会多次提示 sudo 密码）：

```bash
/Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-fix-all.sh
```

该脚本依次完成：0) 校验 token 源；1) 各用户 .zprofile 注入 PATH（openclaw）；2) gateway install/start 与 bootstrap；3.1) 复制 token 到各用户 ~/.secrets/tlvc.token；3.2) 向 ai.openclaw.gateway.plist 注入 TLVC_TOKEN_FILE、TLVC_API_BASE；3.3) 重启 gateway；4) 本地 tlvc_status 验证。若 Telegram 仍报 `TLVC_TOKEN_FILE is not set`，再执行 `scripts/tlvc-step2-telegram-debug-env.sh` 抓取环境。

## A. 找到真正的 TG_ENTRY_FILE（每个用户）

在 Mac mini 上对每个用户执行（会提示 sudo 密码）：

```bash
for u in ao000 ao001 ao002; do
  echo "========== $u =========="
  sudo -u "$u" env HOME="/Users/$u" bash /Users/yzliu/work/tlvc/scripts/find-telegram-entry.sh "$u"
done
```

输出会包含：
- `TG_ENTRY_FILE=/abs/path/to/file`
- 该文件前 60 行

搜索优先级：`~/.openclaw/telegram/**` → `~/.openclaw/agents/**` → `openclaw.json` 中 telegram 引用 → `~/.openclaw/workspace/**` → 回退到 `workspace/TOOLS.md` 或 `AGENTS.md`。

---

## B. 更新路由块并重启（修复 Permission denied / openclaw not found）

**原因**：用 `sudo -u "$u" bash script` 时未设置该用户的 `HOME`，脚本会误写 `yzliu` 的目录导致 Permission denied；且非 login shell 下 `openclaw` 不在 PATH。

**正确做法**：使用下面任一方式。

### 方式一：一键脚本（推荐）

```bash
/Users/yzliu/work/tlvc/scripts/run-update-routing-and-restart-all.sh
```

脚本会：
- 对 ao000/ao001/ao002 分别用 `env HOME=/Users/<user>` 调用 `update-telegram-routing-block.sh`，只写对应用户的 `~/.openclaw/workspace/TOOLS.md`；
- 用 `sudo -u <user> -i bash -c 'openclaw gateway stop; openclaw gateway start'`（login shell）保证 `openclaw` 在 PATH。

### 方式二：手写循环

```bash
for u in ao000 ao001 ao002; do
  sudo -u "$u" env HOME="/Users/$u" bash /Users/yzliu/work/tlvc/scripts/update-telegram-routing-block.sh
  sudo -u "$u" -i bash -c 'openclaw gateway stop 2>/dev/null; openclaw gateway start'
done
```

- 第一行：必须传 `HOME=/Users/$u`，否则会写到 yzliu 的 `.openclaw`，出现 override / Permission denied。
- 第二行：`-i` 表示 login shell，会加载该用户的 `.zshrc`/`.bash_profile`，PATH 中有 `openclaw`。

### 若 TG_ENTRY_FILE 不是 TOOLS.md

若 A 步得到的是其他路径（例如 `~/.openclaw/agents/telegram.md`），把该路径作为参数传入：

```bash
sudo -u ao000 env HOME=/Users/ao000 bash /Users/yzliu/work/tlvc/scripts/update-telegram-routing-block.sh /Users/ao000/.openclaw/agents/telegram.md
```

再重启该用户的 gateway。

---

## 路由块内容（前缀精确匹配）

- `/tlvc_status` → exec `~/.openclaw/workspace/tools/tlvc/tlvc_status --ep <ep>`
- `/tlvc_deliver` → exec `tlvc_deliver --ep <ep> --zip <zip> --out <outDir-or-$HOME/tlvc_artifacts/<ep>>`
- 回复：stdout 原样；失败：`FAILED (exit=...)` + stderr 最后 20 行（不含 token）

不改动 native 指令，仅在其上注入该块。
