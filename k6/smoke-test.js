/**
 * k6 Smoke Test
 *
 * Quick sanity check to verify the application is running and responsive.
 * Run before deployments to catch obvious issues.
 *
 * Usage:
 *   k6 run k6/smoke-test.js
 *
 * With custom base URL:
 *   k6 run -e BASE_URL=https://staging.example.com k6/smoke-test.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const homepageDuration = new Trend('homepage_duration');
const loginPageDuration = new Trend('login_page_duration');

// Test configuration
export const options = {
  // Smoke test: minimal load
  vus: 5,
  duration: '30s',

  // Thresholds for pass/fail
  thresholds: {
    // 95% of requests should be below 2s
    http_req_duration: ['p(95)<2000'],
    // Error rate should be below 1%
    errors: ['rate<0.01'],
    // Homepage should load fast
    homepage_duration: ['p(95)<1500'],
    // Login page should load fast
    login_page_duration: ['p(95)<1500'],
  },

  // Summary output
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)'],
};

// Get base URL from environment or use default
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  // Test 1: Homepage
  const homepageRes = http.get(`${BASE_URL}/`);
  homepageDuration.add(homepageRes.timings.duration);

  const homepageOk = check(homepageRes, {
    'homepage status is 200': (r) => r.status === 200,
    'homepage loads in < 2s': (r) => r.timings.duration < 2000,
    'homepage has content': (r) => r.body && r.body.length > 0,
  });

  errorRate.add(!homepageOk);

  sleep(1);

  // Test 2: Login page
  const loginRes = http.get(`${BASE_URL}/login`);
  loginPageDuration.add(loginRes.timings.duration);

  const loginOk = check(loginRes, {
    'login page status is 200': (r) => r.status === 200,
    'login page loads in < 2s': (r) => r.timings.duration < 2000,
    'login page has form': (r) => r.body && r.body.includes('email'),
  });

  errorRate.add(!loginOk);

  sleep(1);

  // Test 3: Admin page (should redirect or show auth required)
  const adminRes = http.get(`${BASE_URL}/admin`);

  const adminOk = check(adminRes, {
    'admin page responds': (r) => r.status === 200 || r.status === 302 || r.status === 401,
    'admin page loads in < 2s': (r) => r.timings.duration < 2000,
  });

  errorRate.add(!adminOk);

  sleep(1);
}

// Lifecycle hooks
export function setup() {
  console.log(`Running smoke test against: ${BASE_URL}`);

  // Verify server is reachable
  const res = http.get(`${BASE_URL}/`);
  if (res.status !== 200) {
    throw new Error(`Server not reachable: ${res.status}`);
  }

  return { startTime: new Date().toISOString() };
}

export function teardown(data) {
  console.log(`Smoke test completed. Started at: ${data.startTime}`);
}
