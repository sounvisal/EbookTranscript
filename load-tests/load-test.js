import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';

// Read target URL from environment or default to localhost:3000
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '15s', target: 10 }, // Ramp-up to 10 users over 15s
    { duration: '30s', target: 25 }, // Ramp-up to 25 users over 30s
    { duration: '30s', target: 25 }, // Stay at 25 users for 30s
    { duration: '15s', target: 0 },  // Ramp-down to 0 users
  ],
  thresholds: {
    // 95% of all HTTP requests must complete under 1000ms
    http_req_duration: ['p(95)<1000'],
    // Less than 1% of HTTP requests should fail
    http_req_failed: ['rate<0.01'],
    // 99% of custom checks must pass
    checks: ['rate>0.99'],
  },
};

export default function () {
  // 1. Home Page Flow
  group('Home Page', function () {
    const res = http.get(`${BASE_URL}/`);
    check(res, {
      'Home: status 200': (r) => r.status === 200,
      'Home: response time < 800ms': (r) => r.timings.duration < 800,
    });
  });

  sleep(1);

  // 2. Formats Page Flow
  group('Formats Page', function () {
    const res = http.get(`${BASE_URL}/formats`);
    check(res, {
      'Formats: status 200': (r) => r.status === 200,
      'Formats: response time < 800ms': (r) => r.timings.duration < 800,
    });
  });

  sleep(1);

  // 3. Login Page Flow
  group('Auth Pages', function () {
    const resLogin = http.get(`${BASE_URL}/login`);
    check(resLogin, {
      'Login: status 200': (r) => r.status === 200,
    });

    const resRegister = http.get(`${BASE_URL}/login?mode=register`);
    check(resRegister, {
      'Register: status 200': (r) => r.status === 200,
    });
  });

  sleep(2);
}

// Generates both console summary and an interactive HTML report
export function handleSummary(data) {
  return {
    'load-tests/report.html': htmlReport(data),
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
