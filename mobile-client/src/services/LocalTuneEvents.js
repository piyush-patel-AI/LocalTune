/**
 * LocalTuneEvents
 * Namespaced pub-sub event bus for platform playback, queue, metadata, and bridge events.
 */

class LocalTuneEventBus {
  constructor() {
    this.listeners = new Map();
    this.subscribers = new Set(); // Global observers for native Android wrappers
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    // Return cleanup function
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  emit(event, payload = {}) {
    const eventData = {
      event,
      timestamp: Date.now(),
      payload
    };

    // Notify specific event listeners
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => {
        try {
          cb(payload, eventData);
        } catch (err) {
          console.error(`[LocalTuneEvents] Error in listener for ${event}:`, err);
        }
      });
    }

    // Notify global subscribers (Native Android wrappers)
    this.subscribers.forEach((cb) => {
      try {
        cb(eventData);
      } catch (err) {
        console.error('[LocalTuneEvents] Error in global subscriber:', err);
      }
    });
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.unsubscribe(callback);
  }

  unsubscribe(callback) {
    this.subscribers.delete(callback);
  }

  clear() {
    this.listeners.clear();
    this.subscribers.clear();
  }
}

export const LocalTuneEvents = new LocalTuneEventBus();
export default LocalTuneEvents;
