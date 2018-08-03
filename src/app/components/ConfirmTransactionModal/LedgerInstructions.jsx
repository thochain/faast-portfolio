import React from 'react'
import PropTypes from 'prop-types'
import { compose, setDisplayName, setPropTypes } from 'recompose'
import LedgerScreen from './LedgerScreen'
import Timer from '../Timer'

export default compose(
  setDisplayName('LedgerInstructions'),
  setPropTypes({
    appName: PropTypes.string.isRequired,
    screens: PropTypes.arrayOf(PropTypes.shape({
      top: PropTypes.node,
      bottom: PropTypes.node,
    }))
  })
)(({ appName, screens }) => (
  <div>
    <p>Please confirm the transaction on your device. You should see the following information on screen.</p>

    <p><small>
      {'Tip: If you don\'t see the transaction on your device, ensure you\'ve unlocked '
      + `it using your PIN and have opened the ${appName} app.`}
    </small></p>
    <Timer timerStyle={timerStyle} seconds={120} label={'Please confirm within:'}/>
    {screens.map(({ top, bottom }, i) => (
      <LedgerScreen key={i} top={top} bottom={bottom}/>
    ))}
  </div>
))

const timerStyle = {
  color: '#c3c26d',
  fontSize: '80%'
}