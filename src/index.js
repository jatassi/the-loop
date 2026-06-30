// The artifact spine's public surface: schemas, the parse/render round-trip, and the
// injection resolver (address-by-id). See docs/design/design.md (feature: artifact-spine).
export { parse } from './parse.js';
export { render } from './render.js';
export { validate, STATUS } from './schema.js';
export { resolve, resolveIn, extractIndex } from './resolve.js';
export { findBlocks, replaceBlock } from './blocks.js';
