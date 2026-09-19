import { isIP } from "node:net";

const HOSTNAME =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/**
 * Validates server-configured, externally reachable HTTPS base endpoints.
 * It deliberately rejects credentials, local names, IP literals, query strings,
 * and non-standard ports so configuration cannot turn an outbound adapter into
 * a generic SSRF primitive.
 */
export function parseExternalHttpsBaseUrl(
  value: string,
  variableName: string,
): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid HTTPS URL`);
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.port ||
    !HOSTNAME.test(hostname) ||
    isIP(hostname) !== 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error(`${variableName} must be a public HTTPS base URL`);
  }

  return url;
}
