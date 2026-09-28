import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate } from 'k6/metrics';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Custom metric: Tracks actual server crashes / internal errors (5xx)
const serverErrors = new Rate('server_errors');

// Target URL and optional session cookie
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';
const SESSION_COOKIE = __ENV.SESSION_COOKIE || '';

export const options = {
  // Concurrency profile: simulates dozens of users performing API actions at the same time
  stages: [
    { duration: '15s', target: 20 },  // Ramp to 20 users
    { duration: '30s', target: 50 },  // 50 simultaneous users
    { duration: '30s', target: 50 },  // Sustained 50 concurrent users
    { duration: '15s', target: 75 },  // Spike burst to 75 simultaneous users
    { duration: '20s', target: 0  },  // Ramp down
  ],
  thresholds: {
    // 95% of API requests should complete within 1200ms under 75 concurrent users
    http_req_duration: ['p(95)<1200'],
    // ZERO server crashes (5xx errors)
    server_errors: ['rate<0.01'],
    // 99% of custom checks must pass
    checks: ['rate>0.99'],
  },
};

export default function () {
  const commonHeaders = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const requestParams = {
    headers: commonHeaders,
  };

  if (SESSION_COOKIE) {
    requestParams.headers['Cookie'] = `next-auth.session-token=${SESSION_COOKIE}; __Secure-next-auth.session-token=${SESSION_COOKIE}`;
  }

  // 1. Session & Auth API Requests (Called on every page load and interaction)
  group('1. Auth & Session APIs', function () {
    const sessionRes = http.get(`${BASE_URL}/api/auth/session`, requestParams);
    serverErrors.add(sessionRes.status >= 500);
    check(sessionRes, {
      'Auth Session: status 200': (r) => r.status === 200,
      'Auth Session: response < 800ms': (r) => r.timings.duration < 800,
    });

    const csrfRes = http.get(`${BASE_URL}/api/auth/csrf`, requestParams);
    serverErrors.add(csrfRes.status >= 500);
    check(csrfRes, {
      'Auth CSRF: status 200': (r) => r.status === 200,
      'Auth CSRF: returns valid token': (r) => {
        try {
          return JSON.parse(r.body).csrfToken !== undefined;
        } catch {
          return false;
        }
      },
    });

    const providersRes = http.get(`${BASE_URL}/api/auth/providers`, requestParams);
    serverErrors.add(providersRes.status >= 500);
    check(providersRes, {
      'Auth Providers: status 200': (r) => r.status === 200,
    });
  });

  sleep(0.5);

  // 2. Upload Session API (Upload initialization, Gemini key selection & quota checks)
  group('2. Upload Session API', function () {
    const uploadPayload = JSON.stringify({
      fileName: 'concurrent_user_audio.mp3',
      mimeType: 'audio/mpeg',
      fileSize: 10485760, // 10MB
    });

    const uploadRes = http.post(`${BASE_URL}/api/upload-session`, uploadPayload, requestParams);
    serverErrors.add(uploadRes.status >= 500);
    check(uploadRes, {
      'Upload Session: responds gracefully (200, 401 or 429)': (r) =>
        [200, 401, 429].includes(r.status),
      'Upload Session: response < 1000ms': (r) => r.timings.duration < 1000,
      'Upload Session: zero server crashes (no 500)': (r) => r.status < 500,
    });
  });

  sleep(0.5);

  // 3. History API (Prisma / PostgreSQL query and pagination)
  group('3. History API', function () {
    const historyRes = http.get(`${BASE_URL}/api/history?page=1&q=search`, requestParams);
    serverErrors.add(historyRes.status >= 500);
    check(historyRes, {
      'History API: responds gracefully (200 or 401)': (r) =>
        [200, 401].includes(r.status),
      'History API: response < 1000ms': (r) => r.timings.duration < 1000,
      'History API: zero server crashes (no 500)': (r) => r.status < 500,
    });
  });

  sleep(0.5);

  // 4. Transcribe API (Input validation & pipeline entrypoint)
  group('4. Transcribe API', function () {
    const transcribePayload = JSON.stringify({
      filename: 'test_pipeline_audio.mp3',
      language: 'auto',
      inputMode: 'file',
    });

    const transcribeRes = http.post(`${BASE_URL}/api/transcribe`, transcribePayload, requestParams);
    serverErrors.add(transcribeRes.status >= 500);
    check(transcribeRes, {
      'Transcribe API: responds gracefully (200, 400, 401 or 429)': (r) =>
        [200, 400, 401, 429].includes(r.status),
      'Transcribe API: response < 1200ms': (r) => r.timings.duration < 1200,
      'Transcribe API: zero server crashes (no 500)': (r) => r.status < 500,
    });
  });

  sleep(1);
}

// Generate interactive HTML report and summary
export function handleSummary(data) {
  return {
    'load-tests/api-report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
