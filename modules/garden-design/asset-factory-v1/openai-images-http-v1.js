/**
 * Images API HTTP client for owner-approved factory runs.
 * Lives outside provider-adapter-v1 so architecture-only adapters stay network-free.
 */
import https from 'node:https';

export const OPENAI_IMAGES_GENERATIONS_URL = 'https://api.openai.com/v1/images/generations';

export function postOpenAiImagesJson(urlString, apiKey, body) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(JSON.stringify(body));
    const url = new URL(urlString);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname,
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + apiKey,
          'Content-Type': 'application/json',
          'Content-Length': payload.length
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = { error: { message: 'non_json_response', status: res.statusCode } };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}
