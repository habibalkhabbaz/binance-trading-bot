const _ = require('lodash');
const { v4: uuidv4 } = require('uuid');
const { binance } = require('../helpers');
const {
  getConfiguration
} = require('../cronjob/trailingTradeHelper/configuration');
const { saveCandle } = require('../cronjob/trailingTradeHelper/common');
const queue = require('../cronjob/trailingTradeHelper/queue');

let websocketATHCandlesClean = {};

const setupATHCandlesWebsocket = async (logger, symbols) => {
  // we have to reset the opened connections in any way since we are grouping the symbols by intervals
  // and not by their names
  if (_.isEmpty(websocketATHCandlesClean) === false) {
    logger.info('Existing opened socket for candles found, clean first');
    _.forEach(websocketATHCandlesClean, (clean, _key) => {
      clean();
    });
    websocketATHCandlesClean = {};
  }

  const athSymbolsGroupedByIntervals = {};

  // the symbols grouped by intervals to decrease the number of opened streams
  // eslint-disable-next-line no-restricted-syntax
  for (const symbol of symbols) {
    // eslint-disable-next-line no-await-in-loop
    const symbolConfiguration = await getConfiguration(logger, symbol);

    const {
      buy: {
        athRestriction: {
          enabled: buyATHRestrictionEnabled,
          candles: { interval: buyATHRestrictionCandlesInterval }
        }
      }
    } = symbolConfiguration;

    if (buyATHRestrictionEnabled === false) {
      // eslint-disable-next-line no-continue
      continue;
    }

    if (!athSymbolsGroupedByIntervals[buyATHRestrictionCandlesInterval]) {
      athSymbolsGroupedByIntervals[buyATHRestrictionCandlesInterval] = [];
    }

    athSymbolsGroupedByIntervals[buyATHRestrictionCandlesInterval].push(symbol);
  }

  _.forEach(
    athSymbolsGroupedByIntervals,
    async (symbolsGroup, candleInterval) => {
      websocketATHCandlesClean[candleInterval] = binance.client.ws.candles(
        symbolsGroup,
        candleInterval,
        candle => {
          saveCandle(logger, 'trailing-trade-ath-candles', {
            key: candle.symbol,
            interval: candle.interval,
            time: +candle.startTime,
            open: +candle.open,
            high: +candle.high,
            low: +candle.low,
            close: +candle.close,
            volume: +candle.volume
          });
        }
      );
    }
  );
};

/**
 * Retrieve ATH candles for symbols from Binance API
 *
 * @param {*} logger
 * @param {string[]} symbols
 */
const syncATHCandles = async (logger, symbols) => {
  await Promise.all(
    symbols.map(async symbol =>
      queue.execute(logger, symbol, {
        correlationId: uuidv4(),
        type: 'getAthCandles'
      })
    )
  );
};

const getWebsocketATHCandlesClean = () => websocketATHCandlesClean;

module.exports = {
  setupATHCandlesWebsocket,
  syncATHCandles,
  getWebsocketATHCandlesClean
};
