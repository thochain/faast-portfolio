import React from 'react'
import { compose, setDisplayName } from 'recompose'
import { getConnectedWalletsSentSwaps } from 'Selectors/swap'
import { connect } from 'react-redux'
import { createStructuredSelector } from 'reselect'

import Layout from 'Components/Layout'
import TradeTable from 'Components/TradeTable'

const TradeHistory = ({ swaps }) => (
  <Layout className='pt-3'>
    <h4 className='mt-2 text-primary'>Order History</h4>
    <TradeTable swaps={swaps}/>
  </Layout>
)

export default compose(
  setDisplayName('TradeHistory'),
  connect(createStructuredSelector({
    swaps: getConnectedWalletsSentSwaps
  }))
)(TradeHistory)
