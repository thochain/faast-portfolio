import React from 'react'
import { Link } from 'react-router-dom'
import { connect } from 'react-redux'
import { createStructuredSelector } from 'reselect'
import { compose, setDisplayName, setPropTypes, withProps } from 'recompose'
import { Card, CardHeader, Row, Col, CardBody, Media, Button } from 'reactstrap'
import PropTypes from 'prop-types'
import classNames from 'class-names'

import { getAsset } from 'Selectors/asset'
import { getHoldingsByAsset } from 'Selectors/wallet'

import conditionalRedirect from 'Hoc/conditionalRedirect'
import routes from 'Routes'

import Layout from 'Components/Layout'
import PriceChart from 'Components/PriceChart'
import CoinIcon from 'Components/CoinIcon'
import Units from 'Components/Units'
import ChangePercent from 'Components/ChangePercent'
import ArrowIcon from 'Components/ArrowIcon'

const getQuery = ({ match }) => match.params.symbol

const marketData = [
  {
    title: 'Market Cap',
    jsonKey: 'marketCap',
    fiat: true,
  },
  {
    title: '24hr Volume',
    jsonKey: 'volume24',
    fiat: true,
  },
  {
    title: 'Supply',
    jsonKey: 'availableSupply',
    fiat: false,
  }
]

const AssetDetail = ({ symbol, asset, assetHoldings }) => {
  const { name, price, change24, deposit, receive } = asset
  return (
    <Layout className='pt-3 p-0 p-sm-3'>
      <Card>
        <CardHeader className='grid-group'>
          <Row className='gutter-3 p-sm-0 p-3 d-flex'>
            <Col className='d-flex align-items-center pl-sm-4 pl-0 py-2 col-auto' size='sm'>
              <Media>
                <Media left>
                  <CoinIcon 
                    className='mr-2 mt-1' 
                    symbol={symbol} 
                    style={{ width: '40px', height: '40px', position: 'relative', top: '2px' }} 
                    inline
                  /> 
                </Media>
                <Media body>
                  <Media className='m-0 mt-1 font-weight-bold' heading>
                    {name}
                  </Media>
                  <small style={{ position: 'relative', top: '-5px' }} className='text-muted'>[{symbol}]</small>
                </Media>
              </Media>
            </Col>
            <Col className='col-sm-8 col-md-8 col-lg-2 col-5'>
              <div className='pl-4 py-2'>
                <div className='mb-0'>
                  <Units 
                    className='mt-1 d-inline-block font-weight-bold'
                    value={price} 
                    symbol={'$'} 
                    precision={6} 
                    prefixSymbol
                  />
                </div>
                <small style={{ position: 'relative', top: '-5px' }}><ChangePercent>{change24}</ChangePercent></small>
                <ArrowIcon
                  style={{ position: 'relative', top: '-5px' }}
                  className={classNames('swapChangeArrow', change24.isZero() ? 'd-none' : null)} 
                  size={.58} dir={change24 < 0 ? 'down' : 'up'} 
                  color={change24 < 0 ? 'danger' : change24 > 0 ? 'success' : null}
                />
              </div>
            </Col>
            {assetHoldings ? (
              <Col className='col-auto ml-3 mr-3' size='sm'>
                <div className='py-2'>
                  <div className='text-muted mb-0'>
                    <small>Your Holdings</small>
                  </div>
                  <Units 
                    value={assetHoldings || 0} 
                    symbol={symbol} 
                    precision={6}
                  />
                </div>
              </Col>
            ) : null}
            {marketData.map(({ title, jsonKey, fiat }, i) => {
              return (
                <Col key={i} className='ml-3 mr-3 d-flex col-auto'>
                  <div className='py-2'>
                    <div className='text-muted mb-0'>
                      <small>{title}</small>
                    </div>
                    <Units
                      className='text-nowrap'
                      value={asset[jsonKey]} 
                      symbol={fiat ? '$' : asset.symbol} 
                      precision={6} 
                      prefixSymbol={fiat}
                      abbreviate
                    />
                  </div>
                </Col>
              )
            })}
            <Col className='d-flex align-items-center flex-row-reverse ml-2 mr-2'>
              <div className='py-2'>
                <div className='d-flex flex-nowrap text-muted mb-0'>
                  <Link to={`/swap?to=${symbol}`}>
                    <Button className='mr-2' color='success' size='sm' disabled={!receive}>Buy {symbol}</Button>
                  </Link>
                  <Link to={`/swap?from=${symbol}`}>
                    <Button color='danger' size='sm' disabled={!deposit}>Sell {symbol}</Button>
                  </Link>
                </div>
              </div>
            </Col>
          </Row>
        </CardHeader>
        <CardBody className='text-center'>
          <PriceChart symbol={symbol} chartOpen/> 
        </CardBody>
      </Card>
    </Layout>
  )
}

export default compose(
  setDisplayName('AssetDetail'),
  setPropTypes({
    match: PropTypes.object.isRequired
  }),
  withProps((props) => {
    const symbol = getQuery(props).toUpperCase()
    return ({
      symbol,
    })
  }),
  connect(createStructuredSelector({
    asset: (state, { symbol }) => getAsset(state, symbol),
    assetHoldings: (state, { symbol }) => getHoldingsByAsset(state, symbol),
  })),
  conditionalRedirect(
    routes.assetIndex(),
    ({ asset }) => !asset
  ),
)(AssetDetail)
