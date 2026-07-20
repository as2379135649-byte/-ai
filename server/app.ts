import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createLocalProjectStore } from '../lib/localProjectStore';
import { mountGenerationRoutes, type GenerationProviders } from './generationRoutes';
import { mountProjectRoutes } from './projectsRoutes';
import { mountReferenceImageRoutes } from './referenceImageRoutes';
import { getRuntimeConfigManager, type RuntimeConfigManager } from './runtimeConfig';

const IMAGE2_ENV_KEYS = [
  'IMAGE2_BASE_URL',
  'IMAGE2_API_KEY',
  'IMAGE2_MODEL',
  'IMAGE2_ENDPOINT_TYPE',
] as const;

function isLoopbackRequest(req: express.Request) {
  const address = req.socket.remoteAddress || req.ip || '';
  return address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1';
}

function quoteEnvValue(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function updateEnvText(source: string, updates: Record<string, string>) {
  let text = source;
  for (const key of IMAGE2_ENV_KEYS) {
    const line = `${key}=${quoteEnvValue(updates[key] ?? '')}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(text)) {
      text = text.replace(pattern, line);
    } else {
      if (text && !text.endsWith('\n')) text += '\n';
      text += `${line}\n`;
    }
  }
  return text;
}

function getImage2Status(runtimeConfig: RuntimeConfigManager) {
  const image2 = runtimeConfig.get().image2;
  return {
    configured: image2.missingKeys.length === 0,
    baseUrl: image2.baseUrl,
    model: image2.model,
    endpointType: image2.endpointType,
    missingKeys: image2.missingKeys,
  };
}

export function createApp({
  dataDir,
  providers,
  runtimeConfig = getRuntimeConfigManager(),
  envFilePath = path.resolve(process.cwd(), '.env'),
}: {
  dataDir: string;
  providers: GenerationProviders;
  runtimeConfig?: RuntimeConfigManager;
  envFilePath?: string;
}) {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  app.get('/api/config/status', (req, res) => {
    res.json({
      canEdit: isLoopbackRequest(req),
      image2: getImage2Status(runtimeConfig),
    });
  });

  app.put('/api/config/image2', async (req, res) => {
    if (!isLoopbackRequest(req)) {
      res.status(403).json({ error: '仅允许在服务器本机修改 API 配置。' });
      return;
    }

    const baseUrl = typeof req.body?.baseUrl === 'string' ? req.body.baseUrl.trim() : '';
    const apiKeyInput = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
    const model = typeof req.body?.model === 'string' ? req.body.model.trim() : '';
    const endpointType = req.body?.endpointType === 'chat' ? 'chat' : req.body?.endpointType === 'images' ? 'images' : '';

    if (!baseUrl || !model || !endpointType) {
      res.status(400).json({ error: '请填写接口地址、模型名称和接口类型。' });
      return;
    }

    try {
      const parsed = new URL(baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('invalid protocol');
    } catch {
      res.status(400).json({ error: '接口地址必须是有效的 HTTP 或 HTTPS 地址。' });
      return;
    }

    const current = runtimeConfig.get();
    const apiKey = apiKeyInput || current.image2.apiKey;
    if (!apiKey) {
      res.status(400).json({ error: '首次配置时必须填写 API Key。' });
      return;
    }

    const updates = {
      IMAGE2_BASE_URL: baseUrl,
      IMAGE2_API_KEY: apiKey,
      IMAGE2_MODEL: model,
      IMAGE2_ENDPOINT_TYPE: endpointType,
    };
    const reload = runtimeConfig.reload({ ...current.env, ...updates });
    if (!reload.ok) {
      res.status(400).json({ error: reload.errors.join('；') });
      return;
    }

    try {
      const resolvedPath = path.resolve(envFilePath);
      let source = '';
      try {
        source = await fs.readFile(resolvedPath, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      const temporaryPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temporaryPath, updateEnvText(source, updates), { mode: 0o600 });
      await fs.rename(temporaryPath, resolvedPath);
      res.json({ ok: true, image2: getImage2Status(runtimeConfig) });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : '配置保存失败' });
    }
  });

  mountProjectRoutes(app, createLocalProjectStore(dataDir));
  mountReferenceImageRoutes(app);
  mountGenerationRoutes(app, { providers, runtimeConfig });
  return app;
}
