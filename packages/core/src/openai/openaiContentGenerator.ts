/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Content,
  Part,
  FunctionCall,
  FinishReason,
  Tool,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
  content: string | null;
  name?: string;
  function_call?: {
    name: string;
    arguments: string;
  };
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

interface OpenAIFunction {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

interface OpenAIChatRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;
  functions?: OpenAIFunction[];
  function_call?: 'none' | 'auto' | { name: string };
  tools?: Array<{
    type: 'function';
    function: OpenAIFunction;
  }>;
  tool_choice?: 'none' | 'auto' | { type: 'function'; function: { name: string } };
}

interface OpenAIChatResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      function_call?: {
        name: string;
        arguments: string;
      };
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      function_call?: {
        name?: string;
        arguments?: string;
      };
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: 'stop' | 'length' | 'function_call' | 'tool_calls' | 'content_filter' | null;
  }>;
}

export class OpenAIContentGenerator implements ContentGenerator {
  constructor(
    private apiKey: string,
    private apiBase: string,
    private model: string,
  ) {}

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const openaiRequest = this.convertToOpenAIRequest(request, false);
    
    try {
      const response = await this.makeOpenAIRequest(openaiRequest);
      return this.convertFromOpenAIResponse(response);
    } catch (error) {
      throw new Error(`OpenAI API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const openaiRequest = this.convertToOpenAIRequest(request, true);
    
    try {
      const stream = await this.makeOpenAIStreamRequest(openaiRequest);
      return this.convertFromOpenAIStream(stream);
    } catch (error) {
      throw new Error(`OpenAI API streaming error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    // OpenAI doesn't have a direct token counting API, so we'll estimate
    // This is a simplified estimation - in production you might want to use a proper tokenizer
    const contents = Array.isArray(request.contents) ? request.contents : [];
    // Ensure we only pass Content objects to extractTextFromContents
    const contentArray = contents.filter(c => typeof c === 'object' && c !== null && 'parts' in c) as Content[];
    const text = this.extractTextFromContents(contentArray);
    const estimatedTokens = Math.ceil(text.length / 4); // Rough estimation: ~4 chars per token
    
    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    // OpenAI embeddings API is different from chat completions
    // This is a simplified implementation - you might want to handle this separately
    throw new Error('Embeddings not implemented for OpenAI-compatible APIs. Use a dedicated embedding service.');
  }

  private convertToOpenAIRequest(request: GenerateContentParameters, stream: boolean): OpenAIChatRequest {
    const messages: OpenAIMessage[] = [];
    
    // Handle system instruction and JSON generation
    let systemText = '';
    
    if (request.config?.systemInstruction) {
      if (typeof request.config.systemInstruction === 'string') {
        systemText = request.config.systemInstruction;
      } else if (request.config.systemInstruction && typeof request.config.systemInstruction === 'object') {
        // Handle Part or Content with text property
        const instruction = request.config.systemInstruction as any;
        systemText = instruction.text || (instruction.parts?.[0]?.text) || '';
      }
    }
    
    // Handle JSON generation requests
    const needsJsonResponse = request.config?.responseMimeType === 'application/json';
    if (needsJsonResponse && request.config?.responseJsonSchema) {
      const jsonInstruction = `${systemText ? '\n\n' : ''}IMPORTANT: You must respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.config.responseJsonSchema, null, 2)}\n\nReturn only the JSON object, no additional text or markdown formatting.`;
      systemText += jsonInstruction;
    }
    
    if (systemText) {
      messages.push({
        role: 'system',
        content: systemText,
      });
    }

    // Convert contents to OpenAI messages
    const contents = Array.isArray(request.contents) ? request.contents : [];
    // Filter to only Content objects and convert them
    const contentArray = contents.filter(c => typeof c === 'object' && c !== null && 'parts' in c) as Content[];
    for (const content of contentArray) {
      const message = this.convertContentToOpenAIMessage(content);
      if (message) {
        messages.push(message);
      }
    }

    const openaiRequest: OpenAIChatRequest = {
      model: this.model,
      messages,
      stream,
    };

    // Add generation config
    if (request.config?.temperature !== undefined) {
      openaiRequest.temperature = request.config.temperature;
    }
    if (request.config?.topP !== undefined) {
      openaiRequest.top_p = request.config.topP;
    }

    // Convert tools to OpenAI format
    if (request.config?.tools && request.config.tools.length > 0) {
      const tools: Array<{ type: 'function'; function: OpenAIFunction }> = [];
      
      for (const tool of request.config.tools) {
        // Check if it's a Tool with functionDeclarations
        const toolWithDeclarations = tool as Tool;
        if (toolWithDeclarations.functionDeclarations) {
          for (const func of toolWithDeclarations.functionDeclarations) {
            tools.push({
              type: 'function',
              function: {
                name: func.name || 'unknown_function',
                description: func.description,
                parameters: (func.parametersJsonSchema || func.parameters || {}) as Record<string, unknown>,
              },
            });
          }
        }
      }
      
      if (tools.length > 0) {
        openaiRequest.tools = tools;
        openaiRequest.tool_choice = 'auto';
      }
    }

    return openaiRequest;
  }

  private convertContentToOpenAIMessage(content: Content): OpenAIMessage | null {
    if (!content.parts || content.parts.length === 0) {
      return null;
    }

    const role = content.role === 'model' ? 'assistant' : content.role as 'user' | 'system';
    
    // Handle function responses
    const functionResponse = content.parts.find(part => 'functionResponse' in part);
    if (functionResponse && 'functionResponse' in functionResponse && functionResponse.functionResponse) {
      return {
        role: 'tool',
        content: JSON.stringify(functionResponse.functionResponse.response),
        tool_call_id: functionResponse.functionResponse.id || 'unknown',
      };
    }

    // Handle function calls
    const functionCall = content.parts.find(part => 'functionCall' in part);
    if (functionCall && 'functionCall' in functionCall && functionCall.functionCall) {
      const fc = functionCall.functionCall;
      return {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: fc.id || 'call_' + Date.now(),
          type: 'function',
          function: {
            name: fc.name || '',
            arguments: JSON.stringify(fc.args || {}),
          },
        }],
      };
    }

    // Handle regular text content
    const textParts = content.parts.filter(part => 'text' in part);
    if (textParts.length > 0) {
      const text = textParts.map(part => 'text' in part ? part.text || '' : '').join('');
      return {
        role,
        content: text,
      };
    }

    // Handle other content types (fileData, etc.) - convert to text representation
    const otherParts = content.parts.filter(part => !('text' in part) && !('functionCall' in part) && !('functionResponse' in part));
    if (otherParts.length > 0) {
      const description = otherParts.map(part => {
        if ('fileData' in part) {
          // Use fileUri or a default name since 'name' might not exist on FileData
          const fileData = part.fileData as any;
          const fileName = fileData?.name || fileData?.fileUri || 'unknown';
          return `[File: ${fileName}]`;
        }
        return '[Unsupported content type]';
      }).join('\n');
      
      return {
        role,
        content: description,
      };
    }

    return null;
  }

  private convertFromOpenAIResponse(response: OpenAIChatResponse): GenerateContentResponse {
    const choice = response.choices[0];
    if (!choice) {
      throw new Error('No choices in OpenAI response');
    }

    const parts: Part[] = [];
    
    if (choice.message.content) {
      parts.push({ text: choice.message.content });
    }

    // Handle function/tool calls
    if (choice.message.tool_calls) {
      for (const toolCall of choice.message.tool_calls) {
        parts.push({
          functionCall: {
            id: toolCall.id,
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}'),
          },
        });
      }
    } else if (choice.message.function_call) {
      parts.push({
        functionCall: {
          id: 'call_' + Date.now(),
          name: choice.message.function_call.name,
          args: JSON.parse(choice.message.function_call.arguments || '{}'),
        },
      });
    }

    const content: Content = {
      role: 'model',
      parts,
    };

    return {
      candidates: [{
        content,
        finishReason: this.mapFinishReason(choice.finish_reason),
        index: choice.index,
      }],
      usageMetadata: response.usage ? {
        promptTokenCount: response.usage.prompt_tokens,
        candidatesTokenCount: response.usage.completion_tokens,
        totalTokenCount: response.usage.total_tokens,
      } : undefined,
      text: undefined,
      data: undefined,
      functionCalls: undefined,
      executableCode: undefined,
      codeExecutionResult: undefined,
    };
  }

  private async *convertFromOpenAIStream(stream: AsyncIterable<OpenAIStreamChunk>): AsyncGenerator<GenerateContentResponse> {
    let currentFunctionCall: Partial<FunctionCall> & { arguments?: string } = {};
    let currentToolCalls: Array<{ index: number; call: Partial<FunctionCall> & { arguments?: string } }> = [];
    
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const parts: Part[] = [];
      
      // Handle text content
      if (choice.delta.content) {
        parts.push({ text: choice.delta.content });
      }

      // Handle function calls (legacy format)
      if (choice.delta.function_call) {
        if (choice.delta.function_call.name) {
          currentFunctionCall.name = choice.delta.function_call.name;
        }
        if (choice.delta.function_call.arguments) {
          currentFunctionCall.args = currentFunctionCall.args || {};
          // Accumulate arguments (they might come in chunks)
          const argString = (currentFunctionCall.arguments || '') + choice.delta.function_call.arguments;
          currentFunctionCall.arguments = argString;
        }
        
        // If this is the end of the function call, add it to parts
        if (choice.finish_reason === 'function_call') {
          try {
            const args = JSON.parse(currentFunctionCall.arguments || '{}');
            parts.push({
              functionCall: {
                id: 'call_' + Date.now(),
                name: currentFunctionCall.name || '',
                args,
              },
            });
          } catch (e) {
            // If JSON parsing fails, just use empty args
            parts.push({
              functionCall: {
                id: 'call_' + Date.now(),
                name: currentFunctionCall.name || '',
                args: {},
              },
            });
          }
        }
      }

      // Handle tool calls (new format)
      if (choice.delta.tool_calls) {
        for (const toolCallDelta of choice.delta.tool_calls) {
          const index = toolCallDelta.index;
          let currentToolCall = currentToolCalls.find(tc => tc.index === index);
          
          if (!currentToolCall) {
            currentToolCall = { index, call: {} };
            currentToolCalls.push(currentToolCall);
          }
          
          if (toolCallDelta.id) {
            currentToolCall.call.id = toolCallDelta.id;
          }
          
          if (toolCallDelta.function?.name) {
            currentToolCall.call.name = toolCallDelta.function.name;
          }
          
          if (toolCallDelta.function?.arguments) {
            const currentArgs = currentToolCall.call.arguments || '';
            currentToolCall.call.arguments = currentArgs + toolCallDelta.function.arguments;
          }
        }
        
        // If this is the end of tool calls, add them to parts
        if (choice.finish_reason === 'tool_calls') {
          for (const toolCall of currentToolCalls) {
            try {
              const args = JSON.parse(toolCall.call.arguments || '{}');
              parts.push({
                functionCall: {
                  id: toolCall.call.id || 'call_' + Date.now(),
                  name: toolCall.call.name || '',
                  args,
                },
              });
            } catch (e) {
              parts.push({
                functionCall: {
                  id: toolCall.call.id || 'call_' + Date.now(),
                  name: toolCall.call.name || '',
                  args: {},
                },
              });
            }
          }
        }
      }

      if (parts.length > 0) {
        const content: Content = {
          role: 'model',
          parts,
        };

        yield {
          candidates: [{
            content,
            finishReason: choice.finish_reason ? this.mapFinishReason(choice.finish_reason) : undefined,
            index: choice.index,
          }],
          text: undefined,
          data: undefined,
          functionCalls: undefined,
          executableCode: undefined,
          codeExecutionResult: undefined,
        };
      }
    }
  }

  private mapFinishReason(reason: string): FinishReason {
    switch (reason) {
      case 'stop': return FinishReason.STOP;
      case 'length': return FinishReason.MAX_TOKENS;
      case 'function_call':
      case 'tool_calls': return FinishReason.STOP; // Gemini doesn't have separate function call finish reason
      case 'content_filter': return FinishReason.SAFETY;
      default: return FinishReason.OTHER;
    }
  }

  private extractTextFromContents(contents: Content[]): string {
    let text = '';
    for (const content of contents) {
      if (content.parts) {
        for (const part of content.parts) {
          if ('text' in part && part.text) {
            text += part.text + ' ';
          }
        }
      }
    }
    return text;
  }

  private async makeOpenAIRequest(request: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    const url = `${this.apiBase}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `GeminiCLI/${process.env['CLI_VERSION'] || process.version}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  private async makeOpenAIStreamRequest(request: OpenAIChatRequest): Promise<AsyncIterable<OpenAIStreamChunk>> {
    const url = `${this.apiBase}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': `GeminiCLI/${process.env['CLI_VERSION'] || process.version}`,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error('No response body for streaming request');
    }

    return this.parseServerSentEvents(response.body);
  }

  private async *parseServerSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<OpenAIStreamChunk> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            
            if (data === '[DONE]') {
              return;
            }

            try {
              const chunk: OpenAIStreamChunk = JSON.parse(data);
              yield chunk;
            } catch (e) {
              // Skip invalid JSON chunks
              console.warn('Failed to parse SSE chunk:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
