function fallbackId() {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${randomPart}`;
}

export function createClientId(prefix: string) {
  const cryptoApi = globalThis.crypto;
  const uniquePart =
    cryptoApi && typeof cryptoApi.randomUUID === "function"
      ? cryptoApi.randomUUID()
      : fallbackId();

  return `${prefix}-${uniquePart}`;
}
