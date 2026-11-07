// e2e_tests/helpers/apiClient.js
import { config } from '../config.js';

export class ApiClient {
  constructor(baseUrl = config.baseUrl) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = null;
  }

  setBaseUrl(newUrl) {
    this.baseUrl = newUrl.replace(/\/+$/, '');
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  async request(method, path, body = null, customHeaders = {}) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    const headers = { ...customHeaders };

    if (body !== null && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.token && !headers['Authorization'] && !headers['authorization']) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const options = {
      method,
      headers
    };

    if (body !== null) {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);
      const rawText = await response.text();
      let data = null;

      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch {
        data = rawText;
      }

      return {
        status: response.status,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        data,
        rawText
      };
    } catch (err) {
      return {
        status: 0,
        ok: false,
        headers: {},
        data: null,
        error: err.message,
        rawText: ''
      };
    }
  }

  get(path, headers = {}) {
    return this.request('GET', path, null, headers);
  }

  post(path, body, headers = {}) {
    return this.request('POST', path, body, headers);
  }

  put(path, body, headers = {}) {
    return this.request('PUT', path, body, headers);
  }

  patch(path, body, headers = {}) {
    return this.request('PATCH', path, body, headers);
  }

  delete(path, headers = {}) {
    return this.request('DELETE', path, null, headers);
  }
}

export const defaultClient = new ApiClient();
export default defaultClient;

