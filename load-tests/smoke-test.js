import http from 'k6/http';
import { check, sleep } from 'k6';

// Read target URL from environment or default to localhost:3000
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:3000';

export const options = {
  vus: 3,           // 3 concurrent virtual users
  duration: '10s',  // run for 10 seconds
  thresholds: {
    http_req_duration: ['p(95)<1500'], // 95% of requests must finish within 1.5s
    http_req_failed: ['rate<0.01'],    // less than 1% failed requests
  },
};

export default function () {
  // Test Homepage
  const resHome = http.get(`${BASE_URL}/`);
  check(resHome, {
    'Home page status is 200': (r) => r.status === 200,
    'Home page loads quickly (< 1000ms)': (r) => r.timings.duration < 1000,
  });

  sleep(1);

  // Test Formats page
  const resFormats = http.get(`${BASE_URL}/formats`);
  check(resFormats, {
    'Formats page status is 200': (r) => r.status === 200,
  });

  sleep(1);

  // Test Login page
  const resLogin = http.get(`${BASE_URL}/login`);
  check(resLogin, {
    'Login page status is 200': (r) => r.status === 200,
  });

  sleep(1);
}
