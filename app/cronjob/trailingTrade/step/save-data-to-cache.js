const _ = require('lodash');
const { mongo, cache } = require('../../../helpers');

/**
 * Save data to cache
 *
 * @param {*} logger
 * @param {*} rawData
 */
const execute = async (logger, rawData) => {
  const data = rawData;

  const { symbol, saveToCache } = data;

  if (saveToCache !== true) {
    logger.info(
      { saveToCache },
      'Saving to cache is not approved. Do not save to cache'
    );
    return data;
  }

  const document = _.omit(data, [
    'closedTrades',
    'accountInfo',
    'symbolConfiguration.symbols',
    'tradingView'
  ]);

  const filter = { symbol };

  // await cache.hset(
  //   'trailing-trade-symbols',
  //   `${symbol}-document`,
  //   JSON.stringify(document)
  // );

  await mongo.upsertOne(logger, 'trailing-trade-cache', filter, document);

  return data;
};

module.exports = { execute };
