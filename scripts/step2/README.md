# TLVC Step2 Telegram 分步脚本

在 **yzliu** 账户下运行（不要用 root）。yzliu 上无需安装 openclaw；openclaw 只在各用户 (ao000/ao001/ao002) 上下文中执行。

## 顺序与说明

| 脚本 | 可自动执行 | 说明 |
|------|------------|------|
| `00-check-token-src.sh` | 是（无需 sudo） | 检查 token 源文件存在，Cursor 可直接跑 |
| `01-token-copy.sh` | 需 sudo | 复制 token 到各用户 ~/.secrets，属主对应用户 |
| `02-sync-tools.sh` | 需 sudo | 同步 tlvc_status / tlvc_deliver 到各用户 tools |
| `03-gateway-plist-inject.sh` | 需 sudo | 向 gateway plist 注入 TLVC_TOKEN_FILE、TLVC_API_BASE |
| `04-gateway-restart.sh` | 需 sudo | 重载各用户 LaunchAgent |
| `05-validate.sh` | 需 sudo（仅 stat） | 验证 token 属主 + tlvc_status 无 env 可跑 |

## 一键执行（按顺序）

```bash
/Users/yzliu/work/tlvc/scripts/tlvc-step2-telegram-fix-all.sh
```

## 分步执行

```bash
DIR=/Users/yzliu/work/tlvc/scripts/step2
bash "$DIR/00-check-token-src.sh"
bash "$DIR/01-token-copy.sh"
bash "$DIR/02-sync-tools.sh"
bash "$DIR/03-gateway-plist-inject.sh"
bash "$DIR/04-gateway-restart.sh"
bash "$DIR/05-validate.sh"
```

## 仅跑 Cursor 能做的（无 sudo）

```bash
bash /Users/yzliu/work/tlvc/scripts/step2/00-check-token-src.sh
```
