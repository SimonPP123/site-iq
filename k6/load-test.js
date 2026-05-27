/**
 * k6 Load Test
 *
 * Simulates realistic user load to test application performance under stress.
 * Tests multiple endpoints with varying load patterns.
 *
 * Usage:
 *   k6 run k6/load-test.js
 *
 * With options:
 *   k6 run -e BASE_URL=https://staging.example.com -e VUS=50 k6/load-test.js
 *
 * Generate HTML report:
 *   k6 run --out json=results.json k6/load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const pageLoadTrend = new Trend('page_load_time');
const apiLatencyTrend = new Trend('api_latency');
const requestsPerPage = new Counter('requests_per_page');

// Test configuration
export const options = {
  // Load test stages: ramp up, sustain, ramp down
  stages: [
    { duration: '30s', target: 20 },   // Ramp up to 20 users
    { duration: '1m', target: 50 },    // Ramp up to 50 users
    { duration: '2m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 100 },  // Spike to 100 users
    { duration: '1m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],

  // Thresholds
  thresholds: {
    // Response time
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    // Error rate
    errors: ['rate<0.05'], // Less than 5% errors
    // Custom metrics
    page_load_time: ['p(95)<2500'],
    api_latency: ['p(95)<500'],
  },

  // Tags
  tags: {
    testType: 'load',
  },
};

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// User scenarios
const scenarios = {
  browseHomepage: 0.35,   // 35% browse the landing page
  viewSample: 0.25,       // 25% open the public sample report (/sample)
  viewLogin: 0.2,         // 20% view login
  apiHealth: 0.1,         // 10% hit the liveness endpoint
  auditGate: 0.1,         // 10% probe the audit gate (must reject unauthenticated)
};

export default function () {
  const scenario = selectScenario();

  switch (scenario) {
    case 'browseHomepage':
      browseHomepage();
      break;
    case 'viewSample':
      viewSample();
      break;
    case 'viewLogin':
      viewLogin();
      break;
    case 'apiHealth':
      apiHealth();
      break;
    case 'auditGate':
      auditGate();
      break;
  }
}

function selectScenario() {
  const rand = Math.random();
  let cumulative = 0;

  for (const [scenario, probability] of Object.entries(scenarios)) {
    cumulative += probability;
    if (rand < cumulative) {
      return scenario;
    }
  }

  return 'browseHomepage';
}

function browseHomepage() {
  group('Homepage Browse', () => {
    const startTime = new Date();

    const res = http.get(`${BASE_URL}/`, {
      tags: { page: 'homepage' },
    });

    const loadTime = new Date() - startTime;
    pageLoadTrend.add(loadTime);
    requestsPerPage.add(1);

    const success = check(res, {
      'homepage status 200': (r) => r.status === 200,
      'homepage shows Site IQ brand': (r) => r.body && r.body.includes('Site IQ'),
      'homepage loads < 3s': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!success);

    // Simulate user reading the page
    sleep(randomBetween(2, 5));
  });
}

function viewLogin() {
  group('Login Page', () => {
    const startTime = new Date();

    const res = http.get(`${BASE_URL}/login`, {
      tags: { page: 'login' },
    });

    const loadTime = new Date() - startTime;
    pageLoadTrend.add(loadTime);
    requestsPerPage.add(1);

    const success = check(res, {
      'login page status 200': (r) => r.status === 200,
      'login page has form': (r) => r.body && r.body.includes('email'),
      'login page loads < 2s': (r) => r.timings.duration < 2000,
    });

    errorRate.add(!success);

    // Simulate user looking at form
    sleep(randomBetween(3, 8));
  });
}

function viewSample() {
  group('Public Sample Report', () => {
    const startTime = new Date();

    const res = http.get(`${BASE_URL}/sample`, {
      tags: { page: 'sample' },
    });

    const loadTime = new Date() - startTime;
    pageLoadTrend.add(loadTime);
    requestsPerPage.add(1);

    const success = check(res, {
      'sample status 200': (r) => r.status === 200,
      'sample report rendered': (r) => r.body && r.body.includes('Sample report'),
      'sample loads < 3s': (r) => r.timings.duration < 3000,
    });

    errorRate.add(!success);

    // Simulate a visitor reading the report
    sleep(randomBetween(2, 6));
  });
}

function apiHealth() {
  group('Health (liveness)', () => {
    const res = http.get(`${BASE_URL}/api/health`, {
      tags: { endpoint: 'health' },
    });

    apiLatencyTrend.add(res.timings.duration);
    requestsPerPage.add(1);

    const success = check(res, {
      'health status 200': (r) => r.status === 200,
      'health reports ok': (r) => r.body && r.body.includes('"status":"ok"'),
      'health latency < 500ms': (r) => r.timings.duration < 500,
    });

    errorRate.add(!success);

    sleep(randomBetween(1, 3));
  });
}

// The audit endpoint is the only expensive path - each run costs a Firecrawl + OpenAI bill - so a load
// test must NEVER trigger a real audit. Instead we verify the auth gate REJECTS an unauthenticated
// request, which it does (HTTP 401) before any DNS/credit/n8n spend. This asserts the protective layer
// holds under load at zero cost.
function auditGate() {
  group('Audit Gate (unauthenticated)', () => {
    const res = http.post(
      `${BASE_URL}/api/audit`,
      JSON.stringify({ domain: 'example.com' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'audit-gate' },
      }
    );

    apiLatencyTrend.add(res.timings.duration);
    requestsPerPage.add(1);

    const success = check(res, {
      'audit rejects unauthenticated (401)': (r) => r.status === 401,
      'audit gate latency < 1s': (r) => r.timings.duration < 1000,
    });

    errorRate.add(!success);

    sleep(randomBetween(1, 2));
  });
}

// Utility functions
function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

// Lifecycle hooks
export function setup() {
  console.log('='.repeat(50));
  console.log('Load Test Configuration');
  console.log('='.repeat(50));
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Max VUs: 100`);
  console.log(`Duration: ~5 minutes`);
  console.log('='.repeat(50));

  // Verify server is up
  const res = http.get(`${BASE_URL}/`);
  if (res.status !== 200) {
    throw new Error(`Server not responding: ${res.status}`);
  }

  return {
    startTime: new Date().toISOString(),
    baseUrl: BASE_URL,
  };
}

export function teardown(data) {
  console.log('='.repeat(50));
  console.log('Load Test Complete');
  console.log('='.repeat(50));
  console.log(`Started: ${data.startTime}`);
  console.log(`Ended: ${new Date().toISOString()}`);
  console.log(`Base URL: ${data.baseUrl}`);
  console.log('='.repeat(50));
}

// Summary handler for custom output
export function handleSummary(data) {
  return {
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
    'k6-summary.json': JSON.stringify(data, null, 2),
  };
}

function textSummary(data, options) {
  const checks = data.root_group.checks || [];
  const metrics = data.metrics || {};

  let output = '\n';
  output += '='.repeat(60) + '\n';
  output += 'LOAD TEST SUMMARY\n';
  output += '='.repeat(60) + '\n\n';

  // Checks summary
  output += 'CHECKS:\n';
  for (const check of checks) {
    const passRate = (check.passes / (check.passes + check.fails) * 100).toFixed(1);
    const status = check.fails === 0 ? 'PASS' : 'FAIL';
    output += `  [${status}] ${check.name}: ${passRate}% (${check.passes}/${check.passes + check.fails})\n`;
  }

  output += '\nKEY METRICS:\n';

  // HTTP duration
  if (metrics.http_req_duration) {
    const duration = metrics.http_req_duration.values;
    output += `  http_req_duration:\n`;
    output += `    avg: ${duration.avg?.toFixed(2)}ms\n`;
    output += `    p95: ${duration['p(95)']?.toFixed(2)}ms\n`;
    output += `    p99: ${duration['p(99)']?.toFixed(2)}ms\n`;
  }

  // Error rate
  if (metrics.errors) {
    const errors = metrics.errors.values;
    output += `  error_rate: ${(errors.rate * 100).toFixed(2)}%\n`;
  }

  // Requests
  if (metrics.http_reqs) {
    output += `  total_requests: ${metrics.http_reqs.values.count}\n`;
    output += `  requests/sec: ${metrics.http_reqs.values.rate?.toFixed(2)}\n`;
  }

  output += '\n' + '='.repeat(60) + '\n';

  return output;
}
