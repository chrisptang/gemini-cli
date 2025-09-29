# OpenAI-Compatible APIs

Gemini CLI now supports OpenAI-compatible APIs, allowing you to use alternative LLM providers while keeping all the powerful features of Gemini CLI like tool usage, code analysis, and project understanding.

## Quick Start

### 1. Set Environment Variables

You need to configure three environment variables:

```bash
# Required: Your API key
export OPENAI_API_KEY="your-api-key-here"

# Required: API base URL
export OPENAI_API_BASE="https://api.openai.com/v1"

# Required: Model name
export OPENAI_MODEL="gpt-4"
```

### 2. Start Gemini CLI

```bash
gemini
```

When prompted for authentication, select **"OpenAI-Compatible API"**.

### 3. Alternative: Use CLI Arguments

You can also specify the configuration via command-line arguments:

```bash
gemini --openai-api-base https://api.openai.com/v1 --model gpt-4
```

## Supported Providers

### OpenAI

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_API_BASE="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4"  # or gpt-3.5-turbo, gpt-4-turbo, etc.
```

### Anthropic Claude (via OpenAI-compatible proxy)

If using a proxy service that provides OpenAI-compatible access to Claude:

```bash
export OPENAI_API_KEY="your-anthropic-key"
export OPENAI_API_BASE="https://anthropic-proxy.example.com/v1"
export OPENAI_MODEL="claude-3-sonnet-20240229"
```

### Ollama (Local)

```bash
export OPENAI_API_KEY="ollama"  # Can be any value for local Ollama
export OPENAI_API_BASE="http://localhost:11434/v1"
export OPENAI_MODEL="llama2"  # or codellama, mistral, etc.
```

Make sure Ollama is running:

```bash
ollama serve
ollama pull llama2  # Pull the model you want to use
```

### LocalAI

```bash
export OPENAI_API_KEY="local"  # Can be any value for local setup
export OPENAI_API_BASE="http://localhost:8080/v1"
export OPENAI_MODEL="your-model-name"
```

### Together.ai

```bash
export OPENAI_API_KEY="your-together-key"
export OPENAI_API_BASE="https://api.together.xyz/v1"
export OPENAI_MODEL="meta-llama/Llama-2-70b-chat-hf"
```

### Groq

```bash
export OPENAI_API_KEY="your-groq-key"
export OPENAI_API_BASE="https://api.groq.com/openai/v1"
export OPENAI_MODEL="mixtral-8x7b-32768"
```

## Configuration Options

### Environment Variables

| Variable          | Description                | Example                              |
| ----------------- | -------------------------- | ------------------------------------ |
| `OPENAI_API_KEY`  | API key for authentication | `sk-...` or provider-specific key    |
| `OPENAI_API_BASE` | Base URL for API endpoint  | `https://api.openai.com/v1`          |
| `OPENAI_MODEL`    | Model name to use          | `gpt-4`, `llama2`, `claude-3-sonnet` |

### CLI Arguments

| Argument            | Description           |
| ------------------- | --------------------- |
| `--openai-api-base` | Override API base URL |
| `--model`, `-m`     | Override model name   |

### Using .env Files

Create a `.gemini/.env` file in your project or home directory:

```env
OPENAI_API_KEY=your-api-key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

## Features Support

### ✅ Fully Supported

- Text generation and conversations
- Streaming responses
- Tool/function calling (if provider supports it)
- System instructions
- Temperature and top-p parameters
- Multi-turn conversations
- All Gemini CLI features (file analysis, code generation, etc.)

### ⚠️ Limited Support

- Token counting (uses estimation)
- Embeddings (not implemented, falls back to error)

### Model-Specific Considerations

**Function Calling:** Not all models support function calling. Gemini CLI will attempt to use tools, but may fall back gracefully if the model doesn't support them.

**Context Length:** Different models have different context lengths. Gemini CLI's chat compression feature helps manage long conversations.

**Streaming:** Most OpenAI-compatible providers support streaming, but some may not.

## Troubleshooting

### Common Issues

#### "API key not found"

```
OPENAI_API_KEY environment variable not found.
```

**Solution:** Set the `OPENAI_API_KEY` environment variable.

#### "API base URL not found"

```
OPENAI_API_BASE environment variable not found.
```

**Solution:** Set the `OPENAI_API_BASE` environment variable to your provider's API endpoint.

#### "Model not found"

```
OPENAI_MODEL environment variable not found.
```

**Solution:** Set the `OPENAI_MODEL` environment variable to a model name your provider supports.

#### Connection Errors

**For local providers (Ollama, LocalAI):**

- Ensure the service is running
- Check the port number in `OPENAI_API_BASE`
- Verify the model is loaded/available

**For remote providers:**

- Check your internet connection
- Verify the API key is correct
- Check if the provider's service is operational

#### Function Calling Issues

Some models or providers don't support OpenAI's function calling format. Gemini CLI will:

1. Attempt to use tools normally
2. Fall back to text-based tool descriptions if function calling fails
3. Show appropriate error messages

### Debug Mode

Enable debug mode to see detailed API requests and responses:

```bash
gemini --debug
```

### Testing Your Configuration

Test your OpenAI-compatible setup:

```bash
# Test with a simple prompt
echo "Hello, how are you?" | gemini -p "Respond briefly"
```

## Examples

### OpenAI with Code Analysis

```bash
export OPENAI_API_KEY="sk-..."
export OPENAI_API_BASE="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4"

# Start in your code project
cd my-project
gemini
> Analyze this codebase and suggest improvements
```

### Local Ollama for Privacy

```bash
export OPENAI_API_KEY="ollama"
export OPENAI_API_BASE="http://localhost:11434/v1"
export OPENAI_MODEL="codellama"

# Use for code generation without sending data externally
gemini
> Write a Python function to parse JSON files
```

### Multiple Providers in Different Projects

Use project-specific `.gemini/.env` files:

**Project A (.gemini/.env):**

```env
OPENAI_API_KEY=sk-openai-key
OPENAI_API_BASE=https://api.openai.com/v1
OPENAI_MODEL=gpt-4
```

**Project B (.gemini/.env):**

```env
OPENAI_API_KEY=ollama
OPENAI_API_BASE=http://localhost:11434/v1
OPENAI_MODEL=llama2
```

## Performance Tips

1. **Local models** (Ollama, LocalAI) provide faster responses and better privacy but may have lower quality
2. **Streaming** is enabled by default for better perceived performance
3. **Tool calling** performance varies by provider - OpenAI and Anthropic generally perform best
4. **Context management** is handled automatically, but shorter conversations are faster

## Security Considerations

- **API Keys:** Store them securely, use `.env` files that are git-ignored
- **Local Models:** Consider using Ollama or LocalAI for sensitive data
- **Proxy Services:** Be aware of data handling policies when using proxy services
- **Network:** All communication uses HTTPS (except for local `localhost` endpoints)

## Getting Help

If you encounter issues:

1. Check this documentation
2. Enable debug mode: `gemini --debug`
3. Check the provider's documentation
4. File an issue on the [Gemini CLI GitHub repository](https://github.com/google-gemini/gemini-cli/issues)
