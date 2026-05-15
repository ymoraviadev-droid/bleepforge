// Public surface of the projects module. Other server modules go through
// these entry points; the registry + migration files are implementation
// detail.

export * from "./registry.js";
export * from "./migrate.js";
export { projectsRouter } from "./router.js";
