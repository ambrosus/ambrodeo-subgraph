import { BigDecimal, BigInt } from '@graphprotocol/graph-ts'
import { Sync } from '../types/Pair/Pair'
import { AmbPrice, LastAmbPrice  } from '../types/schema'

export function handleSync(event: Sync): void {
  let price = new AmbPrice(event.block.timestamp.toString())
  
  // Convert reserves to BigDecimal for price calculation
  let reserve0 = new BigDecimal(event.params.reserve0).div(BigDecimal.fromString('1e18'))
  let reserve1 = new BigDecimal(event.params.reserve1).div(BigDecimal.fromString('1e18'))
  
  // Calculate price (USDC per AMB)
  // Assuming AMB is token0 and USDC is token1
  if (event.params.reserve0.notEqual(BigInt.fromString('0'))) price.price = reserve1.div(reserve0)
  else price.price = BigDecimal.fromString('0')
  
  price.timestamp = event.block.timestamp
  price.save()

  let lastPrice = LastAmbPrice.load('1')
  if (lastPrice == null) {
    lastPrice = new LastAmbPrice('1')
  }

  lastPrice.price = price.price
  lastPrice.timestamp = price.timestamp
  lastPrice.save()
} 
