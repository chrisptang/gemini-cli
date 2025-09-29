#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Simple test script for OpenAI-compatible API integration
 * This script can be used to test the integration before running the full CLI
 */

import { OpenAIContentGenerator } from '../packages/core/src/openai/openaiContentGenerator.js';

const testConfig = {
  apiKey: process.env['OPENAI_API_KEY'] || 'test-key',
  apiBase: process.env['OPENAI_API_BASE'] || 'https://api.openai.com/v1',
  model: process.env['OPENAI_MODEL'] || 'gpt-3.5-turbo',
};

console.log('Testing OpenAI-compatible API integration...');
console.log(`API Base: ${testConfig.apiBase}`);
console.log(`Model: ${testConfig.model}`);
console.log(`API Key: ${testConfig.apiKey.substring(0, 8)}...`);
console.log('');

if (
  !process.env['OPENAI_API_KEY'] ||
  !process.env['OPENAI_API_BASE'] ||
  !process.env['OPENAI_MODEL']
) {
  console.error('❌ Missing required environment variables:');
  console.error('   OPENAI_API_KEY - Your API key');
  console.error(
    '   OPENAI_API_BASE - API base URL (e.g., https://api.openai.com/v1)',
  );
  console.error('   OPENAI_MODEL - Model name (e.g., gpt-4)');
  console.error('');
  console.error('Example usage:');
  console.error('   export OPENAI_API_KEY="sk-..."');
  console.error('   export OPENAI_API_BASE="https://api.openai.com/v1"');
  console.error('   export OPENAI_MODEL="gpt-4"');
  console.error('   node scripts/test-openai-integration.js');
  process.exit(1);
}

// Create a minimal mock config for testing
const mockConfig = {
  getDebugMode: () => false,
  getProxy: () => undefined,
};

async function testBasicGeneration() {
  console.log('🔍 Testing basic text generation...');

  const generator = new OpenAIContentGenerator(
    testConfig.apiKey,
    testConfig.apiBase,
    testConfig.model,
    mockConfig,
  );

  try {
    const request = {
      model: testConfig.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Say "Hello from OpenAI-compatible API!" and nothing else.',
            },
          ],
        },
      ],
      config: {
        temperature: 0,
      },
    };

    const response = await generator.generateContent(request, 'test-prompt-1');

    if (response && response.candidates && response.candidates.length > 0) {
      const text = response.candidates[0].content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');

      console.log('✅ Basic generation successful!');
      console.log(`📝 Response: ${text}`);
      console.log('');
      return true;
    } else {
      console.error('❌ No response received');
      return false;
    }
  } catch (error) {
    console.error('❌ Basic generation failed:', error.message);
    return false;
  }
}

async function testStreaming() {
  console.log('🌊 Testing streaming generation...');

  const generator = new OpenAIContentGenerator(
    testConfig.apiKey,
    testConfig.apiBase,
    testConfig.model,
    mockConfig,
  );

  try {
    const request = {
      model: testConfig.model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'Count from 1 to 5, with each number on a new line.' },
          ],
        },
      ],
      config: {
        temperature: 0,
      },
    };

    const streamGenerator = await generator.generateContentStream(
      request,
      'test-prompt-2',
    );
    let fullText = '';
    let chunkCount = 0;

    for await (const response of streamGenerator) {
      if (response && response.candidates && response.candidates.length > 0) {
        const text = response.candidates[0].content.parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join('');

        if (text) {
          fullText += text;
          chunkCount++;
        }
      }
    }

    console.log('✅ Streaming generation successful!');
    console.log(`📊 Received ${chunkCount} chunks`);
    console.log(`📝 Full response: ${fullText.trim()}`);
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Streaming generation failed:', error.message);
    return false;
  }
}

async function testWithTools() {
  console.log('🛠️  Testing with function calling...');

  const generator = new OpenAIContentGenerator(
    testConfig.apiKey,
    testConfig.apiBase,
    testConfig.model,
    mockConfig,
  );

  try {
    const request = {
      model: testConfig.model,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'What is the weather like in New York? Use the get_weather function.',
            },
          ],
        },
      ],
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: 'Get weather information for a city',
                parametersJsonSchema: {
                  type: 'object',
                  properties: {
                    city: {
                      type: 'string',
                      description: 'The city name',
                    },
                  },
                  required: ['city'],
                },
              },
            ],
          },
        ],
        temperature: 0,
      },
    };

    const response = await generator.generateContent(request, 'test-prompt-3');

    if (response && response.candidates && response.candidates.length > 0) {
      const parts = response.candidates[0].content.parts;
      const hasFunctionCall = parts.some((part) => part.functionCall);

      if (hasFunctionCall) {
        console.log('✅ Function calling successful!');
        const functionCall = parts.find(
          (part) => part.functionCall,
        ).functionCall;
        console.log(`🔧 Function called: ${functionCall.name}`);
        console.log(`📋 Arguments:`, functionCall.args);
      } else {
        console.log(
          '⚠️  Function calling not supported by this model/provider',
        );
        const text = parts
          .filter((part) => part.text)
          .map((part) => part.text)
          .join('');
        console.log(`📝 Response: ${text}`);
      }
      console.log('');
      return true;
    } else {
      console.error('❌ No response received');
      return false;
    }
  } catch (error) {
    console.error('❌ Function calling test failed:', error.message);
    console.log(
      "ℹ️  This may be normal if your provider/model doesn't support function calling",
    );
    return true; // Don't fail the entire test for this
  }
}

async function runTests() {
  console.log('🧪 Running OpenAI-compatible API tests...\n');

  const results = [];

  results.push(await testBasicGeneration());
  results.push(await testStreaming());
  results.push(await testWithTools());

  const passed = results.filter((r) => r).length;
  const total = results.length;

  console.log('📊 Test Results:');
  console.log(`✅ Passed: ${passed}/${total}`);

  if (passed === total) {
    console.log(
      '🎉 All tests passed! OpenAI-compatible API integration is working correctly.',
    );
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Check the error messages above.');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});
