const _ = require('lodash');
const moment = require('moment');
const queue = require('../../../cronjob/trailingTradeHelper/queue');

const handleSymbolTriggerSell = async (logger, ws, payload) => {
  logger.info({ payload }, 'Start symbol trigger sell');

  const { data: symbolInfo } = payload;

  const { symbol } = symbolInfo;

  await queue.execute(logger, symbol, {
    correlationId: _.get(logger, 'fields.correlationId', ''),
    type: 'saveOverrideAction',
    overrideData: {
      action: 'sell',
      actionAt: moment().toISOString(),
      triggeredBy: 'user'
    },
    overrideReason:
      'The sell order received by the bot. Wait for placing the order.'
  });

  ws.send(JSON.stringify({ result: true, type: 'symbol-trigger-sell-result' }));
};

module.exports = { handleSymbolTriggerSell };
