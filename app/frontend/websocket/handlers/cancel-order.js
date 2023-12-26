const _ = require('lodash');
const moment = require('moment');
const queue = require('../../../cronjob/trailingTradeHelper/queue');

const handleCancelOrder = async (logger, ws, payload) => {
  logger.info({ payload }, 'Start cancel order');

  const {
    data: { symbol, order }
  } = payload;

  const { side } = order;

  await queue.execute(logger, symbol, {
    correlationId: _.get(logger, 'fields.correlationId', ''),
    type: 'saveOverrideAction',
    overrideData: {
      action: 'cancel-order',
      order,
      actionAt: moment().toISOString(),
      triggeredBy: 'user'
    },
    overrideReason:
      `Cancelling the ${side.toLowerCase()} order action has been received.` +
      `Wait for cancelling the order.`
  });

  ws.send(
    JSON.stringify({
      result: true,
      type: 'cancel-order-result',
      message: `Cancelling the ${side.toLowerCase()} order action has been received.`
    })
  );
};

module.exports = { handleCancelOrder };
