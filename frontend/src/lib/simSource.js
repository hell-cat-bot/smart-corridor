/**
 * Switching between the two worlds.
 *
 * Only one of them may be running at a time. If the browser engine's tick loop
 * kept going while the server was streaming, the two would write to the same
 * store every tick and the map would visibly stutter between them — so the
 * switch always stops one before starting the other.
 */

import useConnectionStore from '../store/useConnectionStore';
import { connectSimBridge, disconnectSimBridge } from '../engine/simBridge';
import { initWorld, pauseSim, resetWorld as resetLocalWorld } from '../engine/simulation';

/** The mode currently in effect, or null before the first switch. */
let applied = null;

/**
 * Brings the app into the mode the connection store says it should be in.
 * Safe to call repeatedly; it only acts when the mode has actually changed.
 */
export async function applySimSource() {
  const source = useConnectionStore.getState().source;
  if (applied === source) return;

  const previous = applied;
  applied = source;

  if (source === 'server') {
    // Stop the local clock first, then let the bridge replace the world.
    pauseSim();
    await connectSimBridge();
    return;
  }

  disconnectSimBridge();

  if (previous === 'server') {
    // The store is full of the server's junctions, units and missions, none of
    // which the local engine knows about — so the seeded world is rebuilt.
    resetLocalWorld();
  } else {
    // First load in local mode: seed the world, but do not announce a "reset"
    // of something that was never running.
    initWorld();
  }
}

/** Changes the mode and applies it. */
export async function setSimSource(source) {
  useConnectionStore.getState().setSource(source);
  await applySimSource();
}

/** Tears everything down — used when the console unmounts. */
export function teardownSimSource() {
  disconnectSimBridge();
  pauseSim();
  applied = null;
}
