const _ = require('lodash');
const moment = require('moment');
const queue = require('../../../cronjob/trailingTradeHelper/queue');

const handleSymbolTriggerBuy = async (logger, ws, payload) => {
  logger.info({ payload }, 'Start symbol trigger buy');

  const { data: symbolInfo } = payload;

  const { symbol } = symbolInfo;

  await queue.execute(logger, symbol, {
    correlationId: _.get(logger, 'fields.correlationId', ''),
    type: 'saveOverrideAction',
    overrideData: {
      action: 'buy',
      actionAt: moment().toISOString(),
      triggeredBy: 'user',
      notify: true,
      // For triggering buy action must execute. So don't check TradingView recommendation.
      checkTradingView: false
    },
    overrideReason:
      'The buy order received by the bot. Wait for placing the order.'
  });

  ws.send(JSON.stringify({ result: true, type: 'symbol-trigger-buy-result' }));
};

module.exports = { handleSymbolTriggerBuy };
