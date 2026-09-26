const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isAllowedOrigin(requestOrigin: string | null, appBaseUrl: string) {
  if (!requestOrigin) return false;
  let requestUrl: URL;
  let appUrl: URL;
  try {
    requestUrl = new URL(requestOrigin);
    appUrl = new URL(appBaseUrl);
  } catch {
    return false;
  }
  if (requestUrl.origin === appUrl.origin) return true;
  return requestUrl.protocol === appUrl.protocol
    && requestUrl.port === appUrl.port
    && loopbackHosts.has(requestUrl.hostname)
    && loopbackHosts.has(appUrl.hostname);
}
