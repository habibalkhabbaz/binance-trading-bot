const _ = require('lodash');
const Queue = require('bull');
const config = require('config');
const { executeTrailingTrade } = require('../index');
const { mongo, binance, cache } = require('../../helpers');
const { getConfiguration } = require('./configuration');
const {
  getGridTradeLastOrder,
  updateGridTradeLastOrder,
  getManualOrder,
  saveManualOrder
} = require('./order');
const { saveOverrideAction } = require('./common');

const queues = {};
const REDIS_URL = `redis://:${config.get('redis.password')}@${config.get(
  'redis.host'
)}:${config.get('redis.port')}/${config.get('redis.db')}`;

const saveCandle = async (symbol, candle) => {
  // Save latest candle for the symbol
  await cache.hset(
    'trailing-trade-symbols',
    `${symbol}-latest-candle`,
    JSON.stringify(candle)
  );
};

const getCandles = async (logger, symbol) => {
  await mongo.deleteAll(logger, 'trailing-trade-candles', {
    key: symbol
  });

  const symbolConfiguration = await getConfiguration(logger, symbol);

  const {
    candles: { interval, limit }
  } = symbolConfiguration;

  // Retrieve candles
  logger.info(
    { debug: true, function: 'candles', interval, limit },
    `Retrieving candles from API for ${symbol}`
  );

  const candles = await binance.client.candles({
    symbol,
    interval,
    limit
  });

  const operations = candles.map(candle => ({
    updateOne: {
      filter: {
        key: symbol,
        time: +candle.openTime,
        interval
      },
      update: {
        $set: {
          open: +candle.open,
          high: +candle.high,
          low: +candle.low,
          close: +candle.close,
          volume: +candle.volume
        }
      },
      upsert: true
    }
  }));

  await mongo.bulkWrite(logger, 'trailing-trade-candles', operations);
};

const getAthCandles = async (logger, symbol) => {
  await mongo.deleteAll(logger, 'trailing-trade-ath-candles', {
    key: symbol
  });
  const symbolConfiguration = await getConfiguration(logger, symbol);

  const {
    buy: {
      athRestriction: {
        enabled: buyATHRestrictionEnabled,
        candles: {
          interval: buyATHRestrictionCandlesInterval,
          limit: buyATHRestrictionCandlesLimit
        }
      }
    }
  } = symbolConfiguration;

  if (buyATHRestrictionEnabled === false) {
    return;
  }

  // Retrieve ath candles
  logger.info(
    {
      debug: true,
      function: 'candles',
      interval: buyATHRestrictionCandlesInterval,
      limit: buyATHRestrictionCandlesLimit
    },
    `Retrieving ATH candles from API for ${symbol}`
  );

  const athCandles = await binance.client.candles({
    symbol,
    interval: buyATHRestrictionCandlesInterval,
    limit: buyATHRestrictionCandlesLimit
  });

  const operations = athCandles.map(athCandle => ({
    updateOne: {
      filter: {
        key: symbol,
        time: +athCandle.openTime,
        interval: buyATHRestrictionCandlesInterval
      },
      update: {
        $set: {
          open: +athCandle.open,
          high: +athCandle.high,
          low: +athCandle.low,
          close: +athCandle.close,
          volume: +athCandle.volume
        }
      },
      upsert: true
    }
  }));

  // Save ath candles for the symbol
  await mongo.bulkWrite(logger, 'trailing-trade-ath-candles', operations);
};

const checkLastOrder = async (symbolLogger, symbol, evt) => {
  const {
    eventTime,
    side,
    orderStatus,
    orderType,
    stopPrice,
    price,
    orderId,
    quantity,
    isOrderWorking,
    totalQuoteTradeQuantity,
    totalTradeQuantity,
    orderTime: transactTime // Transaction time
  } = evt;

  const lastOrder = await getGridTradeLastOrder(
    symbolLogger,
    symbol,
    side.toLowerCase()
  );

  if (_.isEmpty(lastOrder) === false) {
    // Skip if the orderId is not match with the existing orderId
    // or Skip if the transaction time is older than the existing order transaction time
    // This is helpful when we received a delayed event for any reason
    if (
      orderId !== lastOrder.orderId ||
      transactTime < lastOrder.transactTime
    ) {
      symbolLogger.info(
        { lastOrder, evt, saveLog: true },
        'This order update is an old order. Do not update last grid trade order.'
      );
      return false;
    }

    const updatedOrder = {
      ...lastOrder,
      status: orderStatus,
      type: orderType,
      side,
      stopPrice,
      price,
      origQty: quantity,
      cummulativeQuoteQty: totalQuoteTradeQuantity,
      executedQty: totalTradeQuantity,
      isWorking: isOrderWorking,
      updateTime: eventTime,
      transactTime
    };

    await updateGridTradeLastOrder(
      symbolLogger,
      symbol,
      side.toLowerCase(),
      updatedOrder
    );
    symbolLogger.info(
      { lastOrder, updatedOrder, saveLog: true },
      `The last order has been updated. ${orderId} - ${side} - ${orderStatus}`
    );

    return true;
  }

  return false;
};

const checkManualOrder = async (symbolLogger, symbol, evt) => {
  const {
    eventTime,
    side,
    orderStatus,
    orderType,
    stopPrice,
    price,
    orderId,
    quantity,
    isOrderWorking,
    totalQuoteTradeQuantity,
    totalTradeQuantity
  } = evt;

  const manualOrder = await getManualOrder(symbolLogger, symbol, orderId);

  if (_.isEmpty(manualOrder) === false) {
    await saveManualOrder(symbolLogger, symbol, orderId, {
      ...manualOrder,
      status: orderStatus,
      type: orderType,
      side,
      stopPrice,
      price,
      origQty: quantity,
      cummulativeQuoteQty: totalQuoteTradeQuantity,
      executedQty: totalTradeQuantity,
      isWorking: isOrderWorking,
      updateTime: eventTime
    });

    symbolLogger.info(
      { symbol, manualOrder, saveLog: true },
      'The manual order has been updated.'
    );

    return true;
  }

  return false;
};

/**
 * Prepare the job in queue
 *
 * @param {*} funcLogger
 * @param {*} symbol
 */
const prepareJob = async (funcLogger, symbol) => {
  const logger = funcLogger.child({ helper: 'queue', func: 'prepareJob' });

  if (symbol in queues) {
    await queues[symbol].obliterate({ force: true });
  }

  const queue = new Queue(symbol, REDIS_URL, {
    prefix: `bull`,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true
    }
  });

  await queue.clean(0);
  await queue.empty();
  await queue.obliterate({ force: true });

  // Set concurrent for the job
  queue.process(1, async job => {
    if (job.data.type === 'getCandles') {
      await getCandles(logger, symbol);
    }
    if (job.data.type === 'getAthCandles') {
      await getAthCandles(logger, symbol);
    }
    if (job.data.type === 'saveCandle') {
      await saveCandle(symbol, job.data.candle);
    }
    if (job.data.type === 'checkOrder') {
      await checkLastOrder(logger, symbol, job.data.evt);
      await checkManualOrder(logger, symbol, job.data.evt);
    }
    if (job.data.type === 'saveOverrideAction') {
      await saveOverrideAction(
        logger,
        symbol,
        job.data.overrideData,
        job.data.overrideReason
      );
    }

    return executeTrailingTrade(logger, symbol, job.data.correlationId);
  });

  queues[symbol] = queue;

  logger.info({ symbol }, `Queue ${symbol} prepared`);

  return true;
};

/**
 * Execute queue or preprocessFn
 *
 * @param {*} _funcLogger
 * @param {*} symbol
 * @param {*} jobPayload
 */
const execute = async (_funcLogger, symbol, jobPayload = {}) =>
  queues[symbol].add(jobPayload);

module.exports = {
  prepareJob,
  execute
};
