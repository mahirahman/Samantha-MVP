import { vi } from "vitest";

/** A fluent query stub: configure the response, while testing real application mapping. */
export function queryMock(data: unknown = [], error: unknown = null) {
  const response = { data, error };
  const query = {
    select: vi.fn(), order: vi.fn(), eq: vi.fn(), neq: vi.fn(), or: vi.fn(),
    range: vi.fn(), ilike: vi.fn(), insert: vi.fn(), upsert: vi.fn(),
    update: vi.fn(), delete: vi.fn(), in: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
    then: (resolve: (result: typeof response) => unknown) => Promise.resolve(response).then(resolve),
  };
  for (const [key, method] of Object.entries(query)) {
    if (key !== "then") (method as ReturnType<typeof vi.fn>).mockReturnValue(query);
  }
  return { query, response };
}
