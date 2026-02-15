import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ReplyToMode } from "../config/config.js";
import type { TelegramAccountConfig } from "../config/types.telegram.js";
import type { RuntimeEnv } from "../runtime.js";
import type { TelegramBotOptions } from "./bot.js";
import type { TelegramContext, TelegramStreamMode } from "./bot/types.js";
import {
  buildTelegramMessageContext,
  type BuildTelegramMessageContextParams,
  type TelegramMediaRef,
} from "./bot-message-context.js";
import { dispatchTelegramMessage } from "./bot-message-dispatch.js";

const execFileAsync = promisify(execFile);

/** Dependencies injected once when creating the message processor. */
type TelegramMessageProcessorDeps = Omit<
  BuildTelegramMessageContextParams,
  "primaryCtx" | "allMedia" | "storeAllowFrom" | "options"
> & {
  telegramCfg: TelegramAccountConfig;
  runtime: RuntimeEnv;
  replyToMode: ReplyToMode;
  streamMode: TelegramStreamMode;
  textLimit: number;
  opts: Pick<TelegramBotOptions, "token">;
  resolveBotTopicsEnabled: (ctx: TelegramContext) => boolean | Promise<boolean>;
};

/** TLVC hard-route: prefix match, exec script, sendMessage, return. No LLM. */
async function tryTlvcHardRoute(
  bot: TelegramMessageProcessorDeps["bot"],
  primaryCtx: TelegramContext,
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
    const epId = text.slice("/tlvc_status ".length).trim().split(/\s+/)[0];
    if (!/^ep_[0-9]{4}$/.test(epId)) return false;
    try {
      const { stdout, stderr } = await execFileAsync(
        path.join(tlvcDir, "tlvc_status"),
        ["--ep", epId],
        { env, maxBuffer: 64 * 1024 },
      );
      const out = (stdout || stderr || "OK").trim();
      await bot.api.sendMessage(chatId, out, threadId ? { message_thread_id: threadId } : {});
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await bot.api.sendMessage(
        chatId,
        `FAILED: ${msg}`.slice(0, 4000),
        threadId ? { message_thread_id: threadId } : {},
      );
      return true;
    }
  }

  if (text.startsWith("/tlvc_deliver ")) {
    const rest = text.slice("/tlvc_deliver ".length).trim().split(/\s+/);
    const [epId, zipPath, outDir] = [
      rest[0],
      rest[1],
      rest[2] ?? path.join(homedir, "tlvc_artifacts", rest[0] ?? ""),
    ];
    if (!epId || !zipPath || !/^ep_[0-9]{4}$/.test(epId)) return false;
    try {
      let stdout = "";
      let stderr = "";
      let code = 0;
      try {
        const r = await execFileAsync(
          path.join(tlvcDir, "tlvc_deliver"),
          ["--ep", epId, "--zip", zipPath, "--out", outDir],
          { env, maxBuffer: 64 * 1024 },
        );
        stdout = r.stdout ?? "";
      } catch (e: unknown) {
        const x = e as { code?: number; stdout?: string; stderr?: string };
        code = x.code ?? 1;
        stdout = x.stdout ?? "";
        stderr = x.stderr ?? "";
      }
      const out =
        (stdout || "").trim() +
        (code !== 0 ? `\nFAILED (exit=${code}): ${(stderr || "").slice(-800)}` : "");
      await bot.api.sendMessage(chatId, out.slice(0, 4096), threadId ? { message_thread_id: threadId } : {});
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      await bot.api.sendMessage(
        chatId,
        `FAILED: ${msg}`.slice(0, 4000),
        threadId ? { message_thread_id: threadId } : {},
      );
      return true;
    }
  }
  return false;
}

export const createTelegramMessageProcessor = (deps: TelegramMessageProcessorDeps) => {
  const {
    bot,
    cfg,
    account,
    telegramCfg,
    historyLimit,
    groupHistories,
    dmPolicy,
    allowFrom,
    groupAllowFrom,
    ackReactionScope,
    logger,
    resolveGroupActivation,
    resolveGroupRequireMention,
    resolveTelegramGroupConfig,
    runtime,
    replyToMode,
    streamMode,
    textLimit,
    opts,
    resolveBotTopicsEnabled,
  } = deps;

  return async (
    primaryCtx: TelegramContext,
    allMedia: TelegramMediaRef[],
    storeAllowFrom: string[],
    options?: { messageIdOverride?: string; forceWasMentioned?: boolean },
  ) => {
    if (await tryTlvcHardRoute(bot, primaryCtx)) {
      return;
    }
    const context = await buildTelegramMessageContext({
      primaryCtx,
      allMedia,
      storeAllowFrom,
      options,
      bot,
      cfg,
      account,
      historyLimit,
      groupHistories,
      dmPolicy,
      allowFrom,
      groupAllowFrom,
      ackReactionScope,
      logger,
      resolveGroupActivation,
      resolveGroupRequireMention,
      resolveTelegramGroupConfig,
    });
    if (!context) {
      return;
    }
    await dispatchTelegramMessage({
      context,
      bot,
      cfg,
      runtime,
      replyToMode,
      streamMode,
      textLimit,
      telegramCfg,
      opts,
      resolveBotTopicsEnabled,
    });
  };
};
