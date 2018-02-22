import { createAction } from 'redux-act'

import { processArray } from 'Utilities/helpers'
import { getSwapStatus, statusAllSwaps } from 'Utilities/swap'
import { restoreFromAddress } from 'Utilities/storage'
import log from 'Utilities/log'
import {
  toBigNumber,
  toHex,
  toPrecision,
  toUnit
} from 'Utilities/convert'
import {
  getTransactionReceipt,
  getTransaction
} from 'Utilities/wallet'
import walletService, { Wallet, MultiWallet, EthereumWalletWeb3 } from 'Services/Wallet'

import { insertSwapData, updateSwapTx, setSwap } from 'Actions/redux'
import { getMarketInfo, postExchange, getOrderStatus, getSwundle } from 'Actions/request'
import { mockTransaction, mockPollTransactionReceipt, mockPollOrderStatus, clearMockIntervals } from 'Actions/mock'
import {
  addWallet, removeWallet, addNestedWallet, restoreAllWallets, updateWalletBalances,
} from 'Actions/wallet'
import { retrieveAssetPrices } from 'Actions/asset'

import {
  getCurrentPortfolio, getCurrentPortfolioId
} from 'Selectors'

export const defaultPortfolioId = 'default'

export const setCurrentPortfolio = createAction('SET_CURRENT_PORTFOLIO')
export const setCurrentWallet = createAction('SET_CURRENT_WALLET')
export const portfolioAdded = createAction('PORTFOLIO_ADDED')

export const openWallet = (walletInstance, isMocking) => (dispatch, getState) => Promise.resolve()
  .then(() => {
    if (!(walletInstance instanceof Wallet)) {
      throw new Error('Instance of Wallet required')
    }
    return walletInstance.getId()
  })
  .then(() => dispatch(addWallet(walletInstance)))
  .then((wallet) => {
    const { id: walletId } = wallet
    return dispatch(addNestedWallet(defaultPortfolioId, walletId))
      .then(() => {
        const currentPortfolio = getCurrentPortfolio(getState())
        if (currentPortfolio.type === MultiWallet.type) {
          if (currentPortfolio.id !== defaultPortfolioId) {
            return dispatch(addNestedWallet(currentPortfolio.id, walletId))
          }
        } else {
          return dispatch(setCurrentPortfolio(defaultPortfolioId))
        }
      })
      .then(() => dispatch(restoreSwapsForWallet(walletId, isMocking)))
  })

export const removePortfolio = (id) => (dispatch) => Promise.resolve()
  .then(() => {
    if (id === defaultPortfolioId) {
      throw new Error('Cannot delete default portfolio');
    }
    return dispatch(removeWallet(id))
  })

export const closeCurrentPortfolio = () => (dispatch, getState) => {
  clearAllIntervals()
  const currentPortfolioId = getCurrentPortfolioId(getState())
  return dispatch(removePortfolio(currentPortfolioId))
    .then(() => log.info('portfolio closed'))
}

export const addPortfolio = (walletInstance, setCurrent = false) => (dispatch) => Promise.resolve()
  .then(() => dispatch(addWallet(walletInstance)))
  .then((wallet) => {
    dispatch(portfolioAdded(wallet.id))
    if (setCurrent) {
      dispatch(setCurrentPortfolio(wallet.id))
    }
    return wallet
  })

export const createNewPortfolio = (setCurrent = false) => (dispatch) => Promise.resolve()
  .then(() => dispatch(addPortfolio(new MultiWallet(), setCurrent)))

export const createViewOnlyPortfolio = (address, setCurrent = false) => (dispatch) => Promise.resolve()
  .then(() => {
    if (!address) {
      throw new Error('invalid view only address')
    }
    const wallet = new EthereumWalletWeb3(address)
    wallet.setPersistAllowed(false)
    wallet.isReadOnly = true
    return dispatch(addPortfolio(wallet, setCurrent))
  })

const createDefaultPortfolio = () => (dispatch) => Promise.resolve()
  .then(() => {
    const wallet = new MultiWallet(defaultPortfolioId)
    wallet.setPersistAllowed(false)
    wallet.setLabel('All Accounts')
    return dispatch(addPortfolio(wallet, false))
  })

export const restoreAllPortfolios = () => (dispatch) => dispatch(restoreAllWallets())
  .then((plainWallets) => dispatch(createDefaultPortfolio())
    .then(() => Promise.all(plainWallets.map(({ id, type }) => {
      if (type === MultiWallet.type) {
        dispatch(portfolioAdded(id))
      } else {
        return dispatch(addNestedWallet(defaultPortfolioId, id))
      }
    }))))

export const updateHoldings = (walletId) => (dispatch) => {
  return Promise.all([
    dispatch(retrieveAssetPrices()),
    dispatch(updateWalletBalances(walletId)),
  ]).catch(log.error)
}

export const updateAllHoldings = () => (dispatch) => {
  return Promise.all([
    dispatch(retrieveAssetPrices()),
    dispatch(updateWalletBalances(defaultPortfolioId)),
  ]).catch(log.error)
}

const getCurrentPortfolioInstance = () => (dispatch, getState) => walletService.get(getCurrentPortfolioId(getState()))

const swapFinish = (type, swap, error, addition) => {
  return (dispatch) => {
    const errors = swap.errors || []
    if (error) {
      errors.push({ [type]: new Error(error) })
      dispatch(insertSwapData(swap.from, swap.to, { errors }))
    }
    return Object.assign({}, swap, addition, { errors })
  }
}

const swapMarketInfo = (swapList) => (dispatch) => {
  return processArray(swapList, (a) => {
    const finish = (e, x) => dispatch(swapFinish('swapMarketInfo', a, e, x))
    if (a.from === a.to) return finish('cannot swap to same asset')

    return dispatch(getMarketInfo(a.pair))
      .then((res) => {
        log.debug('marketinfo response', res)
        if (!res.pair) {
          return finish('error getting details')
        }
        if (res.hasOwnProperty('minimum') && a.amount.lessThan(res.minimum)) {
          return finish(`minimum amount is ${res.minimum}`)
        }
        if (res.hasOwnProperty('min') && a.amount.lessThan(res.min)) {
          return finish(`minimum amount is ${res.min}`)
        }
        if ((res.hasOwnProperty('limit') && a.amount.greaterThan(res.limit)) || (res.maxLimit && a.amount.greaterThan(res.maxLimit))) {
          return finish(`maximum amount is ${res.limit}`)
        }
        const fee = res.hasOwnProperty('outgoing_network_fee') ? toBigNumber(res.outgoing_network_fee) : toBigNumber(res.minerFee)
        const rate = toBigNumber(res.rate)
        dispatch(insertSwapData(a.from, a.to, {
          rate,
          fee
        }))
        return finish(null, { rate, fee })
      })
      .catch((e) => {
        log.error(e)
        return finish('error getting details')
      })
  })
}

const swapPostExchange = (swapList, wallet) => (dispatch) => {
  return processArray(swapList, (swap) => {
    const finish = (e, x) => dispatch(swapFinish('swapPostExchange', swap, e, x))
    const walletInstance = walletService.get(wallet.id)
    return Promise.all([
      walletInstance.getFreshAddress(swap.to),
      walletInstance.getFreshAddress(swap.from),
    ]).then(([withdrawalAddress, returnAddress]) => dispatch(postExchange({
      pair: swap.pair,
      withdrawal: withdrawalAddress,
      returnAddress,
    }))).then((order) => {
      const fromAsset = order.depositType.toUpperCase()
      const toAsset = order.withdrawalType.toUpperCase()
      return walletInstance.createTransaction(order.deposit, swap.amount, fromAsset)
        .then((tx) => {
          dispatch(insertSwapData(fromAsset, toAsset, {
            order,
            tx
          }))
          return finish(null, { order, tx })
        })
    }).catch((e) => {
      log.error(e)
      return finish('problem generating tx')
    })
  })
}

// Checks to see if the deposit is high enough for the rate and swap fee
// so the expected amount ends up larger than zero
const swapSufficientDeposit = (swapList, wallet) => (dispatch) => {
  return processArray(swapList, (a) => {
    const finish = (e, x) => dispatch(swapFinish('swapSufficientDeposit', a, e, x))
    console.log('a', a)
    const to = wallet.assetHoldings.find(b => b.symbol === a.to)
    const expected = toPrecision(toUnit(a.amount, a.rate, to.decimals).minus(a.fee), to.decimals)
    if (expected.lessThanOrEqualTo(0)) {
      return finish('insufficient deposit for expected return')
    }
    return finish()
  })
}

// Checks to see if there will be enough Ether if the full gas amount is paid
const swapSufficientFees = (swapList, wallet) => (dispatch) => {
  let adjustedBalances = { ...wallet.balances }
  return processArray(swapList, (a) => {
    const finish = (e, x) => dispatch(swapFinish('swapSufficientFees', a, e, x))
    const { from, amount, tx } = a
    const { feeAmount, feeAsset } = tx
    adjustedBalances[from] = adjustedBalances[from].minus(amount)
    if (feeAmount) {
      adjustedBalances[feeAsset] = adjustedBalances[feeAsset].minus(feeAmount)
    }
    if (adjustedBalances[feeAsset].isNegative()) {
      return finish(`not enough ${feeAsset} for tx fee`)
    }
    return finish()
  })
}

export const initiateSwaps = (swap, wallet) => (dispatch) => {
  log.info('swap submit initiated')
  const swapList = swap.reduce((a, b) => {
    return a.concat(b.list.map((c) => {
      return {
        from: b.symbol,
        to: c.symbol,
        amount: c.unit,
        pair: b.symbol.toLowerCase() + '_' + c.symbol.toLowerCase()
      }
    }))
  }, [])
  return dispatch(swapMarketInfo(swapList))
    .then((a) => dispatch(swapPostExchange(a, wallet)))
    .then((a) => dispatch(swapSufficientDeposit(a, wallet)))
    .then((a) => dispatch(swapSufficientFees(a, wallet)))
}

const createTransferEventListeners = (dispatch, send, receive, markSigned) => {
  let txId
  return {
    onTxHash: (txHash) => {
      log.info(`tx hash obtained - ${txHash}`)
      txId = txHash
      dispatch(insertSwapData(send.symbol, receive.symbol, { txHash }))
      if (markSigned) dispatch(updateSwapTx(send.symbol, receive.symbol, { signed: true }))
    },
    onReceipt: (receipt) => {
      log.info('tx receipt obtained')
      dispatch(updateSwapTx(send.symbol, receive.symbol, { receipt }))
    },
    onConfirmation: (conf) => {
      log.info(`tx confirmation obtained - ${conf}`)
      dispatch(updateSwapTx(send.symbol, receive.symbol, { confirmations: conf }))
    },
    onError: (error) => {
      log.error(error)
      // Don't mark the following as a tx error, start polling for receipt instead
      if (error.message.includes('Transaction was not mined within')) {
        return dispatch(pollTransactionReceipt(send, receive, txId))
      }
      const declined = error.message.includes('User denied transaction signature')
      dispatch(insertSwapData(send.symbol, receive.symbol, { error, declined }))
    }
  }
}

export const sendSwapDeposits = (swap, options, isMocking) => (dispatch) => {
  return processArray(swap, (send) => {
    return processArray(send.list, (receive) => {
      if (isMocking) {
        return dispatch(mockTransaction(send, receive))
      }
      const eventListeners = createTransferEventListeners(dispatch, send, receive, true)
      return dispatch(getCurrentPortfolioInstance()).sendTransaction(receive.tx, { ...eventListeners, ...options })
        .then(() => dispatch(pollOrderStatus(send, receive)))
    })
  })
}

export const pollOrderStatus = (send, receive) => (dispatch) => {
  const orderStatusInterval = window.setInterval(() => {
    dispatch(getOrderStatus(send.symbol, receive.symbol, receive.order.deposit, receive.order.created))
    .then((order) => {
      if (order && (order.status === 'complete' || order.status === 'failed')) {
        return window.clearInterval(orderStatusInterval)
      }
    })
    .catch(log.error)
  }, 10000)

  window.faast.intervals.orderStatus.push(orderStatusInterval)
}

export const pollTransactionReceipt = (send, receive, tx) => (dispatch) => {
  const txHash = tx || receive.txHash
  if (!txHash) {
    const error = new Error('tx hash is missing, unable to poll for receipt')
    log.error(error)
    return dispatch(insertSwapData(send.symbol, receive.symbol, { error }))
  }
  const receiptInterval = window.setInterval(() => {
    getTransactionReceipt(txHash)
    .then((receipt) => {
      if (receipt) {
        window.clearInterval(receiptInterval)
        log.info('tx receipt obtained')
        dispatch(updateSwapTx(send.symbol, receive.symbol, { receipt }))
        dispatch(pollOrderStatus(send, receive))
      }
    })
    .catch(log.error)
  }, 5000)

  window.faast.intervals.txReceipt.push(receiptInterval)
}

export const restorePolling = (swap, isMocking) => (dispatch) => {
  swap.forEach((send) => {
    if (send && send.list) {
      send.list.forEach((receive) => {
        const status = getSwapStatus(receive)
        if (status.details === 'waiting for transaction receipt') {
          if (isMocking) {
            dispatch(mockPollTransactionReceipt(send, receive))
          } else {
            dispatch(pollTransactionReceipt(send, receive))
          }
        } else if (status.details === 'waiting for confirmations' || status.details === 'processing swap') {
          if (isMocking) {
            dispatch(mockPollOrderStatus(send, receive))
          } else {
            dispatch(pollOrderStatus(send, receive))
          }
        }
      })
    }
  })
}

export const restoreSwundle = (swundle) => (dispatch) => {
  if (validateSwundle(swundle)) {
    const newSwundle = swundle.map((send) => {
      return {
        symbol: send.symbol,
        list: send.list.map((receive) => {
          return {
            fee: toBigNumber(receive.fee),
            order: receive.order,
            rate: toBigNumber(receive.rate),
            symbol: receive.symbol,
            txHash: receive.txHash,
            unit: toBigNumber(receive.unit)
          }
        }),
        restored: true
      }
    })
    dispatch(setSwap(newSwundle))
    processArray(newSwundle, (send) => {
      return processArray(send.list, (receive) => {
        return getTransaction(receive.txHash)
          .then((tx) => {
            dispatch(updateSwapTx(send.symbol, receive.symbol, {
              gasPrice: toHex(tx.gasPrice),
              signed: true
            }))
          })
          .catch(log.error)
      })
    })
    // .then(() => {
      // receipt polling restoration is done in App component
      // when statusAllSwaps changes to pending_receipts_restored
    // })
    .catch(log.error)
  }
}

export const restoreSwapsForWallet = (walletId, isMocking) => (dispatch) => {
  const state = restoreFromAddress(walletId)

  if (state && state.swap && state.swap.length) {
    const status = statusAllSwaps(state.swap)
    const swap = (status === 'unavailable' || status === 'unsigned' || status === 'unsent') ? undefined : state.swap

    if (swap) {
      dispatch(setSwap(swap))
      dispatch(restorePolling(swap, isMocking))
    }
  } else {
    dispatch(getSwundle(walletId, isMocking))
  }
}

const validateSwundle = (swundle) => {
  if (!swundle) return false
  // if (swundle.version !== config.swundleVersion) return false // convert old to new swundle here
  if (!Array.isArray(swundle)) return false
  const sendSymbols = []
  return swundle.every((send) => {
    if (!send.symbol) return false
    if (sendSymbols.includes(send.symbol)) return false
    sendSymbols.push(send.symbol)
    return send.list.every((receive) => {
      const receiveSymbols = []
      if (!receive.symbol) return false
      if (receiveSymbols.includes(receive.symbol)) return false
      if (toBigNumber(receive.unit).lessThanOrEqualTo(0)) return false
      if (!receive.order || !receive.order.deposit || !receive.order.orderId) return false
      return true
    })
  })
}

export const clearAllIntervals = () => {
  clearMockIntervals()
  Object.keys(window.faast.intervals).forEach((key) => {
    window.faast.intervals[key].forEach(a => window.clearInterval(a))
  })
}
