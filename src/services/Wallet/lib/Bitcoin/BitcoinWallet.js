import log from 'Utilities/log'
import { toBigNumber, toMainDenomination } from 'Utilities/convert'
import { abstractMethod, assertExtended } from 'Utilities/reflect'
import { ellipsize } from 'Utilities/display'
import Bitcore from 'Services/Bitcore'

import Wallet from '../Wallet'

const supportedAssets = ['BTC']

@abstractMethod('getTypeLabel', 'createTransaction', '_signTx', '_sendSignedTx', '_validateTxData', '_validateSignedTxData')
export default class BitcoinWallet extends Wallet {

  static type = 'BitcoinWallet';

  constructor(xpub) {
    super()
    assertExtended(this, BitcoinWallet)
    this.xpub = xpub
    this._latestDiscoveryResults = {}
  }

  getId = () => this.xpub;

  getLabel = () => this.label || `Bitcoin ${ellipsize(this.xpub, 8, 4)}`;

  isAssetSupported = (assetOrSymbol) => supportedAssets.includes(this.getSymbol(assetOrSymbol));

  isSingleAddress = () => false;

  _performDiscovery = (symbol) => {
    const discoveryPromise = Bitcore.discover(symbol, this.xpub)
      .then((result) => {
        log.debug(`bitcore result for ${symbol}`, result)
        this._latestDiscoveryResults[symbol] = result
        return result
      });
    this._latestDiscoveryResults[symbol] = discoveryPromise
    return discoveryPromise
  };

  _getDiscoveryResult = (symbol) => Promise.resolve(this._latestDiscoveryResults[symbol])
    .then((result) => {
      if (!result) {
        return this._performDiscovery(symbol)
      }
      return result
    });

  getFreshAddress = (assetOrSymbol, { index = 0 } = {}) => Promise.resolve(assetOrSymbol)
    .then(::this.assertAssetSupported)
    .then((asset) => this._getDiscoveryResult(asset.symbol))
    .then(({ unusedAddresses }) => unusedAddresses[index]);

  getBalance = (assetOrSymbol) => Promise.resolve(assetOrSymbol)
    .then(::this.getSupportedAsset)
    .then((asset) => {
      if (!asset) {
        return toBigNumber(0)
      }
      return this._performDiscovery(asset.symbol)
        .then(({ balance }) => toMainDenomination(balance, asset.decimals))
    });

  _getTransactionReceipt (txId) {
    return Bitcore.getTransaction('BTC', txId)
      .then((result) => !result ? null : ({
        confirmed: result.height > 0,
        succeeded: result.height > 0,
        blockNumber: result.height,
        raw: result
      }))
  }

}
