/* eslint-disable prefer-const */
import { Address, BigDecimal, BigInt } from '@graphprotocol/graph-ts/index'
import { log } from '@graphprotocol/graph-ts'

import { Bundle, Pair, Token } from '../types/schema'
import { ADDRESS_ZERO, factoryContract, ONE_BD, UNTRACKED_PAIRS, ZERO_BD } from './helpers'

const SAMB_ADDRESS = '0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F'
const USDC_ADDRESS = '0xff9f502976e7bd2b4901ad7dd1131bb81e5567de'
const USDC_SAMB_PAIR = '0x6ee05D1Fe386555D7d4804D4B08141C60bB5eabf' // USDC-SAMB pair

export function getBestPrice(token: Token): BigDecimal {
  log.info("Starting getBestPrice for token: {} ({})", [token.symbol, token.id])
  
  if (token.id == USDC_ADDRESS) {
    log.info("Token is USDC, returning 1", [])
    return ONE_BD
  }

  // best price
  let bestPrice = ZERO_BD

  // Try direct pair first for efficiency
  let directPairAddress = factoryContract.getPair(Address.fromString(USDC_ADDRESS), Address.fromString(token.id))
  if (directPairAddress.toHexString() != ADDRESS_ZERO) {
    let directPair = Pair.load(directPairAddress.toHexString())
    if (directPair !== null && directPair.reserve0.gt(ZERO_BD) && directPair.reserve1.gt(ZERO_BD)) {
      log.info("Found direct pair with USDC: {}", [directPairAddress.toHexString()])
      if (directPair.token0 == token.id) {
        // If token is token0, price = reserve1/reserve0
        let price = directPair.reserve1.div(directPair.reserve0)
        log.info("Direct price (token is token0): {}", [price.toString()])
        if (bestPrice.gt(ZERO_BD) && price.lt(bestPrice)) {
          bestPrice = price
        } else if (bestPrice.equals(ZERO_BD)) {
          bestPrice = price
        }
      } else {
        // If token is token1, price = reserve0/reserve1
        let price = directPair.reserve0.div(directPair.reserve1)
        log.info("Direct price (token is token1): {}", [price.toString()])
        if (bestPrice.gt(ZERO_BD) && price.lt(bestPrice)) {
          bestPrice = price
        } else if (bestPrice.equals(ZERO_BD)) {
          bestPrice = price
        }
      }
    }
  }

  // If no direct pair, try one-hop paths through whitelisted tokens
  for (let i = 0; i < WHITELIST.length; i++) {
    let intermediateToken = WHITELIST[i]
    if (intermediateToken == token.id || intermediateToken == USDC_ADDRESS) continue

    log.info("Trying path through intermediate token: {}", [intermediateToken])

    // Get USDC -> Intermediate pair
    let firstPairAddress = factoryContract.getPair(
      Address.fromString(USDC_ADDRESS),
      Address.fromString(intermediateToken)
    )
    
    if (firstPairAddress.toHexString() == ADDRESS_ZERO) continue
    let firstPair = Pair.load(firstPairAddress.toHexString())
    if (firstPair === null || firstPair.reserve0.equals(ZERO_BD) || firstPair.reserve1.equals(ZERO_BD)) continue

    // Get Intermediate -> Target token pair
    let secondPairAddress = factoryContract.getPair(
      Address.fromString(intermediateToken),
      Address.fromString(token.id)
    )
    
    if (secondPairAddress.toHexString() == ADDRESS_ZERO) continue
    let secondPair = Pair.load(secondPairAddress.toHexString())
    if (secondPair === null || secondPair.reserve0.equals(ZERO_BD) || secondPair.reserve1.equals(ZERO_BD)) continue

    log.info("Found path: USDC -> {} -> {}", [intermediateToken, token.id])

    // Calculate first hop price (USDC -> Intermediate)
    let firstHopPrice = ZERO_BD
    if (firstPair.token0 == USDC_ADDRESS) {
      firstHopPrice = firstPair.reserve0.div(firstPair.reserve1)
    } else {
      firstHopPrice = firstPair.reserve1.div(firstPair.reserve0)
    }

    log.info("First hop price: {}", [firstHopPrice.toString()])
    if (firstHopPrice.equals(ZERO_BD)) continue

    // Calculate second hop price (Intermediate -> Target)
    let secondHopPrice = ZERO_BD
    if (secondPair.token0 == token.id) {
      secondHopPrice = secondPair.reserve1.div(secondPair.reserve0)
    } else {
      secondHopPrice = secondPair.reserve0.div(secondPair.reserve1)
    }

    log.info("Second hop price: {}", [secondHopPrice.toString()])
    if (secondHopPrice.equals(ZERO_BD)) continue

    // Calculate final price through both hops
    let finalPrice = firstHopPrice.times(secondHopPrice)
    log.info("Calculated price through {}: {}", [intermediateToken, finalPrice.toString()])
    if (bestPrice.gt(ZERO_BD) && finalPrice.lt(bestPrice)) {
        bestPrice = finalPrice
    } else if (bestPrice.equals(ZERO_BD)) {
        bestPrice = finalPrice
    }
  }

  return bestPrice
}

export function getEthPriceInUSD(): BigDecimal {
  // fetch eth prices for each stablecoin
  let usdcPair = Pair.load(USDC_SAMB_PAIR) // usdc is token0

  if (usdcPair !== null) {
    return usdcPair.token0Price
  } else {
    return ZERO_BD
  }
}

// token where amounts should contribute to tracked volume and liquidity
let WHITELIST: string[] = [
    '0xFF9F502976E7bD2b4901aD7Dd1131Bb81E5567de', // USDC
    '0x096B5914C95C34Df19500DAff77470C845EC749D', // BOND
    '0xd09270E917024E75086e27854740871F1C8E0E10', // HBR
    '0x2b2d892C3fe2b4113dd7aC0D2c1882AF202FB28F', // SAMB
    '0x2834C436d04ED155e736F994c1F3a0d05C4A8dE4', // stAMB
    '0x5ceCBde7811aC0Ed86Be11827AE622b89Bc429DF', // AST
]

// minimum liquidity required to count towards tracked volume for pairs with small # of Lps
let MINIMUM_USD_THRESHOLD_NEW_PAIRS = BigDecimal.fromString('400000')

// minimum liquidity for price to get tracked
let MINIMUM_LIQUIDITY_THRESHOLD_ETH = BigDecimal.fromString('2')

/**
 * Search through graph to find derived Eth per token.
 * @todo update to be derived ETH (add stablecoin estimates)
 **/
export function findEthPerToken(token: Token): BigDecimal {
  if (token.id == SAMB_ADDRESS) {
    return ONE_BD
  }
  // loop through whitelist and check if paired with any
  for (let i = 0; i < WHITELIST.length; ++i) {
    let pairAddress = factoryContract.getPair(Address.fromString(token.id), Address.fromString(WHITELIST[i]))
    if (pairAddress.toHexString() != ADDRESS_ZERO) {
      let pair = Pair.load(pairAddress.toHexString())
      if (pair === null) {
        continue
      }
      if (pair.token0 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token1 = Token.load(pair.token1)
        if (token1 === null) {
          continue
        }
        return pair.token1Price.times(token1.derivedETH as BigDecimal) // return token1 per our token * Eth per token 1
      }
      if (pair.token1 == token.id && pair.reserveETH.gt(MINIMUM_LIQUIDITY_THRESHOLD_ETH)) {
        let token0 = Token.load(pair.token0)
        if (token0 === null) {
          continue
        }
        return pair.token0Price.times(token0.derivedETH as BigDecimal) // return token0 per our token * ETH per token 0
      }
    }
  }
  return ZERO_BD // nothing was found return 0
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD.
 * If both are, return average of two amounts
 * If neither is, return 0
 */
export function getTrackedVolumeUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
  pair: Pair,
): BigDecimal {
  let bundle = Bundle.load('1')!
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // dont count tracked volume on these pairs - usually rebass tokens
  if (UNTRACKED_PAIRS.includes(pair.id)) {
    return ZERO_BD
  }

  // if less than 5 LPs, require high minimum reserve amount amount or return 0
  if (pair.liquidityProviderCount.lt(BigInt.fromI32(5))) {
    let reserve0USD = pair.reserve0.times(price0)
    let reserve1USD = pair.reserve1.times(price1)
    if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve0USD.plus(reserve1USD).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
      if (reserve0USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
    if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
      if (reserve1USD.times(BigDecimal.fromString('2')).lt(MINIMUM_USD_THRESHOLD_NEW_PAIRS)) {
        return ZERO_BD
      }
    }
  }

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1)).div(BigDecimal.fromString('2'))
  }

  // take full value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0)
  }

  // take full value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1)
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}

/**
 * Accepts tokens and amounts, return tracked amount based on token whitelist
 * If one token on whitelist, return amount in that token converted to USD * 2.
 * If both are, return sum of two amounts
 * If neither is, return 0
 */
export function getTrackedLiquidityUSD(
  tokenAmount0: BigDecimal,
  token0: Token,
  tokenAmount1: BigDecimal,
  token1: Token,
): BigDecimal {
  let bundle = Bundle.load('1')!
  let price0 = token0.derivedETH.times(bundle.ethPrice)
  let price1 = token1.derivedETH.times(bundle.ethPrice)

  // both are whitelist tokens, take average of both amounts
  if (WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).plus(tokenAmount1.times(price1))
  }

  // take double value of the whitelisted token amount
  if (WHITELIST.includes(token0.id) && !WHITELIST.includes(token1.id)) {
    return tokenAmount0.times(price0).times(BigDecimal.fromString('2'))
  }

  // take double value of the whitelisted token amount
  if (!WHITELIST.includes(token0.id) && WHITELIST.includes(token1.id)) {
    return tokenAmount1.times(price1).times(BigDecimal.fromString('2'))
  }

  // neither token is on white list, tracked volume is 0
  return ZERO_BD
}
