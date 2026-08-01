import {
  buildAllowedCorsOrigins,
  CorsConfigReader,
  isCorsOriginAllowed,
} from './cors-policy';

describe('CORS policy', () => {
  const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
  const values: Record<string, string> = {
    DASHBOARD_URL: 'https://app.applyai.example/path',
    CORS_ALLOWED_ORIGINS:
      'https://preview.applyai.example/, https://staging.applyai.example',
    EXTENSION_ID: extensionId,
  };
  const config = {
    get: <T>(key: string, fallback?: T) =>
      (key in values ? values[key] : fallback) as T,
  } satisfies CorsConfigReader;

  it('allows only exact configured web and extension origins', () => {
    const allowed = buildAllowedCorsOrigins(config);

    expect(isCorsOriginAllowed('https://app.applyai.example', allowed)).toBe(
      true,
    );
    expect(
      isCorsOriginAllowed('https://preview.applyai.example', allowed),
    ).toBe(true);
    expect(
      isCorsOriginAllowed(`chrome-extension://${extensionId}`, allowed),
    ).toBe(true);
    expect(isCorsOriginAllowed('https://evil.applyai.example', allowed)).toBe(
      false,
    );
    expect(
      isCorsOriginAllowed(
        'https://app.applyai.example.attacker.example',
        allowed,
      ),
    ).toBe(false);
  });

  it('allows non-browser requests without trusting a supplied browser origin', () => {
    const allowed = buildAllowedCorsOrigins(config);

    expect(isCorsOriginAllowed(undefined, allowed)).toBe(true);
    expect(isCorsOriginAllowed('null', allowed)).toBe(false);
  });

  it('rejects credential-bearing origins and malformed extension IDs', () => {
    const invalidWebConfig = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'DASHBOARD_URL'
          ? 'https://user:secret@app.applyai.example'
          : fallback) as T,
    } satisfies CorsConfigReader;
    const invalidExtensionConfig = {
      get: <T>(key: string, fallback?: T) =>
        (key === 'DASHBOARD_URL'
          ? 'https://app.applyai.example'
          : key === 'EXTENSION_ID'
            ? 'not-a-valid-extension-id'
            : fallback) as T,
    } satisfies CorsConfigReader;

    expect(() => buildAllowedCorsOrigins(invalidWebConfig)).toThrow(
      'credential-free HTTP(S) origins',
    );
    expect(() => buildAllowedCorsOrigins(invalidExtensionConfig)).toThrow(
      '32-character Chrome extension ID',
    );
  });
});
