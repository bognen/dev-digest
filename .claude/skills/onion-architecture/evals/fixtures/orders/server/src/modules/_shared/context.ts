import type { FastifyRequest } from 'fastify';
import type { Container } from '../../platform/container.js';

export async function getContext(container: Container, req: FastifyRequest) {
  const user = await container.auth.resolve(req.headers.authorization);
  return { workspaceId: user.workspaceId, userId: user.id };
}
