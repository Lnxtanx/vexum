// public/js/timeTracker.js

import { supabase } from './supabase.js';

let localSessionSeconds = 0; // time spent on current page (this session)
let totalTimeSeconds = 0;    // total from DB logs
let userId = null;
let oneSecondInterval = null;
let heartbeatInterval = null;
const HEARTBEAT_INTERVAL = 30; // seconds

/**
 * Initialize the site-wide time tracker.
 * - Checks if user is logged in
 * - Fetches existing total from user_time_logs
 * - Starts counting + heartbeat
 */
export async function initTimeTracker() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.log("User not logged in; not tracking time.");
    return;
  }

  userId = session.user.id;
  await fetchTotalTimeSoFar();
  startCounting();

  // (Optional) Save leftover chunk on page unload
  window.addEventListener('beforeunload', async () => {
    await storeTimeChunk();
  });
}

/**
 * Fetch total so far from user_time_logs and store in totalTimeSeconds
 */
async function fetchTotalTimeSoFar() {
  const { data: logs, error } = await supabase
    .from('user_time_logs')
    .select('chunk_seconds')
    .eq('user_id', userId);

  if (error) {
    console.error("Error fetching user time logs:", error.message);
    return;
  }

  if (logs && logs.length > 0) {
    totalTimeSeconds = logs.reduce((sum, row) => sum + row.chunk_seconds, 0);
  }
  console.log("Existing totalTimeSeconds:", totalTimeSeconds);
}

/**
 * Start local timers:
 *  - 1-second interval to increment localSessionSeconds
 *  - 30-second (HEARTBEAT_INTERVAL) interval to store chunk to DB
 */
function startCounting() {
  // Increments localSessionSeconds every second
  oneSecondInterval = setInterval(() => {
    localSessionSeconds++;
  }, 1000);

  // Every 30s, store chunk
  heartbeatInterval = setInterval(() => {
    storeTimeChunk();
  }, HEARTBEAT_INTERVAL * 1000);
}

/**
 * Store localSessionSeconds to DB, then reset localSessionSeconds
 */
async function storeTimeChunk() {
  if (!userId || localSessionSeconds <= 0) return;

  const { error } = await supabase
    .from('user_time_logs')
    .insert({
      user_id: userId,
      chunk_seconds: localSessionSeconds
    });

  if (error) {
    console.error("Error saving time chunk:", error.message);
  } else {
    totalTimeSeconds += localSessionSeconds;
    localSessionSeconds = 0;
    console.log("Time chunk stored; new total:", totalTimeSeconds);
  }
}

/**
 * Returns DB total + current session
 */
export function getCurrentTotalSeconds() {
  return totalTimeSeconds + localSessionSeconds;
}
