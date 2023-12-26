const { v4: uuidv4 } = require('uuid');
const _ = require('lodash');
const { binance } = require('../helpers');
const queue = require('../cronjob/trailingTradeHelper/queue');

const {
  updateAccountInfo,
  getAccountInfoFromAPI
} = require('../cronjob/trailingTradeHelper/common');

let userClean;

const setupUserWebsocket = async logger => {
  if (userClean) {
    logger.info('Existing opened socket for user found, clean first');
    userClean();
  }

  userClean = await binance.client.ws.user(evt => {
    const { eventType } = evt;

    logger.info({ evt }, 'Received new user activity');

    if (['balanceUpdate', 'account'].includes(eventType)) {
      getAccountInfoFromAPI(logger);
    }

    if (eventType === 'outboundAccountPosition') {
      const { balances, lastAccountUpdate } = evt;
      updateAccountInfo(logger, balances, lastAccountUpdate);
    }

    if (eventType === 'executionReport') {
      const { symbol, side, orderStatus, orderId } = evt;

      const correlationId = uuidv4();
      const symbolLogger = logger.child({
        correlationId,
        symbol
      });

      symbolLogger.info(
        { evt, saveLog: true },
        `There is a new update in order. ${orderId} - ${side} - ${orderStatus}`
      );

      queue.execute(symbolLogger, symbol, {
        correlationId,
        type: 'checkOrder',
        evt
      });
    }
  });
};

module.exports = { setupUserWebsocket };
