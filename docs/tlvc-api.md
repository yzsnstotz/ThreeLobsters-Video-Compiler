# TLVC API 文档

TLVC API 提供投递（Telegram 导出 zip）与 Step2 状态/产物查询，供内网或受控环境使用。

- **Base URL**: `http://<host>:<TLVC_PORT>`，默认端口 `8789`
- **认证**: 所有请求必须在 header 中携带 `x-tlvc-token`，值与 `TLVC_TOKEN_FILE` 中内容（trim 后）一致，否则返回 `401 Unauthorized`
- **Content-Type**: 投递为 `multipart/form-data`；查询为普通 GET；响应均为 JSON

---

## 环境变量（服务端只读）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TLVC_ROOT` | `/Users/yzliu/work/tlvc` | 仓库根目录，inbox / build 等相对此路径 |
| `TLVC_TOKEN_FILE` | `/Users/yzliu/work/tlvc/.secrets/tlvc.token` | 存放 API token 的文件路径 |
| `TLVC_PORT` | `8789` | 监听端口 |
| `TLVC_BIND` | `0.0.0.0` | 监听地址，后续可用防火墙/ACL 控制来源 |
| `TLVC_MAX_UPLOAD_MB` | `200` | 单次上传 zip 最大体积（MB） |

---

## 通用说明

- **Episode 标识**: 路径参数 `:ep` 必须匹配正则 `^ep_[0-9]{4}$`（如 `ep_0007`），否则返回 `400 Bad Request`。
- **错误响应**: 统一为 JSON，形如 `{"ok": false, "error": "..."}`；HTTP 状态码见各接口说明。
- **安全**: 请求体与 token 不写日志；响应中可能包含服务端绝对路径（内网自用）。

---

## 1. 投递 — POST /v1/episodes/:ep/deliver

将 Telegram 导出 zip 投递到指定 episode 的 inbox，采用两阶段提交（先解压到 staging，再原子 rename 到 `inbox/<ep>`）。

### 请求

- **Method**: `POST`
- **URL**: `/v1/episodes/:ep/deliver`
- **Headers**: `x-tlvc-token: <token>`
- **Content-Type**: `multipart/form-data`

#### 表单字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `file` | file | 是 | ZIP 文件（Telegram export 打包） |
| `mode` | string | 否 | 保留字段，默认 `telegram_export_zip` |

### 处理逻辑摘要

1. 校验 `:ep` 格式；校验 `file` 存在且为合法 zip。
2. `inboxDir = <TLVC_ROOT>/inbox`，`staging = <inboxDir>/<ep>.__staging__.<unix_ts>`。
3. 解压 zip 到 `staging`（保留目录结构）；禁止路径穿越（`..`、绝对路径等），否则 400。
4. 定位 HTML：
   - 优先使用 `staging/messages.html`；
   - 否则在 staging 内递归找体积最大的 `*.html`，并将该文件复制到 staging 根并命名为 `messages.html`；
   - 若找不到任何 HTML，删除 staging 并返回 `422 Unprocessable Entity`。
5. `commitDir = <inboxDir>/<ep>`：
   - 若 `commitDir` 已存在：返回 `200` 且 `already_exists: true`，并删除 staging；
   - 否则 `rename(staging, commitDir)`（原子），返回 `200` 且 `already_exists: false` 及 `html` 路径。

### 响应

- **200 OK** — 投递成功或该 ep 已存在

```json
{
  "ok": true,
  "ep": "ep_0007",
  "already_exists": false,
  "inbox_dir": "/Users/yzliu/work/tlvc/inbox/ep_0007",
  "html": "/Users/yzliu/work/tlvc/inbox/ep_0007/messages.html"
}
```

当 `already_exists: true` 时，无 `html` 字段，例如：

```json
{
  "ok": true,
  "ep": "ep_0007",
  "already_exists": true,
  "inbox_dir": "/Users/yzliu/work/tlvc/inbox/ep_0007"
}
```

- **400 Bad Request** — `:ep` 格式错误、缺少 `file`、非 zip、zip 内含路径穿越等
- **401 Unauthorized** — token 缺失或错误
- **413 Payload Too Large** — 超过 `TLVC_MAX_UPLOAD_MB`
- **422 Unprocessable Entity** — zip 内无任何 HTML 文件
- **500 Internal Server Error** — 解压或提交失败

---

## 2. 状态查询 — GET /v1/episodes/:ep/status

查询指定 episode 的 Step2 处理状态及产物是否存在。

### 请求

- **Method**: `GET`
- **URL**: `/v1/episodes/:ep/status`
- **Headers**: `x-tlvc-token: <token>`

### 逻辑说明

- `out_dir = <TLVC_ROOT>/build/episodes/<ep>`
- 状态由 watcher 写入的标记文件决定（若存在）：
  - `step2.done` → `status: "done"`
  - `step2.fail` → `status: "fail"`
  - `step2.running` → `status: "running"`
  - 以上皆无 → `status: "unknown"`
- 产物目录：`<out_dir>/step2_preprocess/`，检查以下文件是否存在：
  - `sanitized.transcript.json`
  - `segments.topk.json`
  - `lint_report.step2.json`

### 响应

- **200 OK**

```json
{
  "ok": true,
  "ep": "ep_0007",
  "status": "done",
  "out_dir": "/Users/yzliu/work/tlvc/build/episodes/ep_0007",
  "artifacts": {
    "sanitized": true,
    "topk": true,
    "lint": true
  }
}
```

- `status`: `"done"` | `"running"` | `"fail"` | `"unknown"`
- `artifacts`: 三个布尔值分别表示上述三个 JSON 文件是否存在

- **400 Bad Request** — `:ep` 格式错误
- **401 Unauthorized** — token 缺失或错误

---

## 3. 产物内容 — GET /v1/episodes/:ep/artifacts（可选）

返回 Step2 三个 JSON 文件的内容（若存在且可解析）。

### 请求

- **Method**: `GET`
- **URL**: `/v1/episodes/:ep/artifacts`
- **Headers**: `x-tlvc-token: <token>`

### 响应

- **200 OK** — 至少有一个产物存在且可读

```json
{
  "ok": true,
  "ep": "ep_0007",
  "sanitized_transcript": { ... },
  "segments_topk": { ... },
  "lint_report": { ... }
}
```

存在的文件会以键 `sanitized_transcript`、`segments_topk`、`lint_report` 出现在同一层；缺失的文件不包含在响应中。

- **400 Bad Request** — `:ep` 格式错误
- **401 Unauthorized** — token 缺失或错误
- **404 Not Found** — 三个产物文件都不存在
- **422 Unprocessable Entity** — 文件存在但无法读取或解析为 JSON

---

## 安全与限制

- **上传大小**: 受 `TLVC_MAX_UPLOAD_MB` 限制，超出返回 413。
- **路径穿越**: 解压时过滤 zip 内包含 `..` 或绝对路径的条目，否则拒绝并返回 400。
- **日志**: 不记录请求体、不记录 token；可记录 method、url、requestId 等。
- **网络**: 建议通过防火墙或 ACL 限制访问来源，`TLVC_BIND=0.0.0.0` 仅表示监听所有接口。

---

## 示例

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

### 取产物

```bash
curl -sS "http://127.0.0.1:8789/v1/episodes/ep_0007/artifacts" \
  -H "x-tlvc-token: $(cat /Users/yzliu/work/tlvc/.secrets/tlvc.token)" | jq
```

---

## launchd 故障排除

出现 **Load failed: 5** 或 **Bootstrap failed: 5: Input/output error** 时，按下面做。

1. **用户域请用 `launchctl load`，不要用 `bootstrap`**  
   在 macOS 上，用户级 LaunchAgents 用传统 `load` 更稳定；`bootstrap gui/$(id -u)` 易触发 5：
   ```bash
   launchctl load /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```
   若之前加载过，先卸载再加载：
   ```bash
   launchctl unload /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   launchctl load /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```

2. **plist 不能对“其他用户”可写**  
   否则也会报 5。建议：
   ```bash
   chmod 644 /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```

3. **日志路径**  
   示例 plist 使用 `~/Library/Logs/tlvc-api.log`。若改回 `build/logs/tlvc-api.log`，需先 `mkdir -p .../build/logs`。

4. **确认启动脚本存在且可执行**  
   ```bash
   chmod +x /Users/yzliu/work/tlvc/apps/tlvc-api/deploy/run-tlvc-api.sh
   ```

5. **校验 plist 语法**  
   ```bash
   plutil -lint /Users/yzliu/Library/LaunchAgents/com.tlvc.api.plist
   ```

**说明**：用 `sudo launchctl bootstrap system ...` 加载放在用户目录的 plist 也会报 5（system 域与 plist 路径不匹配），排查时不必再用 root。

加载成功后，用 `launchctl list | grep tlvc` 查看，日志在 `/Users/yzliu/Library/Logs/tlvc-api.log`。
