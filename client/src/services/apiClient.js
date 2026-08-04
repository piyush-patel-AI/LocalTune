/**
 * LocalTune Unified API Client
 * Automatically injects the ngrok-skip-browser-warning header into all backend HTTP requests.
 */

const NGROK_HEADER_KEY = 'ngrok-skip-browser-warning';
const NGROK_HEADER_VAL = '69420';

async function request(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set(NGROK_HEADER_KEY, NGROK_HEADER_VAL);

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const config = {
    credentials: 'include',
    ...options,
    headers
  };

  const response = await fetch(endpoint, config);

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData && errorData.error) {
        errorMessage = errorData.error;
      }
    } catch (e) {}
    const err = new Error(errorMessage);
    err.status = response.status;
    throw err;
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

export const apiClient = {
  get(endpoint, headers = {}) {
    return request(endpoint, { method: 'GET', headers });
  },

  post(endpoint, body = {}, headers = {}) {
    return request(endpoint, {
      method: 'POST',
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  },

  put(endpoint, body = {}, headers = {}) {
    return request(endpoint, {
      method: 'PUT',
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  },

  patch(endpoint, body = {}, headers = {}) {
    return request(endpoint, {
      method: 'PATCH',
      headers,
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  },

  delete(endpoint, headers = {}) {
    return request(endpoint, { method: 'DELETE', headers });
  },

  upload(endpoint, formData, headers = {}) {
    return request(endpoint, {
      method: 'POST',
      headers,
      body: formData
    });
  }
};

export default apiClient;
