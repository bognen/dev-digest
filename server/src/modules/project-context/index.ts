/**
 * project-context module barrel (SPEC-01). Public surface: the service, its
 * port/domain types and the routes plugin. Repository and checkout stay
 * internal; the composition root (`platform/container.ts`) wires them.
 */
export * from './types.js';
export * from './constants.js';
export { ProjectContextService } from './service.js';
export type { ProjectContextServiceDeps, ProjectContextLogger } from './service.js';
export { default as projectContextRoutes } from './routes.js';
