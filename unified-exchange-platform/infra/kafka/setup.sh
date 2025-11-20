#!/bin/bash
# Kafka topics and configuration setup

KAFKA_BROKER="kafka:9092"
SCHEMA_REGISTRY="http://schema-registry:8081"

echo "Creating Kafka topics..."

# User events
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic user-events \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --if-not-exists

# Deposit events
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic deposit-events \
  --partitions 3 \
  --replication-factor 1 \
  --config retention.ms=31536000000 \
  --if-not-exists

# Order events
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic order-events \
  --partitions 6 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --if-not-exists

# Trade events (high throughput)
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic trade-events \
  --partitions 12 \
  --replication-factor 1 \
  --config retention.ms=31536000000 \
  --config compression.type=snappy \
  --if-not-exists

# Market data (streaming)
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic market-data \
  --partitions 8 \
  --replication-factor 1 \
  --config retention.ms=604800000 \
  --config compression.type=snappy \
  --if-not-exists

# Risk alerts
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic risk-alerts \
  --partitions 2 \
  --replication-factor 1 \
  --config retention.ms=2592000000 \
  --if-not-exists

# Anomalies detection
docker exec exchange-kafka kafka-topics --create \
  --bootstrap-server $KAFKA_BROKER \
  --topic market-anomalies \
  --partitions 4 \
  --replication-factor 1 \
  --config retention.ms=2592000000 \
  --if-not-exists

echo "Registering Avro schemas with Schema Registry..."

curl -X POST $SCHEMA_REGISTRY/subjects/user-events-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d @schemas/UserCreated.avsc

curl -X POST $SCHEMA_REGISTRY/subjects/deposit-events-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d @schemas/DepositReceived.avsc

curl -X POST $SCHEMA_REGISTRY/subjects/order-events-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d @schemas/OrderCreated.avsc

curl -X POST $SCHEMA_REGISTRY/subjects/trade-events-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d @schemas/TradeExecuted.avsc

curl -X POST $SCHEMA_REGISTRY/subjects/market-data-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d @schemas/MarketData.avsc

echo "Kafka setup complete!"
