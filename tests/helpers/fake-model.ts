import { ModelRefusalError, type StructuredModel, type StructuredRequest } from "@/agent/model";

type Scripted = unknown | Error | ((request: StructuredRequest) => unknown);

/**
 * Deterministic stand-in for the reasoning model. Responses are scripted per
 * structured-output name; an array is consumed one entry per call so tests can
 * script "invalid, then valid" sequences.
 */
export class FakeModel implements StructuredModel {
  readonly calls: StructuredRequest[] = [];
  private readonly queues = new Map<string, Scripted[]>();

  constructor(script: Record<string, Scripted | Scripted[]> = {}) {
    for (const [name, value] of Object.entries(script)) this.set(name, value);
  }

  set(name: string, value: Scripted | Scripted[]): this {
    this.queues.set(name, Array.isArray(value) ? [...value] : [value]);
    return this;
  }

  callsFor(name: string): StructuredRequest[] {
    return this.calls.filter((call) => call.name === name);
  }

  async generate(request: StructuredRequest): Promise<unknown> {
    this.calls.push(request);
    const queue = this.queues.get(request.name);
    if (!queue || queue.length === 0) {
      throw new Error(`FakeModel: no scripted response for "${request.name}"`);
    }
    // Keep the last entry so repeated calls reuse it.
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return typeof next === "function" ? (next as (r: StructuredRequest) => unknown)(request) : next;
  }
}

export const refusal = () => new ModelRefusalError();

export const fixedNow = () => new Date("2026-09-26T10:00:00.000Z");
