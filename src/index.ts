import type { Plugin, IAgentRuntime } from '@elizaos/core';
import { logger } from '@elizaos/core';
import { ClaudeCodeModelProvider } from './provider';

let providerInstance: ClaudeCodeModelProvider | null = null;

function getProvider(runtime: IAgentRuntime): ClaudeCodeModelProvider {
  if (!providerInstance) {
    const settings = runtime.character?.settings as Record<string, unknown>;
    const ccSettings = settings?.claudeCode as Record<string, unknown>;

    const timeout = (ccSettings?.timeout as number) || 120000;

    providerInstance = new ClaudeCodeModelProvider({
      timeout,
    });

    logger.info(`[claude-code] Model provider initialized (timeout=${timeout}ms)`);
  }

  return providerInstance;
}

export const claudeCodePlugin: Plugin = {
  name: 'plugin-claude-code',
  description: 'Claude Code CLI integration as a model provider',

  models: {
    TEXT_LARGE: async (runtime, params) => {
      const provider = getProvider(runtime);
      const prompt = typeof params === 'string' ? params : (params as any).prompt || '';
      const settings = runtime.character?.settings as Record<string, unknown>;
      const ccSettings = settings?.claudeCode as Record<string, unknown>;
      const model = (ccSettings?.largeModel as 'sonnet' | 'opus' | 'haiku') || 'sonnet';
      return provider.generateText(runtime, prompt, model);
    },
    TEXT_SMALL: async (runtime, params) => {
      const provider = getProvider(runtime);
      const prompt = typeof params === 'string' ? params : (params as any).prompt || '';
      const settings = runtime.character?.settings as Record<string, unknown>;
      const ccSettings = settings?.claudeCode as Record<string, unknown>;
      const model = (ccSettings?.smallModel as 'sonnet' | 'opus' | 'haiku') || 'haiku';
      return provider.generateText(runtime, prompt, model);
    },
  },

  actions: [],
  providers: [],
  evaluators: [],
};

export default claudeCodePlugin;

export { ClaudeCodeModelProvider } from './provider';
