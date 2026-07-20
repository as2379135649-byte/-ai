import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';

import { createApp } from './app';
import { createRuntimeConfigManager } from './runtimeConfig';

test('local API settings can be saved without exposing the key in status', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'banana-api-route-'));
  const dataDir = path.join(directory, 'data');
  const envFilePath = path.join(directory, '.env');
  const runtimeConfig = createRuntimeConfigManager({
    IMAGE2_BASE_URL: 'https://old.example/v1',
    IMAGE2_MODEL: 'gpt-image-2',
  });
  const app = createApp({
    dataDir,
    envFilePath,
    runtimeConfig,
    providers: {
      generateBananaImage: async () => 'data:image/png;base64,banana',
      generateImage2Image: async () => 'data:image/png;base64,image2',
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const initialResponse = await fetch(`${baseUrl}/api/config/status`);
    assert.equal(initialResponse.status, 200);
    const initialStatus = await initialResponse.json() as any;
    assert.equal(initialStatus.canEdit, true);
    assert.equal(initialStatus.image2.configured, false);
    assert.equal(JSON.stringify(initialStatus).includes('apiKey'), false);

    const saveResponse = await fetch(`${baseUrl}/api/config/image2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseUrl: 'https://relay.example/v1',
        apiKey: 'secret-test-key',
        model: 'gpt-image-2',
        endpointType: 'images',
      }),
    });
    assert.equal(saveResponse.status, 200);

    const envText = await fs.readFile(envFilePath, 'utf8');
    assert.match(envText, /IMAGE2_API_KEY="secret-test-key"/);

    const statusResponse = await fetch(`${baseUrl}/api/config/status`);
    assert.equal(statusResponse.status, 200);
    const statusText = await statusResponse.text();
    assert.equal(statusText.includes('secret-test-key'), false);
    const status = JSON.parse(statusText);
    assert.equal(status.image2.configured, true);
    assert.equal(status.image2.baseUrl, 'https://relay.example/v1');

    const blockedReferenceResponse = await fetch(`${baseUrl}/api/reference-images/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1/private.png' }),
    });
    assert.equal(blockedReferenceResponse.status, 400);
    assert.match(
      (await blockedReferenceResponse.json() as { error: string }).error,
      /不能读取本机或局域网地址/
    );
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
