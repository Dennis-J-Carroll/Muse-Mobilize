// Register TypeScript in the worker itself; parent loader hooks are not inherited.
import { register } from 'tsx/esm/api';
register();
await import('./archive-worker.ts');
