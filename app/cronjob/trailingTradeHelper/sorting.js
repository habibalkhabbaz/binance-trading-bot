const _ = require('lodash');
const { getOpenTradesSymbols } = require('./common');

const sortingAlpha = (symbols, direction) =>
  _.orderBy(symbols, s => s.symbol, direction);

const sortingHybrid = (symbols, direction) =>
  _.orderBy(
    symbols,
    ['buy.liquidity', 'buy.resistanceDifference'],
    [direction, direction === 'desc' ? 'asc' : 'desc']
  );

const sortingMarketSpread = (symbols, direction) =>
  _.orderBy(
    symbols,
    s =>
      s.buy.marketSpread !== null
        ? s.buy.marketSpread
        : direction === 'asc'
        ? 999
        : -999,
    direction
  );

const sortingLiquidity = (symbols, direction) =>
  _.orderBy(
    symbols,
    s =>
      s.buy.liquidity !== null
        ? s.buy.liquidity
        : direction === 'asc'
        ? 999
        : -999,
    direction
  );
const sortingSellProfit = (symbols, direction) =>
  _.orderBy(
    symbols,
    s =>
      s.sell.currentProfitPercentage !== null
        ? s.sell.currentProfitPercentage
        : direction === 'asc'
        ? 999
        : -999,
    direction
  );

const sortingBuyDifference = (symbols, direction) =>
  _.orderBy(
    symbols,
    s =>
      s.buy.difference !== null
        ? s.buy.difference
        : direction === 'asc'
        ? 999
        : -999,
    direction
  );

const sortingDefault = (symbols, direction) =>
  _.orderBy(
    symbols,
    s => {
      if (s.buy.openOrders.length > 0) {
        const openOrder = s.buy.openOrders[0];
        if (openOrder.differenceToCancel) {
          return (openOrder.differenceToCancel + 3000) * -10;
        }
      }
      if (s.sell.openOrders.length > 0) {
        const openOrder = s.sell.openOrders[0];
        if (openOrder.differenceToCancel) {
          return (openOrder.differenceToCancel + 2000) * -10;
        }
      }
      if (s.sell.difference) {
        return (s.sell.difference + 1000) * -10;
      }
      return s.buy.difference;
    },
    direction
  );

// eslint-disable-next-line no-unused-vars
const sortingSymbols = async (
  logger,
  orgSymbols,
  { selectedSortOption, searchKeyword, direction }
) => {
  let symbols = orgSymbols;

  if (searchKeyword) {
    symbols =
      searchKeyword === 'open trades'
        ? await getOpenTradesSymbols(logger)
        : orgSymbols.filter(s =>
            s.symbol.toLowerCase().includes(searchKeyword.toLowerCase())
          );
  }

  const sortingMaps = {
    default: {
      sortingFunc: sortingDefault
    },
    'buy-difference': {
      sortingFunc: sortingBuyDifference
    },
    'sell-profit': {
      sortingFunc: sortingSellProfit
    },
    alpha: {
      sortingFunc: sortingAlpha
    },
    liquidity: {
      sortingFunc: sortingLiquidity
    },
    hybrid: {
      sortingFunc: sortingHybrid
    },
    'market-spread': {
      sortingFunc: sortingMarketSpread
    }
  };

  const sortingMap = sortingMaps[selectedSortOption];

  return sortingMap.sortingFunc(symbols, direction);
};

module.exports = {
  sortingSymbols
};
