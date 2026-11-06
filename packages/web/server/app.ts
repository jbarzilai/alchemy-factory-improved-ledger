import Fastify, { type FastifyInstance } from 'fastify';
import { registerApi, type ApiDeps } from './api';
export async function buildApp(deps: ApiDeps): Promise<FastifyInstance> {
  const app = Fastify({ exposeHeadRoutes: false });
  await registerApi(app, deps);
  return app;
}
