// src/index.ts
import { logger as logger2 } from "@elizaos/core";

// src/provider.ts
import { logger } from "@elizaos/core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
var TIMEOUT = 12e4;
var MAX_PROMPT_LENGTH = 5e4;
var ClaudeCodeModelProvider = class {
  timeout;
  constructor(options = {}) {
    this.timeout = options.timeout || TIMEOUT;
  }
  async generateText(_runtime, prompt, model = "sonnet") {
    let tempDir = null;
    let proc = null;
    let timeoutId = null;
    try {
      const truncated = prompt.slice(-MAX_PROMPT_LENGTH);
      tempDir = await mkdtemp(join(tmpdir(), "claude-code-"));
      logger.debug(`[claude-code] Created temp workspace: ${tempDir}`);
      logger.debug(`[claude-code] Generating with model=${model}`);
      logger.debug(`[claude-code] Prompt preview: ${truncated.slice(0, 500)}...`);
      proc = Bun.spawn(
        [
          "claude",
          "-p",
          truncated,
          "--model",
          model
        ],
        {
          cwd: tempDir,
          stdout: "pipe",
          stderr: "pipe"
        }
      );
      timeoutId = setTimeout(() => {
        if (proc) {
          proc.kill();
        }
      }, this.timeout);
      const [output, errors] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text()
      ]);
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = errors.trim();
        const stdout = output.trim();
        logger.error(`[claude-code] Failed (exit=${exitCode})`);
        logger.error(`[claude-code] stderr: ${stderr}`);
        logger.error(`[claude-code] stdout: ${stdout}`);
        throw new Error(`ClaudeCodeError: ${stderr || stdout || "Unknown error"}`);
      }
      if (!output || output.trim().length === 0) {
        throw new Error("EmptyOutput: Claude Code returned nothing");
      }
      logger.debug(`[claude-code] Response (length=${output.length})`);
      logger.debug(`[claude-code] Raw output preview: ${output.slice(0, 300)}...`);
      const trimmed = output.trim();
      if (!trimmed.startsWith("<response>")) {
        logger.debug("[claude-code] Adding <response> wrapper");
        return `<response>
${trimmed}
</response>`;
      }
      return trimmed;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[claude-code] Generation failed: ${msg}`);
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (proc) {
        try {
          proc.kill();
        } catch {
        }
      }
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
          logger.debug(`[claude-code] Cleaned up temp workspace: ${tempDir}`);
        } catch (cleanupError) {
          logger.warn(`[claude-code] Failed to cleanup ${tempDir}: ${cleanupError}`);
        }
      }
    }
  }
  async getEmbeddingResponse(_input) {
    throw new Error("ClaudeCodeModelProvider does not support embeddings");
  }
};

// src/index.ts
var providerInstance = null;
function getProvider(runtime) {
  if (!providerInstance) {
    const settings = runtime.character?.settings;
    const ccSettings = settings?.claudeCode;
    const timeout = ccSettings?.timeout || 12e4;
    providerInstance = new ClaudeCodeModelProvider({
      timeout
    });
    logger2.info(`[claude-code] Model provider initialized (timeout=${timeout}ms)`);
  }
  return providerInstance;
}
var claudeCodePlugin = {
  name: "plugin-claude-code",
  description: "Claude Code CLI integration as a model provider",
  models: {
    TEXT_LARGE: async (runtime, params) => {
      const provider = getProvider(runtime);
      const prompt = typeof params === "string" ? params : params.prompt || "";
      const settings = runtime.character?.settings;
      const ccSettings = settings?.claudeCode;
      const model = ccSettings?.largeModel || "sonnet";
      return provider.generateText(runtime, prompt, model);
    },
    TEXT_SMALL: async (runtime, params) => {
      const provider = getProvider(runtime);
      const prompt = typeof params === "string" ? params : params.prompt || "";
      const settings = runtime.character?.settings;
      const ccSettings = settings?.claudeCode;
      const model = ccSettings?.smallModel || "haiku";
      return provider.generateText(runtime, prompt, model);
    }
  },
  actions: [],
  providers: [],
  evaluators: []
};
var index_default = claudeCodePlugin;
export {
  ClaudeCodeModelProvider,
  claudeCodePlugin,
  index_default as default
};
//# sourceMappingURL=index.js.map