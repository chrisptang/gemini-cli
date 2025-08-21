#!/usr/bin/env node

/**
 * Test script to validate function call handling in OpenAI content generator
 */

import { OpenAIContentGenerator } from './packages/core/src/openai/openaiContentGenerator.js';

// Mock OpenAI API response for testing
const mockResponse = {
  id: 'chatcmpl-test',
  object: 'chat.completion',
  created: Date.now(),
  model: 'gpt-3.5-turbo',
  choices: [{
    index: 0,
    message: {
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_test123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"city": "New York", "units": "celsius"}'
        }
      }]
    },
    finish_reason: 'tool_calls'
  }],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 20,
    total_tokens: 30
  }
};

// Mock streaming chunks for testing
const mockStreamChunks = [
  {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      delta: {
        role: 'assistant',
        tool_calls: [{
          index: 0,
          id: 'call_test456',
          type: 'function',
          function: {
            name: 'get_weather'
          }
        }]
      }
    }]
  },
  {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          function: {
            arguments: '{"city":'
          }
        }]
      }
    }]
  },
  {
    id: 'chatcmpl-test',
    object: 'chat.completion.chunk',
    created: Date.now(),
    model: 'gpt-3.5-turbo',
    choices: [{
      index: 0,
      delta: {
        tool_calls: [{
          index: 0,
          function: {
            arguments: ' "San Francisco"}'
          }
        }]
      },
      finish_reason: 'tool_calls'
    }]
  }
];

class TestOpenAIContentGenerator extends OpenAIContentGenerator {
  constructor() {
    super('test-key', 'https://api.test.com/v1', 'test-model');
  }

  // Mock the HTTP request to return our test data
  async makeOpenAIRequest(request) {
    console.log('📤 Mock request tools:', request.tools?.length || 0);
    return mockResponse;
  }

  async makeOpenAIStreamRequest(request) {
    console.log('📤 Mock stream request tools:', request.tools?.length || 0);
    return mockStreamChunks;
  }
}

async function testNonStreamingFunctionCalls() {
  console.log('🧪 Testing non-streaming function call conversion...');
  
  const generator = new TestOpenAIContentGenerator();
  
  const request = {
    model: 'test-model',
    contents: [{
      role: 'user',
      parts: [{ text: 'Get weather for New York' }]
    }],
    config: {
      tools: [{
        functionDeclarations: [{
          name: 'get_weather',
          description: 'Get weather for a city',
          parametersJsonSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' },
              units: { type: 'string' }
            },
            required: ['city']
          }
        }]
      }]
    }
  };
  
  try {
    const result = await generator.generateContent(request, 'test-prompt');
    
    console.log('Response structure:');
    console.log('- Has candidates:', !!result.candidates);
    console.log('- Has functionCalls:', !!result.functionCalls);
    console.log('- functionCalls count:', result.functionCalls?.length || 0);
    
    if (result.functionCalls && result.functionCalls.length > 0) {
      const fc = result.functionCalls[0];
      console.log('- Function call details:');
      console.log('  - ID:', fc.id);
      console.log('  - Name:', fc.name);
      console.log('  - Args:', JSON.stringify(fc.args));
      console.log('✅ Non-streaming function calls working correctly!');
      return true;
    } else {
      console.log('❌ No function calls found in response');
      return false;
    }
  } catch (error) {
    console.error('❌ Non-streaming test failed:', error.message);
    return false;
  }
}

async function testStreamingFunctionCalls() {
  console.log('\n🌊 Testing streaming function call conversion...');
  
  const generator = new TestOpenAIContentGenerator();
  
  const request = {
    model: 'test-model',
    contents: [{
      role: 'user',
      parts: [{ text: 'Get weather for San Francisco' }]
    }],
    config: {
      tools: [{
        functionDeclarations: [{
          name: 'get_weather',
          description: 'Get weather for a city',
          parametersJsonSchema: {
            type: 'object',
            properties: {
              city: { type: 'string' }
            },
            required: ['city']
          }
        }]
      }]
    }
  };
  
  try {
    const streamGenerator = await generator.generateContentStream(request, 'test-prompt-stream');
    const results = [];
    
    for await (const result of streamGenerator) {
      results.push(result);
    }
    
    console.log('Stream results count:', results.length);
    
    let foundFunctionCall = false;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.functionCalls && result.functionCalls.length > 0) {
        foundFunctionCall = true;
        const fc = result.functionCalls[0];
        console.log(`- Chunk ${i} function call details:`);
        console.log('  - ID:', fc.id);
        console.log('  - Name:', fc.name);
        console.log('  - Args:', JSON.stringify(fc.args));
      }
    }
    
    if (foundFunctionCall) {
      console.log('✅ Streaming function calls working correctly!');
      return true;
    } else {
      console.log('❌ No function calls found in streaming results');
      return false;
    }
  } catch (error) {
    console.error('❌ Streaming test failed:', error.message);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Testing OpenAI Function Call Handling\n');
  
  const results = [];
  results.push(testNonStreamingFunctionCalls());
  results.push(await testStreamingFunctionCalls());
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log('🎉 All function call tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some function call tests failed');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('💥 Test suite failed:', error);
  process.exit(1);
});
