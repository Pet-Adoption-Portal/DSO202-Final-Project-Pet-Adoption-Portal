// Prometheus metrics. Every service exposes the same RED metrics (Rate, Errors, Duration)
// with the same names and labels, so one Grafana dashboard works for all 15.
import client from 'prom-client';

export function createMetrics(serviceName) {
  const registry = new client.Registry();
  registry.setDefaultLabels({ service: serviceName });
  client.collectDefaultMetrics({ register: registry }); // CPU, memory, event-loop lag, GC

  const httpRequests = new client.Counter({
    name: 'http_requests_total',
    help: 'HTTP requests handled, by method, route template and status code',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const events = new client.Counter({
    name: 'events_total',
    help: 'Stream events published or consumed',
    labelNames: ['stream', 'direction', 'result'],
    registers: [registry],
  });

  return {
    registry,
    httpRequests,
    httpDuration,
    events,
    /** Lets a service add its own business metric, e.g. adoption_applications_total. */
    counter: (name, help, labelNames = []) => new client.Counter({ name, help, labelNames, registers: [registry] }),
    gauge: (name, help, labelNames = []) => new client.Gauge({ name, help, labelNames, registers: [registry] }),
  };
}
