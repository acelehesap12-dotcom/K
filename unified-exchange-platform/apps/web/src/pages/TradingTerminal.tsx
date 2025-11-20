import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BookOpen,
  Clock,
  DollarSign,
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui';
import axios from 'axios';

interface OrderBookEntry {
  price: number;
  amount: number;
  total: number;
}

interface Trade {
  price: number;
  amount: number;
  timestamp: string;
  side: 'buy' | 'sell';
}

interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market';
  price: number;
  amount: number;
  filled: number;
  status: string;
  timestamp: string;
}

const SYMBOLS = [
  { value: 'BTC-USDT', label: 'BTC/USDT' },
  { value: 'ETH-USDT', label: 'ETH/USDT' },
  { value: 'SOL-USDT', label: 'SOL/USDT' },
  { value: 'AAPL', label: 'AAPL (Apple)' },
  { value: 'EUR-USD', label: 'EUR/USD' },
];

export default function TradingTerminal() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC-USDT');
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [currentPrice, setCurrentPrice] = useState(0);
  const [priceChange, setPriceChange] = useState(0);
  const [orderBook, setOrderBook] = useState<{
    bids: OrderBookEntry[];
    asks: OrderBookEntry[];
  }>({ bids: [], asks: [] });
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [openOrders, setOpenOrders] = useState<Order[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchMarketData();
    connectWebSocket();

    const interval = setInterval(fetchMarketData, 2000);
    return () => {
      clearInterval(interval);
      wsRef.current?.close();
    };
  }, [selectedSymbol]);

  const connectWebSocket = () => {
    // REAL WebSocket connection - NO MOCK
    const wsUrl = `wss://${window.location.host}/ws/market/${selectedSymbol}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'ticker') {
        setCurrentPrice(data.price);
        setPriceChange(data.change24h);
      } else if (data.type === 'orderbook') {
        setOrderBook({
          bids: data.bids || [],
          asks: data.asks || [],
        });
      } else if (data.type === 'trade') {
        setRecentTrades((prev) => [data, ...prev.slice(0, 49)]);
      }
    };

    wsRef.current = ws;
  };

  const fetchMarketData = async () => {
    try {
      const [priceRes, orderbookRes, tradesRes, ordersRes] = await Promise.all([
        axios.get(`/api/market-data/price/${selectedSymbol}`),
        axios.get(`/api/market-data/orderbook/${selectedSymbol}`),
        axios.get(`/api/market-data/trades/${selectedSymbol}?limit=50`),
        axios.get('/api/orders/open'),
      ]);

      setCurrentPrice(priceRes.data.price);
      setPriceChange(priceRes.data.change24h);
      setOrderBook(orderbookRes.data);
      setRecentTrades(tradesRes.data.trades);
      setOpenOrders(ordersRes.data.orders.filter((o: Order) => o.symbol === selectedSymbol));
    } catch (error) {
      console.error('Market data fetch error:', error);
    }
  };

  const handleSubmitOrder = async () => {
    setSubmitting(true);
    try {
      await axios.post('/api/orders', {
        symbol: selectedSymbol,
        side: orderSide,
        type: orderType,
        price: orderType === 'limit' ? parseFloat(price) : undefined,
        amount: parseFloat(amount),
      });

      setPrice('');
      setAmount('');
      fetchMarketData();
    } catch (error) {
      console.error('Order submission error:', error);
      alert('Emir gönderilemedi. Lütfen tekrar deneyin.');
    } finally {
      setSubmitting(false);
    }
  };

  const calculateTotal = () => {
    const priceValue = orderType === 'limit' ? parseFloat(price) : currentPrice;
    const amountValue = parseFloat(amount);
    return isNaN(priceValue) || isNaN(amountValue) ? 0 : priceValue * amountValue;
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      {/* Header with Price Ticker */}
      <div className="mb-4">
        <Card variant="gradient">
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <Select
                  options={SYMBOLS}
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="text-xl font-bold"
                />
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-bold text-white">
                      {formatCurrency(currentPrice)}
                    </h2>
                    <Badge variant={priceChange >= 0 ? 'success' : 'danger'} size="lg">
                      <div className="flex items-center gap-1">
                        {priceChange >= 0 ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {priceChange >= 0 ? '+' : ''}
                        {priceChange.toFixed(2)}%
                      </div>
                    </Badge>
                  </div>
                  <p className="text-gray-400 text-sm mt-1">24 Saatlik Değişim</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Activity className="w-5 h-5 text-green-400 animate-pulse" />
                <span className="text-green-400 text-sm font-medium">CANLI</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Order Book */}
        <div className="lg:col-span-1">
          <Card variant="glass" className="h-[calc(100vh-200px)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Emir Defteri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {/* Asks (Sell Orders) */}
                <div className="space-y-0.5">
                  {orderBook.asks.slice(0, 15).reverse().map((ask, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="relative flex justify-between text-xs font-mono py-1 px-2 rounded hover:bg-red-900/20 cursor-pointer"
                    >
                      <div
                        className="absolute inset-0 bg-red-500/10 rounded"
                        style={{ width: `${(ask.total / orderBook.asks[0]?.total || 0) * 100}%` }}
                      />
                      <span className="text-red-400 relative z-10">{ask.price.toFixed(2)}</span>
                      <span className="text-gray-400 relative z-10">{ask.amount.toFixed(6)}</span>
                    </motion.div>
                  ))}
                </div>

                {/* Current Price */}
                <div className="flex items-center justify-center py-3 my-2 bg-gray-800/50 rounded-lg">
                  <span className={`text-xl font-bold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatCurrency(currentPrice)}
                  </span>
                </div>

                {/* Bids (Buy Orders) */}
                <div className="space-y-0.5">
                  {orderBook.bids.slice(0, 15).map((bid, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="relative flex justify-between text-xs font-mono py-1 px-2 rounded hover:bg-green-900/20 cursor-pointer"
                    >
                      <div
                        className="absolute inset-0 bg-green-500/10 rounded"
                        style={{ width: `${(bid.total / orderBook.bids[0]?.total || 0) * 100}%` }}
                      />
                      <span className="text-green-400 relative z-10">{bid.price.toFixed(2)}</span>
                      <span className="text-gray-400 relative z-10">{bid.amount.toFixed(6)}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chart Placeholder + Order Form */}
        <div className="lg:col-span-2 space-y-4">
          {/* TradingView Chart Placeholder */}
          <Card variant="glass" className="h-96">
            <CardContent className="h-full flex items-center justify-center">
              <div className="text-center">
                <Activity className="w-16 h-16 text-blue-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">TradingView Grafik</h3>
                <p className="text-gray-400">
                  TradingView widget entegrasyonu burada gösterilecek
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Order Form */}
          <Card variant="gradient">
            <CardHeader>
              <CardTitle>Emir Ver</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Buy/Sell Toggle */}
                <div className="flex gap-2">
                  <Button
                    variant={orderSide === 'buy' ? 'success' : 'ghost'}
                    className="flex-1"
                    onClick={() => setOrderSide('buy')}
                  >
                    AL
                  </Button>
                  <Button
                    variant={orderSide === 'sell' ? 'danger' : 'ghost'}
                    className="flex-1"
                    onClick={() => setOrderSide('sell')}
                  >
                    SAT
                  </Button>
                </div>

                {/* Order Type */}
                <div className="flex gap-2">
                  <Button
                    variant={orderType === 'limit' ? 'primary' : 'ghost'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setOrderType('limit')}
                  >
                    Limit
                  </Button>
                  <Button
                    variant={orderType === 'market' ? 'primary' : 'ghost'}
                    size="sm"
                    className="flex-1"
                    onClick={() => setOrderType('market')}
                  >
                    Piyasa
                  </Button>
                </div>

                {/* Price Input (only for limit orders) */}
                {orderType === 'limit' && (
                  <Input
                    type="number"
                    label="Fiyat"
                    placeholder="0.00"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    icon={<DollarSign className="w-4 h-4" />}
                  />
                )}

                {/* Amount Input */}
                <Input
                  type="number"
                  label="Miktar"
                  placeholder="0.00000000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />

                {/* Total */}
                <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Toplam:</span>
                    <span className="text-xl font-bold text-white">
                      {formatCurrency(calculateTotal())}
                    </span>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  variant={orderSide === 'buy' ? 'success' : 'danger'}
                  className="w-full"
                  size="lg"
                  onClick={handleSubmitOrder}
                  loading={submitting}
                  disabled={!amount || (orderType === 'limit' && !price)}
                >
                  {orderSide === 'buy' ? 'AL' : 'SAT'} {selectedSymbol.split('-')[0]}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Trades + Open Orders */}
        <div className="lg:col-span-1 space-y-4">
          {/* Recent Trades */}
          <Card variant="glass" className="h-96 overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Son İşlemler
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-y-auto h-80">
              <div className="space-y-1">
                {recentTrades.map((trade, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-between text-xs font-mono py-1.5 px-2 rounded hover:bg-gray-800/50"
                  >
                    <span className={trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}>
                      {trade.price.toFixed(2)}
                    </span>
                    <span className="text-gray-400">{trade.amount.toFixed(6)}</span>
                    <span className="text-gray-500 text-[10px]">
                      {new Date(trade.timestamp).toLocaleTimeString('tr-TR')}
                    </span>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Open Orders */}
          <Card variant="glass">
            <CardHeader>
              <CardTitle>Açık Emirler</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {openOrders.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">Açık emir bulunmuyor</p>
                ) : (
                  openOrders.slice(0, 5).map((order) => (
                    <div
                      key={order.id}
                      className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
                    >
                      <div className="flex justify-between items-center mb-2">
                        <Badge variant={order.side === 'buy' ? 'success' : 'danger'} size="sm">
                          {order.side === 'buy' ? 'AL' : 'SAT'}
                        </Badge>
                        <span className="text-xs text-gray-400">{order.type.toUpperCase()}</span>
                      </div>
                      <div className="text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Fiyat:</span>
                          <span className="text-white font-mono">{formatCurrency(order.price)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Miktar:</span>
                          <span className="text-white font-mono">
                            {order.filled.toFixed(4)}/{order.amount.toFixed(4)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
