# tlvc-api

TLVC 投递与状态查询 API 服务。提供 POST 投递 zip、GET 状态与 GET 产物接口，认证方式为 header `x-tlvc-token`。

详见仓库根目录下 [docs/tlvc-api.md](../docs/tlvc-api.md)。

## 启动

```bash
TLVC_ROOT=/Users/yzliu/work/tlvc TLVC_PORT=8789 pnpm tlvc-api
```

或从 monorepo 根目录：

```bash
pnpm tlvc-api
```

（会使用默认 `TLVC_ROOT` / `TLVC_PORT`，token 从 `TLVC_TOKEN_FILE` 读取。）

## 最小自测

### 投递

```bash
curl -sS -X POST "http://127.0.0.1:8789/v1/episodes/ep_0007/deliver" \
  -H "x-tlvc-token: $(cat /Users/yzliu/work/tlvc/.secrets/tlvc.token)" \
  -F "file=@/path/to/ChatExport.zip" | jq
```

### 查状态

```bash
curl -sS "http://127.0.0.1:8789/v1/episodes/ep_0007/status" \
  -H "x-tlvc-token: $(cat /Users/yzliu/work/tlvc/.secrets/tlvc.token)" | jq
```

将 `/path/to/ChatExport.zip` 替换为实际 zip 路径；`ep_0007` 可改为其他合法 `ep_####`。

## 部署（launchd 示例）

以下 plist 为示例，**不会自动安装**。建议文件名：`com.tlvc.api.plist`。示例 plist 的日志输出到 `~/Library/Logs/tlvc-api.log`（无需事先建目录）。

**加载前必做：**

1. 给启动脚本执行权限：
   ```bash
   chmod +x /Users/yzliu/work/tlvc/apps/tlvc-api/deploy/run-tlvc-api.sh
   ```
2. 复制 plist 并**限制权限**（plist 若对“其他用户”可写会触发 Load failed: 5）：
   ```bash
   cp /Users/yzliu/work/tlvc/docs/com.tlvc.api.plist.example /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   chmod 644 /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```
3. 加载（用户域请用 **`launchctl load`**，不要用 `bootstrap`）：
   ```bash
   launchctl load /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```
   若之前加载过，先卸载再加载：
   ```bash
   launchctl unload /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   launchctl load /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```
