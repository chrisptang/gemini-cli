/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import type { Config } from '../config/config.js';

import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { InstallationManager } from '../utils/installationManager.js';
import { OpenAIContentGenerator } from '../openai/openaiContentGenerator.js';


/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI_COMPATIBLE = 'openai-compatible',
}

export type ContentGeneratorConfig = {
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
  openaiApiBase?: string;
  openaiModel?: string;
};

/**
 * 智能检测模型类型并返回相应的API基础URL
 * @param modelName 模型名称
 * @returns 对应的API基础URL，如果无法识别则返回null
 */
function detectModelApiBase(modelName: string): string | null {
  const model = modelName.toLowerCase();

  // DeepSeek模型
  if (model.includes('deepseek') || model.includes('ds-')) {
    return 'https://api.deepseek.com';
  }

  // OpenAI模型
  if (model.includes('gpt-') || model.includes('openai')) {
    return 'https://api.openai.com/v1';
  }

  // Anthropic Claude模型
  if (model.includes('claude') || model.includes('anthropic')) {
    return 'https://api.anthropic.com/v1';
  }

  // Groq模型
  if (model.includes('groq') || model.includes('mixtral') || model.includes('llama')) {
    return 'https://api.groq.com/openai/v1';
  }

  // Together.ai模型
  if (model.includes('together') || model.includes('/')) {
    return 'https://api.together.xyz/v1';
  }

  // 本地Ollama
  if (model.includes('llama') || model.includes('mistral') || model.includes('codellama')) {
    return 'http://localhost:11434/v1';
  }

  // 默认识别为OpenAI兼容API
  return 'https://api.openai.com/v1';
}

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env['GEMINI_API_KEY'] || undefined;
  const googleApiKey = process.env['GOOGLE_API_KEY'] || undefined;
  const googleCloudProject = process.env['GOOGLE_CLOUD_PROJECT'] || undefined;
  const googleCloudLocation = process.env['GOOGLE_CLOUD_LOCATION'] || undefined;
  const openaiApiKey = process.env['OPENAI_API_KEY'] || undefined;
  const openaiApiBase = process.env['OPENAI_API_BASE'] || undefined;
  // 使用配置中的模型，该模型已经包含了完整的优先级逻辑：
  // 1. Session中切换的模型 (/model model-name) - 最高优先级
  // 2. 命令行参数 (--model model-name) - 第二优先级
  // 3. OPENAI_MODEL环境变量 - 第三优先级
  // 4. GEMINI_MODEL环境变量 - 第四优先级
  // 5. 设置文件中的模型 - 第五优先级
  // 6. 默认模型 - 最低优先级
  const effectiveModel = config.getModel();

  const contentGeneratorConfig: ContentGeneratorConfig = {
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENAI_COMPATIBLE && openaiApiKey) {
    contentGeneratorConfig.apiKey = openaiApiKey;

    // 智能检测模型类型并设置相应的API基础URL
    const detectedApiBase = detectModelApiBase(effectiveModel);
    contentGeneratorConfig.openaiApiBase =
      openaiApiBase || detectedApiBase || 'https://api.openai.com/v1';

    contentGeneratorConfig.openaiModel = effectiveModel;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  // 自动检测：如果用户指定了OpenAI兼容模型但没有明确设置认证类型，自动启用OpenAI兼容模式
  if (!authType && openaiApiKey && effectiveModel) {
    const detectedApiBase = detectModelApiBase(effectiveModel);
    if (detectedApiBase) {
      contentGeneratorConfig.authType = AuthType.USE_OPENAI_COMPATIBLE;
      contentGeneratorConfig.apiKey = openaiApiKey;
      contentGeneratorConfig.openaiApiBase = openaiApiBase || detectedApiBase;
      contentGeneratorConfig.openaiModel = effectiveModel;
      contentGeneratorConfig.vertexai = false;

      return contentGeneratorConfig;
    }
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env['CLI_VERSION'] || process.version;
  const userAgent = `GeminiCLI/${version} (${process.platform}; ${process.arch})`;
  const baseHeaders: Record<string, string> = {
    'User-Agent': userAgent,
  };

  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    const httpOptions = { headers: baseHeaders };
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    let headers: Record<string, string> = { ...baseHeaders };
    if (gcConfig?.getUsageStatisticsEnabled()) {
      const installationManager = new InstallationManager();
      const installationId = installationManager.getInstallationId();
      headers = {
        ...headers,
        'x-gemini-api-privileged-user-id': `${installationId}`,
      };
    }
    const httpOptions = { headers };

    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }

  if (config.authType === AuthType.USE_OPENAI_COMPATIBLE) {
    if (!config.apiKey) {
      throw new Error('OpenAI API key is required for OpenAI-compatible APIs');
    }
    if (!config.openaiApiBase) {
      throw new Error(
        'OpenAI API base URL is required for OpenAI-compatible APIs',
      );
    }
    if (!config.openaiModel) {
      throw new Error('OpenAI model is required for OpenAI-compatible APIs');
    }

    const openaiGenerator = new OpenAIContentGenerator(
      config.apiKey,
      config.openaiApiBase,
      config.openaiModel,
    );
    return new LoggingContentGenerator(openaiGenerator, gcConfig);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
