/// Advanced Order Types Handler for KK99
/// Supports: Stop-Loss, Trailing Stop, Iceberg, OCO, and Algorithmic orders
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { publishEvent } from '../services/kafka.js';

interface StopLossOrder {
    stopPrice: number;
    triggerType: 'LAST_PRICE' | 'BID' | 'ASK' | 'INDEX';
    triggerTime: number;
}

interface TrailingStopOrder {
    trailingPercent?: number;
    trailingAmount?: number;
    highWaterMark: number;
    updateTime: number;
}

interface IcebergOrder {
    visibleQuantity: number;
    totalQuantity: number;
    nextVisibleSize: number;
}

interface AlgoOrder {
    type: 'TWAP' | 'VWAP' | 'POV' | 'IS'; // Time-weighted, Volume-weighted, Percentage-of-volume, Implementation Shortfall
    params: {
        duration?: number; // ms for TWAP
        targetPercentage?: number; // For POV
        targetVolume?: number; // For VWAP
        maxParticipation?: number; // Max % of market volume
    };
}

interface OCOOrder {
    parentOrderId: string;
    linkedOrderIds: string[];
    triggerCondition: 'ANY' | 'ALL'; // Execute on ANY leg trigger, or wait for ALL
}

export default async function advancedOrderRoutes(fastify, opts) {
    // Create Stop-Loss Order
    fastify.post<{ Body: any }>('/stop-loss', async (request, reply) => {
        try {
            await request.jwtVerify();

            const {
                symbol,
                side,
                quantity,
                triggerPrice,
                limitPrice,
                triggerType = 'LAST_PRICE',
                timeInForce = 'GTC',
            } = request.body;

            if (!symbol || !side || !quantity || !triggerPrice) {
                return reply.code(400).send({ error: 'Missing required fields' });
            }

            // Create main order first (in PENDING state)
            const orderResult = await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, price, status, time_in_force, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 RETURNING id, symbol, side, quantity`,
                [
                    request.user.id,
                    symbol,
                    'STOP_LOSS',
                    side.toUpperCase(),
                    quantity,
                    limitPrice || null,
                    'PENDING',
                    timeInForce,
                ],
            );

            const orderId = orderResult.rows[0].id;

            // Store stop-loss metadata
            await query(
                `INSERT INTO exchange.advanced_orders 
                 (order_id, order_type, metadata)
                 VALUES ($1, $2, $3)`,
                [
                    orderId,
                    'STOP_LOSS',
                    JSON.stringify({
                        stopPrice: triggerPrice,
                        triggerType,
                        limitPrice: limitPrice || null,
                        originalSide: side.toUpperCase(),
                    }),
                ],
            );

            logger.info(
                `Stop-Loss order created: ${orderId} for ${quantity} ${symbol} at $${triggerPrice}`,
            );

            await publishEvent('order-events', request.user.id, {
                orderId,
                userId: request.user.id,
                orderType: 'STOP_LOSS',
                symbol,
                side: side.toUpperCase(),
                quantity,
                stopPrice: triggerPrice,
                limitPrice: limitPrice || null,
                triggerType,
                createdAt: Date.now(),
            });

            reply.code(201).send({
                id: orderId,
                type: 'STOP_LOSS',
                symbol,
                side: side.toUpperCase(),
                quantity,
                stopPrice: triggerPrice,
                limitPrice,
                status: 'PENDING',
            });
        } catch (error) {
            logger.error('Stop-loss order creation error:', error);
            reply.code(500).send({ error: 'Failed to create stop-loss order' });
        }
    });

    // Create Trailing Stop Order
    fastify.post<{ Body: any }>('/trailing-stop', async (request, reply) => {
        try {
            await request.jwtVerify();

            const {
                symbol,
                side,
                quantity,
                trailingPercent,
                trailingAmount,
                timeInForce = 'GTC',
            } = request.body;

            if (!symbol || !side || !quantity || (!trailingPercent && !trailingAmount)) {
                return reply.code(400).send({
                    error: 'Missing required fields (trailingPercent or trailingAmount needed)',
                });
            }

            // Get current market price
            const priceResult = await query(
                'SELECT price FROM exchange.market_data WHERE symbol = $1 ORDER BY created_at DESC LIMIT 1',
                [symbol],
            );

            if (priceResult.rows.length === 0) {
                return reply.code(404).send({ error: 'Market data not available' });
            }

            const currentPrice = priceResult.rows[0].price;

            const orderResult = await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, price, status, time_in_force, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 RETURNING id`,
                [
                    request.user.id,
                    symbol,
                    'TRAILING_STOP',
                    side.toUpperCase(),
                    quantity,
                    currentPrice,
                    'PENDING',
                    timeInForce,
                ],
            );

            const orderId = orderResult.rows[0].id;

            await query(
                `INSERT INTO exchange.advanced_orders 
                 (order_id, order_type, metadata)
                 VALUES ($1, $2, $3)`,
                [
                    orderId,
                    'TRAILING_STOP',
                    JSON.stringify({
                        trailingPercent,
                        trailingAmount,
                        highWaterMark: currentPrice,
                        currentStopPrice: side === 'SELL' ? currentPrice * (1 - (trailingPercent || 0) / 100) : currentPrice * (1 + (trailingPercent || 0) / 100),
                    }),
                ],
            );

            logger.info(
                `Trailing Stop order created: ${orderId} for ${quantity} ${symbol}`,
            );

            reply.code(201).send({
                id: orderId,
                type: 'TRAILING_STOP',
                symbol,
                side: side.toUpperCase(),
                quantity,
                trailingPercent,
                trailingAmount,
                currentPrice,
                status: 'PENDING',
            });
        } catch (error) {
            logger.error('Trailing stop order creation error:', error);
            reply.code(500).send({ error: 'Failed to create trailing stop order' });
        }
    });

    // Create Iceberg Order
    fastify.post<{ Body: any }>('/iceberg', async (request, reply) => {
        try {
            await request.jwtVerify();

            const {
                symbol,
                side,
                totalQuantity,
                visibleQuantity,
                price,
                timeInForce = 'GTC',
            } = request.body;

            if (!symbol || !side || !totalQuantity || !visibleQuantity || !price) {
                return reply.code(400).send({ error: 'Missing required fields' });
            }

            if (visibleQuantity > totalQuantity) {
                return reply
                    .code(400)
                    .send({ error: 'Visible quantity cannot exceed total quantity' });
            }

            // Create main iceberg order
            const orderResult = await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, price, status, time_in_force, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 RETURNING id`,
                [
                    request.user.id,
                    symbol,
                    'ICEBERG',
                    side.toUpperCase(),
                    visibleQuantity,
                    price,
                    'ACTIVE',
                    timeInForce,
                ],
            );

            const orderId = orderResult.rows[0].id;

            // Store iceberg metadata
            await query(
                `INSERT INTO exchange.advanced_orders 
                 (order_id, order_type, metadata)
                 VALUES ($1, $2, $3)`,
                [
                    orderId,
                    'ICEBERG',
                    JSON.stringify({
                        visibleQuantity,
                        totalQuantity,
                        remainingQuantity: totalQuantity - visibleQuantity,
                    }),
                ],
            );

            logger.info(
                `Iceberg order created: ${orderId} - Visible: ${visibleQuantity}, Total: ${totalQuantity}`,
            );

            reply.code(201).send({
                id: orderId,
                type: 'ICEBERG',
                symbol,
                side: side.toUpperCase(),
                visibleQuantity,
                totalQuantity,
                price,
                status: 'ACTIVE',
            });
        } catch (error) {
            logger.error('Iceberg order creation error:', error);
            reply.code(500).send({ error: 'Failed to create iceberg order' });
        }
    });

    // Create One-Cancels-Other (OCO) Order
    fastify.post<{ Body: any }>('/oco', async (request, reply) => {
        try {
            await request.jwtVerify();

            const {
                symbol,
                side,
                quantity,
                takeProfit,
                stopLoss,
                triggerType = 'LAST_PRICE',
            } = request.body;

            if (!symbol || !side || !quantity || !takeProfit || !stopLoss) {
                return reply.code(400).send({ error: 'Missing required fields' });
            }

            // Create stop-loss leg
            const slResult = await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, price, status, time_in_force, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 RETURNING id`,
                [
                    request.user.id,
                    symbol,
                    'STOP_LOSS',
                    side.toUpperCase(),
                    quantity,
                    stopLoss.limitPrice || null,
                    'PENDING',
                    'GTC',
                ],
            );

            const slOrderId = slResult.rows[0].id;

            // Create take-profit leg
            const tpResult = await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, price, status, time_in_force, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
                 RETURNING id`,
                [
                    request.user.id,
                    symbol,
                    'LIMIT',
                    side.toUpperCase(),
                    quantity,
                    takeProfit.price,
                    'PENDING',
                    'GTC',
                ],
            );

            const tpOrderId = tpResult.rows[0].id;

            // Link them as OCO
            await query(
                `INSERT INTO exchange.advanced_orders 
                 (order_id, order_type, metadata)
                 VALUES ($1, $2, $3), ($4, $5, $6)`,
                [
                    slOrderId,
                    'OCO',
                    JSON.stringify({
                        linkedOrderId: tpOrderId,
                        type: 'STOP_LOSS_LEG',
                        stopPrice: stopLoss.stopPrice,
                    }),
                    tpOrderId,
                    'OCO',
                    JSON.stringify({
                        linkedOrderId: slOrderId,
                        type: 'TAKE_PROFIT_LEG',
                        takeProfit: takeProfit.price,
                    }),
                ],
            );

            logger.info(
                `OCO order created: SL[${slOrderId}] - TP[${tpOrderId}] for ${quantity} ${symbol}`,
            );

            reply.code(201).send({
                id: `OCO_${slOrderId}_${tpOrderId}`,
                type: 'OCO',
                symbol,
                side: side.toUpperCase(),
                quantity,
                stopLossLeg: {
                    id: slOrderId,
                    stopPrice: stopLoss.stopPrice,
                    limitPrice: stopLoss.limitPrice,
                },
                takeProfitLeg: {
                    id: tpOrderId,
                    price: takeProfit.price,
                },
                status: 'PENDING',
            });
        } catch (error) {
            logger.error('OCO order creation error:', error);
            reply.code(500).send({ error: 'Failed to create OCO order' });
        }
    });

    // Create Algorithmic Order (TWAP, VWAP, POV, IS)
    fastify.post<{ Body: any }>('/algo', async (request, reply) => {
        try {
            await request.jwtVerify();

            const {
                symbol,
                side,
                totalQuantity,
                algoType,
                duration,
                targetPercentage,
                maxParticipation = 0.1,
            } = request.body;

            if (!symbol || !side || !totalQuantity || !algoType) {
                return reply.code(400).send({ error: 'Missing required fields' });
            }

            const validAlgos = ['TWAP', 'VWAP', 'POV', 'IS'];
            if (!validAlgos.includes(algoType)) {
                return reply.code(400).send({ error: 'Invalid algo type' });
            }

            const orderResult = await query(
                `INSERT INTO exchange.orders 
                 (user_id, symbol, order_type, side, quantity, status, time_in_force, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                 RETURNING id`,
                [
                    request.user.id,
                    symbol,
                    'ALGO',
                    side.toUpperCase(),
                    totalQuantity,
                    'ACTIVE',
                    'GTC',
                ],
            );

            const orderId = orderResult.rows[0].id;

            // Store algorithm parameters
            await query(
                `INSERT INTO exchange.advanced_orders 
                 (order_id, order_type, metadata)
                 VALUES ($1, $2, $3)`,
                [
                    orderId,
                    'ALGO',
                    JSON.stringify({
                        algoType,
                        duration,
                        targetPercentage,
                        maxParticipation,
                        startTime: Date.now(),
                        executedQuantity: 0,
                    }),
                ],
            );

            logger.info(
                `Algorithmic order created: ${orderId} - ${algoType} for ${totalQuantity} ${symbol}`,
            );

            reply.code(201).send({
                id: orderId,
                type: 'ALGO',
                symbol,
                side: side.toUpperCase(),
                totalQuantity,
                algoType,
                duration,
                targetPercentage,
                maxParticipation,
                status: 'ACTIVE',
            });
        } catch (error) {
            logger.error('Algo order creation error:', error);
            reply.code(500).send({ error: 'Failed to create algo order' });
        }
    });

    // Get all advanced orders for user
    fastify.get('/', async (request, reply) => {
        try {
            await request.jwtVerify();

            const result = await query(
                `SELECT o.id, o.symbol, o.order_type, o.side, o.quantity, 
                        o.status, ao.order_type as advanced_type, ao.metadata
                 FROM exchange.orders o
                 LEFT JOIN exchange.advanced_orders ao ON o.id = ao.order_id
                 WHERE o.user_id = $1 AND o.order_type IN ('STOP_LOSS', 'TRAILING_STOP', 'ICEBERG', 'ALGO')
                 ORDER BY o.created_at DESC
                 LIMIT 100`,
                [request.user.id],
            );

            reply.send(result.rows.map((row) => ({
                id: row.id,
                symbol: row.symbol,
                type: row.advanced_type || row.order_type,
                side: row.side,
                quantity: row.quantity,
                status: row.status,
                metadata: row.metadata ? JSON.parse(row.metadata) : null,
            })));
        } catch (error) {
            logger.error('Get advanced orders error:', error);
            reply.code(500).send({ error: 'Failed to retrieve advanced orders' });
        }
    });

    // Cancel advanced order
    fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
        try {
            await request.jwtVerify();

            const { id } = request.params;

            const result = await query(
                `UPDATE exchange.orders 
                 SET status = 'CANCELLED', updated_at = NOW()
                 WHERE id = $1 AND user_id = $2 AND status IN ('PENDING', 'ACTIVE')
                 RETURNING id, symbol`,
                [id, request.user.id],
            );

            if (result.rows.length === 0) {
                return reply
                    .code(404)
                    .send({ error: 'Order not found or cannot be cancelled' });
            }

            logger.info(`Advanced order cancelled: ${id}`);

            reply.send({ id, status: 'CANCELLED' });
        } catch (error) {
            logger.error('Cancel order error:', error);
            reply.code(500).send({ error: 'Failed to cancel order' });
        }
    });
}
