import Prometheus from 'prom-client';
import { logger } from '../utils/logger.js';

// Default metrics
const defaultMetrics = Prometheus.collectDefaultMetrics;
defaultMetrics({ timeout: 5000 });

// Custom metrics
export const httpRequestDuration = new Prometheus.Histogram({
  name: 'http_request_duration_ms',
  help: 'Duration of HTTP requests in milliseconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [10, 30, 100, 300, 1000, 3000],
});

export const orderProcessingTime = new Prometheus.Histogram({
  name: 'order_processing_time_ms',
  help: 'Time to process an order in milliseconds',
  labelNames: ['symbol', 'order_type'],
  buckets: [0.1, 0.5, 1, 5, 10, 50, 100],
});

export const tradeExecutionLatency = new Prometheus.Histogram({
  name: 'trade_execution_latency_us',
  help: 'Trade execution latency in microseconds',
  labelNames: ['symbol'],
  buckets: [1, 10, 100, 1000, 10000, 100000],
});

export const ordersCreated = new Prometheus.Counter({
  name: 'orders_created_total',
  help: 'Total number of orders created',
  labelNames: ['symbol', 'order_type', 'side'],
});

export const tradesExecuted = new Prometheus.Counter({
  name: 'trades_executed_total',
  help: 'Total number of trades executed',
  labelNames: ['symbol'],
});

export const ordersFilledPartial = new Prometheus.Counter({
  name: 'orders_filled_partial_total',
  help: 'Total number of partially filled orders',
  labelNames: ['symbol'],
});

export const depositReceived = new Prometheus.Counter({
  name: 'deposits_received_total',
  help: 'Total deposits received',
  labelNames: ['chain', 'status'],
});

export const kk99Balance = new Prometheus.Gauge({
  name: 'kk99_total_balance_sum',
  help: 'Total KK99 balance across all users',
  labelNames: [],
});

export const activeUsers = new Prometheus.Gauge({
  name: 'active_users_count',
  help: 'Number of active users',
  labelNames: [],
});

export const connectedWebsockets = new Prometheus.Gauge({
  name: 'connected_websockets_count',
  help: 'Number of connected WebSocket connections',
  labelNames: [],
});

export const dbPoolConnections = new Prometheus.Gauge({
  name: 'db_pool_connections_count',
  help: 'Number of database pool connections',
  labelNames: ['status'], // idle, active
});

export const kafkaProducerErrors = new Prometheus.Counter({
  name: 'kafka_producer_errors_total',
  help: 'Total number of Kafka producer errors',
  labelNames: ['topic'],
});

export const kafkaConsumerLag = new Prometheus.Gauge({
  name: 'kafka_consumer_lag',
  help: 'Kafka consumer lag in messages',
  labelNames: ['topic', 'partition'],
});

export const portfolioVaR = new Prometheus.Gauge({
  name: 'portfolio_var_95_sum',
  help: 'Sum of 95% VaR across all portfolios',
  labelNames: [],
});

export const liquidationWarnings = new Prometheus.Counter({
  name: 'liquidation_warnings_total',
  help: 'Total liquidation warnings issued',
  labelNames: ['severity'],
});

export const marketAnomalies = new Prometheus.Counter({
  name: 'market_anomalies_detected_total',
  help: 'Total market anomalies detected',
  labelNames: ['type', 'severity'],
});

export const apiErrors = new Prometheus.Counter({
  name: 'api_errors_total',
  help: 'Total API errors',
  labelNames: ['error_code', 'endpoint'],
});

export const vaultSecretRetrieval = new Prometheus.Histogram({
  name: 'vault_secret_retrieval_ms',
  help: 'Time to retrieve secrets from Vault',
  labelNames: ['secret_type'],
  buckets: [5, 10, 50, 100, 500],
});

/**
 * Middleware to track HTTP request metrics
 */
export function metricsMiddleware(req: any, res: any, next: any) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);

    if (res.statusCode >= 400) {
      apiErrors
        .labels(res.statusCode, req.route?.path || req.path)
        .inc();
    }
  });

  next();
}

/**
 * Update metrics from database
 */
export async function updateDatabaseMetrics(dbPool: any) {
  try {
    const result = await dbPool.query(
      'SELECT COUNT(*) as count FROM users WHERE last_login_at > NOW() - INTERVAL 1 HOUR',
    );
    activeUsers.set(result.rows[0].count);

    const balanceResult = await dbPool.query(
      'SELECT COALESCE(SUM(kk99_balance), 0) as total FROM users',
    );
    kk99Balance.set(balanceResult.rows[0].total);

    const varResult = await dbPool.query(
      'SELECT COALESCE(SUM(var_95), 0) as total_var FROM portfolio_risk_metrics',
    );
    portfolioVaR.set(varResult.rows[0].total_var);
  } catch (error) {
    logger.error('Failed to update database metrics:', error);
  }
}

/**
 * Alert threshold configurations
 */
export const ALERT_THRESHOLDS = {
  // Order book alerts
  ORDER_BOOK_SPREAD_ALERT: 0.02, // 2% spread considered wide
  ORDER_PROCESSING_TIME_ALERT: 100, // 100ms
  TRADE_EXECUTION_LATENCY_ALERT: 1000, // 1000us (1ms)

  // Risk alerts
  PORTFOLIO_VAR_ALERT: 100000, // KK99
  LIQUIDATION_WARNING_THRESHOLD: 0.8, // 80% margin used

  // Market alerts
  PRICE_SPIKE_THRESHOLD: 0.05, // 5%
  VOLUME_SPIKE_THRESHOLD: 2.0, // 2x normal volume
  BID_ASK_SPREAD_THRESHOLD: 0.02, // 2%

  // Operational alerts
  KAFKA_LAG_ALERT: 10000, // messages
  DB_CONNECTION_POOL_ALERT: 15, // % of max connections
  WEBSOCKET_CONNECTIONS_ALERT: 5000, // max concurrent connections
};

/**
 * Alert generator
 */
export interface Alert {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export class AlertManager {
  private alerts: Map<string, Alert> = new Map();

  createAlert(
    type: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    metadata: Record<string, any> = {},
  ): Alert {
    const alert: Alert = {
      id: `${type}-${Date.now()}`,
      type,
      severity,
      message,
      timestamp: new Date(),
      metadata,
    };

    this.alerts.set(alert.id, alert);

    logger.warn({
      alert: {
        id: alert.id,
        type,
        severity,
        message,
        metadata,
      },
    });

    return alert;
  }

  getAlerts(severity?: string): Alert[] {
    const alerts = Array.from(this.alerts.values());
    if (severity) {
      return alerts.filter((a) => a.severity === severity);
    }
    return alerts;
  }

  clearAlert(alertId: string): void {
    this.alerts.delete(alertId);
  }

  clearAllAlerts(): void {
    this.alerts.clear();
  }
}

/**
 * Health check
 */
export async function performHealthCheck(
  dbPool: any,
  kafkaProducer?: any,
): Promise<{
  healthy: boolean;
  checks: Record<string, boolean>;
  timestamp: Date;
}> {
  const checks: Record<string, boolean> = {};

  // Database check
  try {
    await dbPool.query('SELECT 1');
    checks.database = true;
  } catch (error) {
    logger.error('Database health check failed:', error);
    checks.database = false;
  }

  // Kafka check
  if (kafkaProducer) {
    try {
      // Kafka admin check would go here
      checks.kafka = true;
    } catch (error) {
      logger.error('Kafka health check failed:', error);
      checks.kafka = false;
    }
  }

  const healthy = Object.values(checks).every((c) => c === true);

  return {
    healthy,
    checks,
    timestamp: new Date(),
  };
}

/**
 * Export metrics endpoint
 */
export async function metricsEndpoint(): Promise<string> {
  return Prometheus.register.metrics();
}
