/**
 * LocalTune Unified API Client
 * Automatically prepends the production API base URL to all backend requests.
 */

import { apiUrl } from '../config';

async function request(endpoint, options = {}) {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const config = {
    credentials: 'include',
    ...options,
    headers
  };

  const response = await fetch(apiUrl(endpoint), config);

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
