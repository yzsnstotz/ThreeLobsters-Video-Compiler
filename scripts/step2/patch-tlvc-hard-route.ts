/**
 * TLVC hard-route block to insert at the top of createTelegramMessageProcessor's
 * returned async function (before buildTelegramMessageContext).
 * Insert after: "options?: { messageIdOverride?: string; forceWasMentioned?: boolean },\n  ) => {"
 * Add these imports at top: execFile, os, path, promisify, and the helper function above return.
 */
export const TLVC_HARD_ROUTE_IMPORTS = `import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
`;

export const TLVC_HARD_ROUTE_HELPER = `
/** TLVC hard-route: prefix match, exec script, sendMessage, return. No LLM. */
async function tryTlvcHardRoute(
  bot: { api: { sendMessage: (chatId: number, text: string, opts?: { message_thread_id?: number }) => Promise<unknown> } },
  primaryCtx: { message?: { text?: string; caption?: string; chat?: { id?: number }; message_thread_id?: number } },
): Promise<boolean> {
  const text = (primaryCtx.message?.text ?? primaryCtx.message?.caption ?? "").trim();
  const chatId = primaryCtx.message?.chat?.id;
  const threadId = primaryCtx.message?.message_thread_id;
  if (chatId == null || typeof chatId !== "number") return false;
  const homedir = process.env.HOME ?? os.homedir();
  const tlvcDir = path.join(homedir, ".openclaw", "workspace", "tools", "tlvc");
  const tokenFile = path.join(homedir, ".secrets", "tlvc.token");
  const env = { ...process.env, TLVC_TOKEN_FILE: tokenFile, TLVC_API_BASE: "http://127.0.0.1:8789" };

  if (text.startsWith("/tlvc_status ")) {
    const epId = text.slice("/tlvc_status ".length).trim().split(/\\s+/)[0];
    if (!/^ep_[0-9]{4}$/.test(epId)) return false;
    try {
      const { stdout, stderr } = await (await import("node:util")).promisify(await import("node:child_process").then((c) => c.execFile))(
        path.join(tlvcDir, "tlvc_status"),
        ["--ep", epId],
        { env, maxBuffer: 64 * 1024 },
      );
      const out = (stdout || stderr || "OK").trim();
      await bot.api.sendMessage(chatId, out, threadId ? { message_thread_id: threadId } : {});
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await bot.api.sendMessage(chatId, ("FAILED: " + msg).slice(0, 4000), threadId ? { message_thread_id: threadId } : {});
      return true;
    }
  }

  if (text.startsWith("/tlvc_deliver ")) {
    const rest = text.slice("/tlvc_deliver ".length).trim().split(/\\s+/);
    const epId = rest[0];
    const zipPath = rest[1];
    const outDir = rest[2] ?? path.join(homedir, "tlvc_artifacts", rest[0] ?? "");
    if (!epId || !zipPath || !/^ep_[0-9]{4}$/.test(epId)) return false;
    try {
      let stdout = "";
      let stderr = "";
      let code = 0;
      try {
        const r = await (await import("node:util")).promisify(await import("node:child_process").then((c) => c.execFile))(
          path.join(tlvcDir, "tlvc_deliver"),
          ["--ep", epId, "--zip", zipPath, "--out", outDir],
          { env, maxBuffer: 64 * 1024 },
        );
        stdout = (r as { stdout?: string }).stdout ?? "";
      } catch (e: unknown) {
        const x = e as { code?: number; stdout?: string; stderr?: string };
        code = x.code ?? 1;
        stdout = x.stdout ?? "";
        stderr = x.stderr ?? "";
      }
      const out = (stdout || "").trim() + (code !== 0 ? "\\nFAILED (exit=" + code + "): " + (stderr || "").slice(-800) : "\\nartifacts_dir: " + outDir);
      await bot.api.sendMessage(chatId, out.slice(0, 4096), threadId ? { message_thread_id: threadId } : {});
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await bot.api.sendMessage(chatId, ("FAILED: " + msg).slice(0, 4000), threadId ? { message_thread_id: threadId } : {});
      return true;
    }
  }
  return false;
}
`;
