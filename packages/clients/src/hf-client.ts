/**
 * Thin client for calling Hugging Face Inference Endpoints.
 * All ML models (deepfake detector, Whisper, BGE-M3, LLM) are hosted
 * externally on HF - this project never loads model weights itself.
 */
export interface HfEndpointConfig {
  url: string;
  token: string;
}

export class HfClient {
  constructor(private readonly config: HfEndpointConfig) {}

  /** Generic JSON-in/JSON-out call, used for embeddings, classification, LLM chat, etc. */
  async post<TResponse = unknown>(payload: unknown): Promise<TResponse> {
    const res = await fetch(this.config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HF endpoint ${this.config.url} failed: ${res.status} ${body}`);
    }

    return (await res.json()) as TResponse;
  }

  /** Binary upload call (e.g. audio bytes to an ASR endpoint). */
  async postBinary<TResponse = unknown>(body: Buffer, contentType: string): Promise<TResponse> {
    const res = await fetch(this.config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.token}`,
        "Content-Type": contentType,
      },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HF endpoint ${this.config.url} failed: ${res.status} ${text}`);
    }

    return (await res.json()) as TResponse;
  }
}

export function hfClientFromEnv(urlEnvVar: string, tokenEnvVar = "HF_API_TOKEN"): HfClient {
  const url = process.env[urlEnvVar];
  const token = process.env[tokenEnvVar];
  if (!url) throw new Error(`Missing env var ${urlEnvVar}`);
  if (!token) throw new Error(`Missing env var ${tokenEnvVar}`);
  return new HfClient({ url, token });
}
