const _ = require('lodash');
const moment = require('moment');
const queue = require('../../../cronjob/trailingTradeHelper/queue');

const handleManualTrade = async (logger, ws, payload) => {
  logger.info({ payload }, 'Start manual trade');

  const {
    data: { symbol, order }
  } = payload;

  await queue.execute(logger, symbol, {
    correlationId: _.get(logger, 'fields.correlationId', ''),
    type: 'saveOverrideAction',
    overrideData: {
      action: 'manual-trade',
      order,
      actionAt: moment().toISOString(),
      triggeredBy: 'user'
    },
    overrideReason:
      'The manual order received by the bot. Wait for placing the order.'
  });

  ws.send(
    JSON.stringify({
      result: true,
      type: 'manual-trade-result',
      message: 'The order has been received.'
    })
  );
};

module.exports = { handleManualTrade };
