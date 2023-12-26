const path = require('path');
const { logger: rootLogger, mongo } = require('./helpers');
const { runBinance } = require('./server-binance');
const { runCronjob } = require('./server-cronjob');
const { runFrontend } = require('./server-frontend');
// const { runTradingView } = require('./server-tradingview');

global.appRoot = path.resolve(__dirname);

(async () => {
  const logger = rootLogger.child({
    gitHash: process.env.GIT_HASH || 'unspecified'
  });

  await mongo.connect(logger);

  await Promise.all([
    runBinance(logger),
    runCronjob(logger),
    // runTradingView(logger),
    runFrontend(logger)
  ]);
})();
