import { Kafka, logLevel } from 'kafkajs';
import { logger } from '../utils/logger.js';

let kafka;
let producer;
let consumer;

export async function initKafka() {
  try {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    
    kafka = new Kafka({
      clientId: 'exchange-backend',
      brokers,
      logLevel: logLevel.INFO,
      retry: {
        initialRetryTime: 100,
        retries: 8,
      },
    });

    producer = kafka.producer();
    await producer.connect();
    logger.info('Kafka producer connected');

    consumer = kafka.consumer({ groupId: process.env.KAFKA_CONSUMER_GROUP || 'exchange-group' });
    await consumer.connect();
    logger.info('Kafka consumer connected');

  } catch (error) {
    logger.error('Kafka initialization failed:', error);
    throw error;
  }
}

export async function publishEvent(topic, key, value) {
  try {
    await producer.send({
      topic,
      messages: [
        {
          key: key || null,
          value: JSON.stringify(value),
          headers: {
            'correlation-id': Math.random().toString(36),
            'timestamp': new Date().toISOString(),
          },
        },
      ],
    });
    logger.debug(`Event published to ${topic}:`, value);
  } catch (error) {
    logger.error(`Failed to publish event to ${topic}:`, error);
    throw error;
  }
}

export async function subscribeToTopic(topic, messageHandler) {
  try {
    await consumer.subscribe({ topic, fromBeginning: false });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        try {
          const value = JSON.parse(message.value.toString());
          await messageHandler(value, message);
        } catch (error) {
          logger.error(`Error processing message from ${topic}:`, error);
        }
      },
    });
    logger.info(`Subscribed to topic: ${topic}`);
  } catch (error) {
    logger.error(`Failed to subscribe to topic ${topic}:`, error);
    throw error;
  }
}

export async function disconnectKafka() {
  try {
    await producer?.disconnect();
    await consumer?.disconnect();
    logger.info('Kafka disconnected');
  } catch (error) {
    logger.error('Error disconnecting Kafka:', error);
  }
}
