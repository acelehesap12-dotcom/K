import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface MarketData {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  volume: number;
  change24h: number;
}

interface OrderUpdate {
  type: 'ORDER_CREATED' | 'ORDER_FILLED' | 'ORDER_CANCELLED' | 'TRADE_EXECUTED';
  data: any;
}

interface PriceUpdate {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  timestamp: number;
}

const MarketData: React.FC = () => {
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC-USD');
  const [priceHistory, setPriceHistory] = useState<any[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');

  // Initialize WebSocket connection
  useEffect(() => {
    if (!token || !userId) return;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/${userId}?token=${token}`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        
        // Subscribe to price updates
        wsRef.current?.send(JSON.stringify({
          type: 'SUBSCRIBE_TICKER',
          symbol: selectedSymbol,
        }));
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnected(false);
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket disconnected');
        setConnected(false);
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };
    };

    connectWebSocket();

    return () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [token, userId, selectedSymbol]);

  // Handle incoming WebSocket messages
  const handleMessage = (message: any) => {
    switch (message.type) {
      case 'PRICE_UPDATE':
        handlePriceUpdate(message as PriceUpdate);
        break;

      case 'ORDER_CREATED':
      case 'ORDER_FILLED':
      case 'TRADE_EXECUTED':
        handleOrderUpdate(message as OrderUpdate);
        break;

      case 'CONNECTED':
        console.log('Connected to real-time service');
        break;

      case 'SUBSCRIBED':
        console.log(`Subscribed to ${message.symbol}`);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  };

  const handlePriceUpdate = (update: PriceUpdate) => {
    setMarketData((prev) => {
      const updated = [...prev];
      const index = updated.findIndex((d) => d.symbol === update.symbol);
      
      if (index >= 0) {
        updated[index] = {
          ...updated[index],
          price: update.price,
          bid: update.bid,
          ask: update.ask,
        };
      } else {
        updated.push({
          symbol: update.symbol,
          price: update.price,
          bid: update.bid,
          ask: update.ask,
          volume: 0,
          change24h: 0,
        });
      }
      
      return updated;
    });

    // Add to price history for charting (keep last 60 data points)
    setPriceHistory((prev) => [
      ...prev.slice(-59),
      {
        time: new Date(update.timestamp).toLocaleTimeString(),
        price: update.price,
        bid: update.bid,
        ask: update.ask,
      },
    ]);
  };

  const handleOrderUpdate = (update: OrderUpdate) => {
    console.log(`Order update: ${update.type}`, update.data);
  };

  const sendPing = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'PING' }));
    }
  };

  const subscribe = (symbol: string) => {
    setSelectedSymbol(symbol);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SUBSCRIBE_TICKER',
        symbol,
      }));
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Market Data</h1>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-3 h-3 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span className="text-sm font-medium text-gray-700">
                {connected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <button
              onClick={sendPing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              Ping
            </button>
          </div>
        </div>

        {/* Market Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {['BTC-USD', 'ETH-USD', 'SOL-USD', 'EUR-USD'].map((symbol) => {
            const data = marketData.find((d) => d.symbol === symbol);
            return (
              <button
                key={symbol}
                onClick={() => subscribe(symbol)}
                className={`p-4 rounded-lg border-2 transition-colors ${
                  selectedSymbol === symbol
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-medium text-gray-600">{symbol}</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  ${data?.price?.toFixed(2) || '--'}
                </div>
                <div className={`text-sm mt-1 ${data?.change24h ? (data.change24h > 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-600'}`}>
                  {data?.change24h ? `${data.change24h > 0 ? '+' : ''}${data.change24h.toFixed(2)}%` : '--'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Price Chart */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Price History - {selectedSymbol}</h2>
          {priceHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceHistory}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="price" stroke="#3b82f6" />
                <Line type="monotone" dataKey="bid" stroke="#10b981" opacity={0.5} />
                <Line type="monotone" dataKey="ask" stroke="#ef4444" opacity={0.5} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              Waiting for price data...
            </div>
          )}
        </div>

        {/* Bid-Ask Spread */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Order Book - {selectedSymbol}</h2>
          <div className="grid grid-cols-3 gap-4">
            {marketData
              .filter((d) => d.symbol === selectedSymbol)
              .map((data) => (
                <div key="orderbook">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600">${data.bid.toFixed(2)}</div>
                    <div className="text-sm text-gray-600 mt-1">Bid</div>
                  </div>
                  <div className="text-center my-4">
                    <div className="text-lg font-bold text-gray-900">
                      Spread: ${(data.ask - data.bid).toFixed(2)}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      ({(((data.ask - data.bid) / data.bid) * 100).toFixed(4)}%)
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-red-600">${data.ask.toFixed(2)}</div>
                    <div className="text-sm text-gray-600 mt-1">Ask</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketData;
