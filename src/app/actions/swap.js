import { flatten } from 'lodash'
import uuid from 'uuid/v4'
import { toNumber } from 'Utilities/convert'
import { MultiWallet } from 'Services/Wallet'
import { newScopedCreateAction, idPayload } from 'Utilities/action'
import { getWalletForAsset } from 'Utilities/wallet'
import log from 'Log'
import Faast from 'Services/Faast'
import toastr from 'Utilities/toastrWrapper'

import { createTx, signTx, sendTx, updateTxReceipt, pollTxReceipt } from 'Actions/tx'
import { defaultPortfolioId } from 'Actions/portfolio'

import { getSwap, getTx, getWallet } from 'Selectors'

const createAction = newScopedCreateAction(__filename)

export const resetSwaps = createAction('RESET_ALL')
export const swapsRetrieved = createAction('RESTORED')
export const swapAdded = createAction('ADDED')
export const swapRemoved = createAction('REMOVED', (id) => ({ id }))
export const swapUpdated = createAction('UPDATED', (id, data) => ({ id, ...data }))
export const swapError = createAction('ERROR', (id, error, errorType = '') => ({ id, error, errorType }))
export const swapOrderStatusUpdated = createAction('STATUS_UPDATED', (id, status) => ({ id, orderStatus: status }))
export const swapTxIdUpdated = createAction('TX_ID_UPDATED', (id, txId) => ({ id, txId }))

export const swapInitStarted = createAction('INIT_STARTED', idPayload)
export const swapInitSuccess = createAction('INIT_SUCCESS', idPayload)
export const swapInitFailed = createAction('INIT_FAILED', (id, errorMessage) => ({ id, error: errorMessage }))

export const retrieveSwaps = (walletId) => (dispatch, getState) => {
  const wallet = getWallet(getState(), walletId)
  if (!wallet) {
    log.warn(`Cannot retrieve swaps for unknown wallet ${walletId}`)
    return
  }
  if (wallet.type.includes(MultiWallet.type)) {
    return Promise.all(wallet.nestedWalletIds.map((nestedWalletId) => dispatch(retrieveSwaps(nestedWalletId))))
      .then(flatten)
  }
  return Faast.fetchOrders(walletId)
    .then((orders) => dispatch(swapsRetrieved(orders)).payload)
}

export const retrieveAllSwaps = () => (dispatch) => {
  return dispatch(retrieveSwaps(defaultPortfolioId))
}

export const restoreSwapTxIds = (swapIdToTxId) => (dispatch) => {
  Object.entries(swapIdToTxId).forEach(([swapId, txId]) => dispatch(swapTxIdUpdated(swapId, txId)))
}

export const addSwap = (swap) => (dispatch) => {
  return dispatch(swapAdded(swap)).payload
}

export const removeSwap = (swapOrId) => (dispatch) => {
  const id = typeof swapOrId !== 'string' ? swapOrId.id : swapOrId
  dispatch(swapRemoved(id))
}

const createSwapFinish = (type, swap) => (dispatch, getState) => (errorMessage, updatedFields) => {
  if (errorMessage) {
    dispatch(swapError(swap.id, errorMessage, type))
  }
  if (updatedFields && Object.keys(updatedFields).length > 0) {
    dispatch(swapUpdated(swap.id, updatedFields))
  }
  return getSwap(getState(), swap.id)
}

export const createOrder = (swap) => (dispatch, getState) => Promise.resolve().then(() => {
  if (swap.error) return swap
  const finish = dispatch(createSwapFinish('createOrder', swap))
  const { id, receiveAddress, refundAddress, sendAmount, sendSymbol, receiveSymbol, sendWalletId } = swap
  log.info(`Creating faast order for swap ${id}`)
  return Faast.createNewOrder({
    sendSymbol,
    receiveSymbol,
    receiveAddress,
    refundAddress,  // optional
    sendAmount: toNumber(sendAmount), // optional
    userId: sendWalletId, // optional
  })
    .then((order) => {
      finish(null, order)
      return getSwap(getState(), swap.id)
    })
    .catch((e) => {
      log.error('createOrder', e)
      return finish(`Error creating swap for pair ${sendSymbol}->${receiveSymbol}, please contact support@faa.st`)
    })
})

export const createOrderWithWallets = (swap) => (dispatch) => Promise.resolve().then(() => {
  if (swap.error) return swap
  const finish = dispatch(createSwapFinish('createOrderWithWallets', swap))
  const { sendAmount, sendSymbol, receiveSymbol } = swap
  const sendWalletInstance = getWalletForAsset(swap.sendWalletId, sendSymbol)
  const receiveWalletInstance = getWalletForAsset(swap.receiveWalletId, receiveSymbol)
  const sendWalletId = sendWalletInstance.getId() // if original sendWalletId is a MultiWallet, this id will change
  return Promise.all([
    sendWalletInstance.getFreshAddress(sendSymbol),
    receiveWalletInstance.getFreshAddress(receiveSymbol),
  ])
    .then(([refundAddress, receiveAddress]) => dispatch(createOrder({
      id: swap.id,
      sendAmount,
      sendSymbol,
      receiveSymbol,
      receiveAddress,
      refundAddress,
      sendWalletId,
    })))
    .catch((e) => {
      log.error('createOrderWithWallets', e)
      return finish('Error creating swap for chosen wallets')
    })
})

export const setSwapTx = (swapId, tx, outputIndex = 0) => (dispatch) => {
  dispatch(swapUpdated(swapId, { sendAmount: tx.outputs[outputIndex].amount, txId: tx.id }))
}

export const createSwapTx = (swap, options) => (dispatch) => Promise.resolve().then(() => {
  if (swap.error) return swap
  log.debug('createSwapTx', swap)
  const { sendAmount, sendSymbol, sendWalletId, depositAddress } = swap
  const finish = dispatch(createSwapFinish('createSwapTx', swap))
  return dispatch(createTx(sendWalletId, depositAddress, sendAmount, sendSymbol, options))
    .then((tx) => {
      dispatch(setSwapTx(swap.id, tx))
      return tx
    })
    .catch((e) => {
      log.error('createSwapTx', e)
      return finish('Error creating deposit transaction')
    })
})

export const initiateSwap = (swap) => (dispatch, getState) => {
  dispatch(swapInitStarted(swap.id))
  return dispatch(createOrder(swap))
    .then((s) => dispatch(createSwapTx(s)))
    .then(() => dispatch(swapInitSuccess(swap.id)))
    .then(() => getSwap(getState(), swap.id))
    .catch((e) => dispatch(swapInitFailed(swap.id, e.message || e)))
}

export const createManualSwap = (swapParams) => (dispatch, getState) => {
  swapParams.id = swapParams.id || uuid()
  dispatch(swapAdded(swapParams))
  return dispatch(createOrder(swapParams))
    .then((swap) => {
      if (swap.error) {
        throw new Error(swap.error)
      }
      swap.id = swapParams.id
      return getSwap(getState(), swap.id)
    })
    .catch((e) => {
      log.error('Failed to create swap', swapParams, e)
      toastr.error('Failed to create swap, please contact support@faa.st')
      throw e
    })
}

export const retrieveSwap = (swapOrderId) => (dispatch, getState)  => Promise.resolve()
  .then(() => {
    return Faast.fetchSwap(swapOrderId)
      .then((swap) => {
        const existingSwap = getSwap(getState(), swapOrderId)
        swap.id = existingSwap ? existingSwap.id : swap.orderId
        dispatch(swapAdded(swap))
        dispatch(pollOrderStatus(swap))
        return getSwap(getState(), swap.id)
      })
      .catch((e) => {
        log.error(`Failed to retrieve swap ${swapOrderId}`, e)
        toastr.error(`Failed to retrieve swap ${swapOrderId}`)
        throw e
      })
  })

export const refreshSwap = (swapOrderId) => (dispatch, getState) => {
  return Faast.refreshSwap(swapOrderId)
    .then((swap) => {
      const existingSwap = getSwap(getState(), swapOrderId)
      swap.id = existingSwap ? existingSwap.id : swap.orderId
      dispatch(swapUpdated(swap.id, swap))
    })
    .catch((e) => {
      log.error(`Failed to refresh swap ${swapOrderId}`, e)
      toastr.error(`Failed to refresh swap ${swapOrderId}`)
      throw e
    })
}

export const signSwap = (swap, passwordCache = {}) => (dispatch, getState) => Promise.resolve()
  .then(() => {
    log.debug('signSwap', swap)
    const { txId } = swap
    const tx = getTx(getState(), txId)
    if (tx.signed) {
      return
    }
    return dispatch(signTx(tx, passwordCache))
  })

export const sendSwap = (swap, sendOptions) => (dispatch, getState) => Promise.resolve()
  .then(() => {
    log.debug('sendSwap', swap)
    const { txId } = swap
    const tx = getTx(getState(), txId)
    if (tx.sent) {
      return
    }
    return dispatch(sendTx(tx, sendOptions))
  })
  .then(() => dispatch(pollOrderStatus(swap)))

const updateOrderStatus = (swap) => (dispatch) => {
  const { id, orderId, orderStatus } = swap
  if (!orderId) {
    log.info(`updateOrderStatus: swap ${id} has no orderId`)
    return
  }
  return Faast.fetchSwap(orderId)
    .then((order) => {
      if (order.orderStatus !== orderStatus) {
        dispatch(swapOrderStatusUpdated(id, order.orderStatus))
      }
      return order
    })
    .catch(log.error)
}

const isSwapFinalized = (swap) => swap && (swap.orderStatus === 'complete' || swap.orderStatus === 'failed' || swap.orderStatus === 'cancelled')

export const pollOrderStatus = (swap) => (dispatch) => {
  const { id, orderId, orderStatus, tx, errorType } = swap
  if (!orderId) {
    log.warn(`pollOrderStatus: swap ${id} has no orderId`)
    return
  }
  if (isSwapFinalized(swap)) {
    log.debug(`pollOrderStatus: swap ${id} is finalized, won't poll`)
    return
  }
  if (orderStatus === 'awaiting deposit' && (errorType === 'createSwapTx' || (tx && !tx.sent))) {
    log.debug(`pollOrderStatus: swap ${id} has unsent tx, won't poll`)
    return
  }
  const orderStatusInterval = window.setInterval(() => {
    dispatch(updateOrderStatus(swap))
      .then((order) => {
        if (isSwapFinalized(order)) {
          clearInterval(orderStatusInterval)
        }
      })
  }, 10000)

  window.faast.intervals.orderStatus.push(orderStatusInterval)
}

export const restoreSwapPolling = (swapId) => (dispatch, getState) => {
  let swap = getSwap(getState(),  swapId)
  if (!swap) {
    log.debug(`restoreSwapPolling: could not find swap ${swapId}`)
    return
  }
  return Promise.all([
    swap.txId ? updateTxReceipt(swap.txId) : null,
    updateOrderStatus(swap)
  ]).then(() => {
    swap = getSwap(getState(), swap.id)
    const { tx } = swap
    if (tx && tx.sent && !tx.receipt) {
      dispatch(pollTxReceipt(swap.txId))
    }
    dispatch(pollOrderStatus(swap))
  })
}
