const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');
const { binance, cache } = require('../helpers');
const queue = require('../cronjob/trailingTradeHelper/queue');

const { errorHandlerWrapper } = require('../error-handler');

let websocketDepthClean = {};

const setupDepthWebsocket = async (logger, symbols) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const symbol of symbols) {
    if (symbol in websocketDepthClean) {
      logger.warn(
        `Existing opened stream for ${symbol} depth found, clean first`
      );
      websocketDepthClean[symbol]();
    }

    websocketDepthClean[symbol] = binance.client.ws.partialDepth(
      { symbol, level: 5 },
      depth => {
        errorHandlerWrapper(logger, 'Depth', async () => {
          const correlationId = uuidv4();

          const { bids, asks } = depth;

          const symbolLogger = logger.child({
            correlationId,
            symbol
          });

          //  In general, a narrow or tight spread indicates a liquid market with a high level of
          //  trading activity and a small transaction cost, while a wider spread suggests a less
          //  liquid market with lower trading activity and a higher transaction cost.
          const highestBid = bids[0];
          const lowestAsk = asks[0];
          // const bidPrice = highestBid.price * highestBid.quantity;
          // const askPrice = lowestAsk.price * lowestAsk.quantity;
          // Bid-Ask Spread (%) = (Ask Price – Bid Price) ÷ Ask Price
          const marketSpread =
            ((lowestAsk.price - highestBid.price) / lowestAsk.price) * 100;

          symbolLogger.error({ marketSpread }, 'Received new depth');

          // Save latest candle for the symbol
          cache.hset(
            'trailing-trade-symbols',
            `${symbol}-market-spread`,
            marketSpread
          );
        });
      }
    );
  }
};

const getWebsocketDepthClean = () => websocketDepthClean;

const refreshDepthClean = logger => {
  if (_.isEmpty(websocketDepthClean) === false) {
    logger.info('Existing opened socket for depths found, clean first');
    _.forEach(websocketDepthClean, (clean, _key) => {
      clean();
    });
    websocketDepthClean = {};
  }
};

module.exports = {
  setupDepthWebsocket,
  getWebsocketDepthClean,
  refreshDepthClean
};
