/**
 * Global Ngrok Warning Bypass Interceptor
 * Intercepts all window.fetch and XMLHttpRequest calls to attach the ngrok-skip-browser-warning header
 * and query parameter automatically across the entire app.
 */

const NGROK_HEADER_KEY = 'ngrok-skip-browser-warning';
const NGROK_HEADER_VAL = '69420';

if (typeof window !== 'undefined') {
  // 1. Intercept window.fetch
  if (window.fetch) {
    const originalFetch = window.fetch;
    window.fetch = function (resource, config = {}) {
      let url = typeof resource === 'string' ? resource : resource instanceof URL ? resource.toString() : resource?.url;

      if (url && typeof url === 'string') {
        if (!url.includes('ngrok-skip-browser-warning')) {
          const separator = url.includes('?') ? '&' : '?';
          url = `${url}${separator}${NGROK_HEADER_KEY}=${NGROK_HEADER_VAL}`;
        }
        if (typeof resource === 'string') {
          resource = url;
        }
      }

      config = config || {};
      const headers = new Headers(config.headers || {});
      headers.set(NGROK_HEADER_KEY, NGROK_HEADER_VAL);
      config.headers = headers;

      return originalFetch.call(this, resource, config);
    };
  }

  // 2. Intercept XMLHttpRequest
  if (window.XMLHttpRequest) {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      if (url && typeof url === 'string' && !url.includes('ngrok-skip-browser-warning')) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}${NGROK_HEADER_KEY}=${NGROK_HEADER_VAL}`;
      }
      return originalOpen.call(this, method, url, ...args);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args) {
      try {
        this.setRequestHeader(NGROK_HEADER_KEY, NGROK_HEADER_VAL);
      } catch (e) {}
      return originalSend.apply(this, args);
    };
  }
}

export default true;
