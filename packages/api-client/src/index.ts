import { healthResponseSchema, type ProblemDetails, problemDetailsSchema } from "@hyrum/contracts";

export class ControlPlaneError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = "ControlPlaneError";
  }
}

export interface ControlPlaneClientOptions {
  baseUrl: string;
  getAccessToken?: () => Promise<string | undefined>;
  fetch?: typeof globalThis.fetch;
}

export function createControlPlaneClient(options: ControlPlaneClientOptions) {
  const fetcher = options.fetch ?? globalThis.fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function request(path: string, init: RequestInit = {}) {
    const accessToken = await options.getAccessToken?.();
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

    const response = await fetcher(`${baseUrl}${path}`, { ...init, headers });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => ({
        title: "Control plane request failed",
        status: response.status,
      }));
      throw new ControlPlaneError(problemDetailsSchema.parse(body));
    }
    return response;
  }

  return {
    async health() {
      const response = await request("/health");
      return healthResponseSchema.parse(await response.json());
    },
  };
}
