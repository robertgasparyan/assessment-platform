import { assertAiEnabled } from "./ai-settings.js";

type GenerateTextResult = {
  text: string;
  provider: string;
  model: string;
  visibleProviderLabel: string | null;
};

function extractTextFromJsonBlock(value: string) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return a JSON object");
  }

  return value.slice(start, end + 1);
}

async function requestOllama(baseUrl: string, model: string, prompt: string) {
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: {
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama responded with ${response.status}`);
  }

  const body = (await response.json()) as { response?: string };
  return body.response?.trim() ?? "";
}

async function requestOpenAiCompatible(baseUrl: string, apiKey: string, model: string, prompt: string, providerLabel: string) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are a precise assessment-report analyst. Return only valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`${providerLabel} responded with ${response.status}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return body.choices?.[0]?.message?.content?.trim() ?? "";
}

async function requestClaude(baseUrl: string, apiKey: string, model: string, prompt: string) {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0.2,
      system: "You are a precise assessment-report analyst. Return only valid JSON.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude responded with ${response.status}`);
  }

  const body = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  return body.content?.find((item) => item.type === "text")?.text?.trim() ?? "";
}

async function requestGemini(baseUrl: string, apiKey: string, model: string, prompt: string) {
  const normalizedModel = model.startsWith("models/") ? model : `models/${model}`;
  const response = await fetch(`${baseUrl}/${normalizedModel}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.2
      },
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini responded with ${response.status}`);
  }

  const body = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
}

export async function generateAssessmentAiJson<T>(prompt: string): Promise<T & GenerateTextResult> {
  const ai = await assertAiEnabled();
  const { activeProvider, providerConfig, showProviderToUsers } = ai;

  if (!providerConfig.model.trim()) {
    throw new Error(`The active AI provider ${activeProvider} does not have a model configured`);
  }

  let text = "";
  switch (activeProvider) {
    case "ollama":
      text = await requestOllama(providerConfig.baseUrl, providerConfig.model, prompt);
      break;
    case "openai":
      if (!providerConfig.apiKey) {
        throw new Error("OpenAI API key is not configured");
      }
      text = await requestOpenAiCompatible(providerConfig.baseUrl, providerConfig.apiKey, providerConfig.model, prompt, "OpenAI");
      break;
    case "claude":
      if (!providerConfig.apiKey) {
        throw new Error("Claude API key is not configured");
      }
      text = await requestClaude(providerConfig.baseUrl, providerConfig.apiKey, providerConfig.model, prompt);
      break;
    case "gemini":
      if (!providerConfig.apiKey) {
        throw new Error("Gemini API key is not configured");
      }
      text = await requestGemini(providerConfig.baseUrl, providerConfig.apiKey, providerConfig.model, prompt);
      break;
  }

  const parsed = JSON.parse(extractTextFromJsonBlock(text)) as T;
  return {
    ...parsed,
    text,
    provider: activeProvider,
    model: providerConfig.model,
    visibleProviderLabel: showProviderToUsers ? `${activeProvider} · ${providerConfig.model}` : null
  };
}
