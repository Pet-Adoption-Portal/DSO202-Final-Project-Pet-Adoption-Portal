// Configuration from environment variables (12-factor). Kubernetes sets these from a
// ConfigMap (plain values) and a Secret (passwords). Nothing is hard-coded per environment.

const env = process.env;

/** Reads the service's settings. `name` is the service name, e.g. "pet". */
export function loadConfig(name) {
  const serviceName = env.SERVICE_NAME || name;
  return {
    serviceName,
    version: env.SERVICE_VERSION || '0.0.0-dev',
    port: Number(env.PORT || 8080),
    logLevel: env.LOG_LEVEL || 'info',
    environment: env.APP_ENV || 'local',

    // PostgreSQL: one database, one schema + role per service (proposal decision D2).
    databaseUrl: env.DATABASE_URL || '',
    dbSchema: env.DB_SCHEMA || serviceName.replace(/-/g, '_'),
    dbPoolMax: Number(env.DB_POOL_MAX || 5), // keep replicas x pool size under Postgres max_connections
    runMigrations: (env.RUN_MIGRATIONS || 'true') === 'true',

    // Redis Streams for events.
    redisUrl: env.REDIS_URL || '',

    // etcd service registry (proposal decision D4). Empty = registry disabled.
    etcdEndpoints: (env.ETCD_ENDPOINTS || '').split(',').map((s) => s.trim()).filter(Boolean),
    registryTtlSeconds: Number(env.REGISTRY_TTL_SECONDS || 10),
    // Address other services use to reach this instance. In Kubernetes: the pod IP from the downward API.
    advertiseAddress: env.POD_IP ? `${env.POD_IP}:${env.PORT || 8080}` : `127.0.0.1:${env.PORT || 8080}`,
    instanceId: env.HOSTNAME || `${serviceName}-${process.pid}`,

    // After SIGTERM, keep serving this long while /ready says 503, so Kubernetes removes the pod from the
    // Service before we stop accepting connections. 0 locally; about 5000 in the cluster (zero-downtime, E5).
    shutdownDelayMs: Number(env.SHUTDOWN_DELAY_MS || 0),
    shutdownTimeoutMs: Number(env.SHUTDOWN_TIMEOUT_MS || 20000),
  };
}

/** Same config with passwords removed, safe to log at startup. */
export function redact(config) {
  return { ...config, databaseUrl: config.databaseUrl.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@'), redisUrl: config.redisUrl.replace(/:[^:@/]+@/, ':***@') };
}
