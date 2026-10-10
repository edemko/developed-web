// App-specific switch hooks. A hook runs after the new unit passed its health checks:
//   after(ctx, onUndo) — ctx = { config, name, side, release, sha, oldUnit, newUnit }.
// Register the undo with onUndo() BEFORE any step that can fail, so the caller can restore
// the old unit first and then unwind the hook.
import { kestrekNotifications } from './kestrek-notifications.mjs';

export const hooks = {
  'kestrek-notifications': kestrekNotifications,
};
