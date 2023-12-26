/* eslint-disable no-await-in-loop */
const _ = require('lodash');
const {
  cancelOrder,
  isExceedingMaxOpenTrades,
  refreshOpenOrdersAndAccountInfo,
  getAccountInfoFromAPI
} = require('../../trailingTradeHelper/common');

/**
 *
 * Handle open orders
 *
 * @param {*} logger
 * @param {*} rawData
 */
const execute = async (logger, rawData) => {
  const data = rawData;

  const {
    symbol,
    action,
    openOrders,
    buy: { limitPrice: buyLimitPrice, currentPrice: buyCurrentPrice },
    sell: { limitPrice: sellLimitPrice, currentPrice: sellCurrentPrice },
    symbolInfo: {
      filterPrice: { tickSize }
    }
  } = data;

  if (action !== 'not-determined') {
    logger.info(
      { action },
      'Action is already defined, do not try to handle open orders.'
    );
    return data;
  }

  const pricePrecision =
    parseFloat(tickSize) === 1 ? 0 : tickSize.indexOf(1) - 1;

  // eslint-disable-next-line no-restricted-syntax
  for (const order of openOrders) {
    if (order.type !== 'STOP_LOSS_LIMIT') {
      // eslint-disable-next-line no-continue
      continue;
    }

    const orderStopPriceRounded = _.floor(order.stopPrice, pricePrecision);

    // Process buy order
    if (order.side.toLowerCase() === 'buy') {
      const buyLimitPriceRounded = _.floor(buyLimitPrice, pricePrecision);

      if (await isExceedingMaxOpenTrades(logger, data)) {
        // Cancel the initial buy order if max. open trades exceeded
        logger.info(
          { data, saveLog: true },
          `The current number of open trades has reached the maximum number of open trades. ` +
            `The buy order will be cancelled.`
        );

        // Cancel current order
        const cancelResult = await cancelOrder(logger, symbol, order);

        // Reset buy open orders
        if (cancelResult === false) {
          const {
            accountInfo,
            openOrders: updatedOpenOrders,
            buyOpenOrders
          } = await refreshOpenOrdersAndAccountInfo(logger, symbol);

          data.accountInfo = accountInfo;
          data.openOrders = updatedOpenOrders;
          data.buy.openOrders = buyOpenOrders;

          data.action = 'buy-order-checking';
        } else {
          data.buy.openOrders = [];

          // Set action as buy order cancelled
          data.action = 'buy-order-cancelled';

          data.accountInfo = await getAccountInfoFromAPI(logger);
        }
      } else if (
        orderStopPriceRounded > buyLimitPriceRounded ||
        buyCurrentPrice > parseFloat(order.price)
      ) {
        if (orderStopPriceRounded > buyLimitPriceRounded) {
          // Is the buy order stop price higher than current buy limit price?
          logger.info(
            { stopPrice: order.stopPrice, buyLimitPriceRounded, saveLog: true },
            'Buy order stop price is higher than current buy limit price, cancel current buy order'
          );
        }

        if (buyCurrentPrice > parseFloat(order.price)) {
          // Is the current price higher than buy order price?
          logger.info(
            { stopPrice: order.stopPrice, buyLimitPriceRounded, saveLog: true },
            'Current price is higher than buy order price, cancel current buy order'
          );
        }

        // Cancel current order
        const cancelResult = await cancelOrder(logger, symbol, order);
        if (cancelResult === false) {
          // If cancelling the order is failed, it means the order may already be executed or does not exist anymore.
          // Hence, refresh the order and process again in the next tick.
          // Get open orders and update cache
          const {
            accountInfo,
            openOrders: updatedOpenOrders,
            buyOpenOrders
          } = await refreshOpenOrdersAndAccountInfo(logger, symbol);

          data.accountInfo = accountInfo;
          data.openOrders = updatedOpenOrders;
          data.buy.openOrders = buyOpenOrders;

          data.action = 'buy-order-checking';
        } else {
          // Reset buy open orders
          data.buy.openOrders = [];

          // Set action as buy order
          data.action = 'buy';

          data.accountInfo = await getAccountInfoFromAPI(logger);
        }
      } else {
        logger.info(
          { stopPrice: order.stopPrice, buyLimitPriceRounded },
          'Stop price is less than buy limit price, wait for buy order'
        );
        // Set action as buy
        data.action = 'buy-order-wait';
      }
    }

    if (order.side.toLowerCase() === 'sell') {
      const sellLimitPriceRounded = _.floor(sellLimitPrice, pricePrecision);
      if (
        orderStopPriceRounded < sellLimitPriceRounded ||
        sellCurrentPrice < parseFloat(order.price)
      ) {
        if (orderStopPriceRounded < sellLimitPriceRounded) {
          // Is the sell order stop price lower than current sell limit price?
          logger.error(
            {
              stopPrice: order.stopPrice,
              sellLimitPriceRounded,
              saveLog: true
            },
            'Sell order stop price is less than current sell limit price, cancel current sell order'
          );
        }

        if (sellCurrentPrice < parseFloat(order.price)) {
          // Is the current price less than sell order price?
          logger.error(
            {
              stopPrice: order.stopPrice,
              sellLimitPriceRounded,
              saveLog: true
            },
            'Current price is less than sell order price, cancel current sell order'
          );
        }

        // Cancel current order
        const cancelResult = await cancelOrder(logger, symbol, order);
        if (cancelResult === false) {
          // If cancelling the order is failed, it means the order may already be executed or does not exist anymore.
          // Hence, refresh the order and process again in the next tick.
          // Get open orders and update cache

          const {
            accountInfo,
            openOrders: updatedOpenOrders,
            sellOpenOrders
          } = await refreshOpenOrdersAndAccountInfo(logger, symbol);

          data.accountInfo = accountInfo;
          data.openOrders = updatedOpenOrders;
          data.sell.openOrders = sellOpenOrders;

          data.action = 'sell-order-checking';
        } else {
          // Reset sell open orders
          data.sell.openOrders = [];

          // Set action as sell
          data.action = 'sell';

          // Refresh account info
          data.accountInfo = await getAccountInfoFromAPI(logger);
        }
      } else {
        logger.info(
          { stopPrice: order.stopPrice, sellLimitPriceRounded },
          'Stop price is higher than sell limit price, wait for sell order'
        );
        data.action = 'sell-order-wait';
      }
    }
    logger.info({ action: data.action }, 'Determined action');
  }

  return data;
};

module.exports = { execute };
