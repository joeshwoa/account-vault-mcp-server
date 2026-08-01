interface GoogleApiErrorShape {
  code?: number;
  response?: { status?: number; data?: { error?: { message?: string } } };
  message?: string;
}

export function describeGmailError(error: unknown): string {
  const err = error as GoogleApiErrorShape;
  const status = err?.response?.status ?? err?.code;
  const detail = err?.response?.data?.error?.message ?? err?.message ?? String(error);

  switch (status) {
    case 401:
    case 403:
      return (
        `Error: Gmail rejected the request (${status}: ${detail}). The stored token may have been revoked ` +
        `— re-add the account with "node dist/cli.js add gmail <label>".`
      );
    case 404:
      return `Error: Not found (${detail}). Double-check the message/thread/draft id.`;
    case 429:
      return `Error: Gmail rate limit hit (${detail}). Wait a moment and retry.`;
    default:
      return `Error: Gmail request failed${status ? ` (${status})` : ""}: ${detail}`;
  }
}
