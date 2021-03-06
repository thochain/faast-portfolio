import { createSelector } from 'reselect'
import { union } from 'lodash'

import { ZERO, toUnit, toPercentage } from 'Utilities/convert'
import { fixPercentageRounding, reduceByKey, mapValues } from 'Utilities/helpers'
import { createItemSelector, selectItemId } from 'Utilities/selector'

import { MultiWallet } from 'Services/Wallet'
import { getAllAssets, areAssetPricesLoaded, getAssetPricesError } from './asset'

const getWalletState = ({ wallet }) => wallet

const doGetWallet = (walletState, id) => {
  const wallet = walletState[id]
  if (!wallet) {
    return wallet
  }
  const nestedWallets = wallet.nestedWalletIds.map((nestedWalletId) => doGetWallet(walletState, nestedWalletId)).filter(Boolean)
  let { balances, balancesLoaded, balancesUpdating, balancesError, supportedAssets, unsendableAssets } = wallet
  if (wallet.type.includes(MultiWallet.type)) {
    if (nestedWallets.length) {
      balances = reduceByKey(nestedWallets.map((w) => w.balances), (x, y) => x.plus(y), ZERO)
      balancesLoaded = nestedWallets.every((w) => w.balancesLoaded)
      balancesUpdating = nestedWallets.some((w) => w.balancesUpdating)
      balancesError = nestedWallets.map((w) => w.balancesError).find(Boolean) || ''
      supportedAssets = union(...nestedWallets.map((w) => w.supportedAssets))
      unsendableAssets = union(...nestedWallets.map((w) => w.unsendableAssets))
    } else {
      balancesLoaded = true
    }
  }
  return {
    ...wallet,
    nestedWallets,
    balances,
    balancesLoaded,
    balancesUpdating,
    balancesError,
    supportedAssets,
    unsendableAssets,
  }
}

export const getWallet = createItemSelector(
  getWalletState,
  selectItemId,
  doGetWallet
)

export const getAllWallets = (state) => mapValues(getWalletState(state), (_, id) => getWallet(state, id))
export const getAllWalletsArray = createSelector(getAllWallets, Object.values)
export const getAllWalletIds = createSelector(getAllWallets, Object.keys)
export const getLeafWalletIds = createSelector(
  getAllWalletsArray,
  (wallets) => wallets
    .filter(({ type }) => !type.includes(MultiWallet.type))
    .map(({ id }) => id)
)

export const getAllWalletsBasedOnSymbol = createItemSelector(
  getAllWalletsArray,
  selectItemId,
  (wallets, symbol) => wallets.filter(({ id, supportedAssets, nestedWalletIds }) => id !== 'default' && supportedAssets.includes(symbol) && nestedWalletIds.length == 0))

export const getWalletParents = createItemSelector(
  getAllWallets,
  selectItemId,
  (allWallets, id) => Object.values(allWallets).reduce(
    (result, parent) => (parent && parent.type.includes(MultiWallet.type) && parent.nestedWalletIds.includes(id)) ? [...result, parent] : result,
    [])
)

export const areWalletBalancesUpdating = createItemSelector(
  getWallet,
  ({ balancesUpdating }) => balancesUpdating
)

export const areWalletHoldingsLoaded = createItemSelector(
  getWallet,
  areAssetPricesLoaded,
  (wallet, assetPricesLoaded) => wallet && wallet.balancesLoaded && assetPricesLoaded
)

export const getWalletHoldingsError = createItemSelector(
  getWallet,
  getAssetPricesError,
  (wallet, assetPricesError) => wallet && wallet.balancesError || assetPricesError
)

export const getWalletWithHoldings = createItemSelector(
  getWallet,
  getAllAssets,
  areWalletHoldingsLoaded,
  getWalletHoldingsError,
  (wallet, assets, holdingsLoaded, holdingsError) => {
    if (!wallet) return null
    let totalFiat = ZERO
    let totalFiat24hAgo = ZERO
    const balances = wallet.balances || {}
    let assetHoldings = wallet.supportedAssets
      .map((symbol) => assets[symbol])
      .filter((asset) => typeof asset === 'object' && asset !== null)
      .map((asset) => {
        const { symbol, price = ZERO, change24 = ZERO } = asset
        const balance = balances[symbol] || ZERO
        const shown = balance.greaterThan(0)
        const fiat = toUnit(balance, price, 2)
        const price24hAgo = price.div(change24.plus(100).div(100))
        const fiat24hAgo = toUnit(balance, price24hAgo, 2)
        totalFiat = totalFiat.plus(fiat)
        totalFiat24hAgo = totalFiat24hAgo.plus(fiat24hAgo)
        return {
          ...asset,
          balance,
          shown,
          fiat,
          fiat24hAgo,
        }
      })
      .filter(({ shown }) => shown)
      .map((holding) => ({
        ...holding,
        percentage: toPercentage(holding.fiat, totalFiat)
      }))
      .sort((a, b) => b.fiat.minus(a.fiat).toNumber())
    assetHoldings = fixPercentageRounding(assetHoldings, totalFiat)
    const totalChange = totalFiat.minus(totalFiat24hAgo).div(totalFiat24hAgo).times(100)
    const result = {
      ...wallet,
      totalFiat,
      totalFiat24hAgo,
      totalChange,
      assetHoldings,
      holdingsLoaded,
      holdingsError,
    }
    return result
  }
)

export const getHoldingsByAsset = createItemSelector(
  getAllWalletsArray,
  selectItemId,
  (wallets, symbol) => {
    let balance = undefined;
    wallets.map(({ id, balances }) => {
      if (id === 'default') {
        balance = balances[symbol]
      }
    })
    return balance
  }
)