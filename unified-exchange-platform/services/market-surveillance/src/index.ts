import { Kafka } from 'kafkajs';
import { Client } from 'elasticsearch';
import { logger } from './logger.js';

const kafka = new Kafka({
  clientId: 'market-surveillance',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});

const esClient = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
});

const consumer = kafka.consumer({ groupId: 'market-surveillance-group' });

interface MarketData {
  timestamp: number;
  symbol: string;
  price: number;
  volume: number;
  bid: number;
  ask: number;
}

export async function startSurveillance() {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'market-data' });

    const detectedAnomalies = new Map<string, any>();

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const data: MarketData = JSON.parse(message.value.toString());
          
          // Detect anomalies
          const anomalies = detectAnomalies(data, detectedAnomalies);
          
          for (const anomaly of anomalies) {
            logger.warn('Anomaly detected:', anomaly);
            
            // Store in Elasticsearch for historical analysis
            await esClient.index({
              index: 'market-anomalies',
              body: {
                timestamp: new Date().toISOString(),
                ...anomaly,
              },
            });

            // Alert (could trigger SMS, email, webhook)
            if (anomaly.severity === 'critical') {
              await sendAlert(anomaly);
            }
          }
        } catch (error) {
          logger.error('Error processing market data:', error);
        }
      },
    });
  } catch (error) {
    logger.error('Surveillance startup error:', error);
    throw error;
  }
}

function detectAnomalies(data: MarketData, history: Map<string, any>) {
  const anomalies = [];

  // Price spike detection
  const prevData = history.get(data.symbol);
  if (prevData) {
    const priceChange = Math.abs((data.price - prevData.price) / prevData.price) * 100;
    if (priceChange > 5) {
      anomalies.push({
        type: 'price_spike',
        symbol: data.symbol,
        changePercent: priceChange,
        severity: priceChange > 10 ? 'critical' : 'high',
      });
    }
  }

  // Volume spike
  if (prevData && data.volume > prevData.volume * 2) {
    anomalies.push({
      type: 'volume_spike',
      symbol: data.symbol,
      volume: data.volume,
      severity: data.volume > prevData.volume * 5 ? 'high' : 'medium',
    });
  }

  // Bid-ask spread anomaly
  const spread = ((data.ask - data.bid) / data.bid) * 100;
  if (spread > 2) {
    anomalies.push({
      type: 'spread_anomaly',
      symbol: data.symbol,
      spread,
      severity: 'medium',
    });
  }

  history.set(data.symbol, data);
  return anomalies;
}

async function sendAlert(anomaly: any) {
  logger.info(`CRITICAL ALERT: ${anomaly.type} on ${anomaly.symbol}`);
  // Integrate with alerting service (Slack, PagerDuty, etc)
}

export async function stopSurveillance() {
  await consumer.disconnect();
}
