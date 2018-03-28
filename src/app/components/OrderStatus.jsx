import React from 'react'
import {
  Card, CardHeader, CardBody, CardTitle, CardSubtitle, CardText, Button
} from 'reactstrap'

import Spinner from 'Components/Spinner'

const getTitle = (status) => {
  switch (status) {
    case 'working':
      return (<span className='text-muted'>In Progress <Spinner inline size='sm'/></span>)
    case 'complete':
      return (<span className='text-success'>Complete <i className='fa fa-check-circle'/></span>)
    case 'error':
      return (<span className='text-danger'>Error <i className='fa fa-exclamation-circle' /></span>)
  }
}
const getDescription = (status) => {
  switch (status) {
    case 'working':
      return 'Your order is still in progress. You cannot modify your portfolio until your order has been fulfilled.'
    case 'complete':
      return 'The order completed successfully. It may take a short amount of time to see the adjusted balances reflected in your portfolio.'
    case 'error':
      return 'There was an issue with one or more swaps in your order. Click "Details" for more.'
  }
}

const OrderInProgress = ({ status, handleViewStatus, handleForgetOrder }) => (
  <Card>
    <CardHeader><CardTitle>Order Status</CardTitle></CardHeader>
    <CardBody>
      <div className='mb-2'><small className='font-weight-light'>{getTitle(status)}</small></div>
      <CardText>{getDescription(status)}</CardText>
      <Button color='primary' outline size='sm' onClick={handleViewStatus}>Details</Button>
      {status === 'working' &&
        <Button color='link' size='sm' className='mx-3' onClick={handleForgetOrder}>Forget</Button>
      }
    </CardBody>
  </Card>
)

export default OrderInProgress