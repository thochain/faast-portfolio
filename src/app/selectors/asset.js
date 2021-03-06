import { createSelector } from 'reselect'

import { toBigNumber } from 'Utilities/convert'
import { mapValues } from 'Utilities/helpers'
import { createItemSelector, selectItemId, fieldSelector } from 'Utilities/selector'

export const getAssetState = ({ asset }) => asset

export const getAllAssets = createSelector(getAssetState, ({ data }) => mapValues(data, (asset) => {
  const { price, change1, change24, change7d, volume24, marketCap, availableSupply, lastUpdatedPrice } = asset
  return {
    ...asset,
    price: toBigNumber(price),
    change1: toBigNumber(change1),
    change24: toBigNumber(change24),
    change7d: toBigNumber(change7d),
    volume24: toBigNumber(volume24),
    marketCap: toBigNumber(marketCap),
    availableSupply: toBigNumber(availableSupply),
    lastUpdatedPrice: new Date(Number.parseInt(lastUpdatedPrice) * 1000),
  }
}))
export const getAllAssetsArray = createSelector(getAllAssets, Object.values)

export const areAssetsLoading = createSelector(getAssetState, ({ loading }) => loading)
export const areAssetsLoaded = createSelector(getAssetState, ({ loaded }) => loaded)
export const getAssetsLoadingError = createSelector(getAssetState, ({ loadingError }) => loadingError)

export const areAssetPricesLoading = createSelector(getAssetState, ({ pricesLoading }) => pricesLoading)
export const areAssetPricesLoaded = createSelector(getAssetState, ({ loaded, pricesLoaded }) => loaded && pricesLoaded)
export const getAssetPricesError = createSelector(getAssetState, ({ loadingError, pricesError }) => loadingError || pricesError)

export const getNumberOfAssets = createSelector(getAllAssetsArray, (assets) => assets.length)

export const getAssetIndexPage = createItemSelector(
  getAllAssetsArray,
  selectItemId, 
  (allAssets, { page, limit, sortField }) => {
    return allAssets.sort((a, b) => b[sortField].comparedTo(a[sortField])).slice(page * limit, page * limit + limit)
  })

export const getAsset = createItemSelector(getAllAssets, selectItemId, (allAssets, id) => allAssets[id])
export const getAssetPrice = createItemSelector(getAsset, fieldSelector('price'))
export const getAssetIconUrl = createItemSelector(getAsset, fieldSelector('iconUrl'))
export const isAssetPriceLoading = createItemSelector(getAsset, fieldSelector('priceLoading'))
export const isAssetPriceLoaded = createItemSelector(getAsset, fieldSelector('priceLoaded'))
