import { createSelector } from 'reselect'
import { currySelector } from 'Utilities/selector'

import { getWallet, getWalletWithHoldings } from './wallet'
import { getDefaultPortfolioWalletIds } from './portfolio'

const getAccountSearchState = ({ accountSearch }) => accountSearch

export const getAccountSearchPending = createSelector(getAccountSearchState, ({ pending }) => pending)
export const getAccountSearchError = createSelector(getAccountSearchState, ({ error }) => error)
export const getAccountSearchResultId = createSelector(getAccountSearchState, ({ resultId }) => resultId)
export const getAccountSearchResultWallet = currySelector(getWallet, getAccountSearchResultId)
export const getAccountSearchResultWalletWithHoldings = currySelector(getWalletWithHoldings, getAccountSearchResultId)
export const isAccountSearchResultWalletInPortfolio = createSelector(
  getAccountSearchResultId,
  getDefaultPortfolioWalletIds,
  (resultWalletId, defaultPortfolioIds) => defaultPortfolioIds.includes(resultWalletId))
