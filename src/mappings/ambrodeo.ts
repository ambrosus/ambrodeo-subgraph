import { log, BigInt, BigDecimal } from '@graphprotocol/graph-ts'
import {
  CreateToken as CreateTokenEvent,
  TokenTrade as TokenTradeEvent,
  TransferToDex as TransferToDexEvent,
  LiquidityTrade as LiquidityTradeEvent
} from '../types/AMBRodeo/AMBRodeo'
import { Token, User, Platform } from '../types/schema'
import { Token as TokenTemplate } from '../types/templates'
import {
  createToken,
  createTrade,
  createUser,
  getPlatform,
  updateCandlePrice,
  updateCandleVolume,
  X18BD
} from './helpers';

// TODO: Does we need that?
// const AMBRODEO_ADDRESS = '0x833Ae768cC7568c567983E05671d2d528609B862'

export function handleCreateToken(event: CreateTokenEvent): void {
  const platform = getPlatform();
  // Create or load the creator user
  const userAddress = event.params.account
  let creator = User.load(userAddress.toHexString());
  if (creator === null) creator = createUser(userAddress, platform, true);

  // Create the token entity
  const tokenAddress = event.params.token
  createToken(
    creator,
    tokenAddress,
    event.params.name,
    event.params.symbol,
    event.params.totalSupply,
    event.block.timestamp,
    event.params.data,
    platform
  )
  
  // Start indexing events from the new token contract
  TokenTemplate.create(event.params.token)
}

export function handleLiquidityTrade(event: LiquidityTradeEvent): void {
    const totalToken = event.params.tokenBlanace.plus(event.params.virtualToken)
    const totalTokenDec = new BigDecimal(totalToken).div(X18BD)
    const liquidityDec = new BigDecimal(event.params.liquidity).div(X18BD)
    const price = liquidityDec.div(totalTokenDec)

    const token = Token.load(event.params.token.toHexString())
    if (token === null) {
        throw new Error('Token not found: ' + event.params.token.toHexString())
    }
    
    const lastPrice = token.lastPrice
    token.lastPrice = price
    token.lastPriceUpdate = event.block.timestamp
    token.liquidity = event.params.liquidity
    token.totalTokenLiquidity = totalToken
    token.save()

    // Update candle prices
    updateCandlePrice(
      token,
      price,
      lastPrice,
      event.block.timestamp
    )
}

export function handleTokenTrade(event: TokenTradeEvent): void {
  const platform = Platform.load('1')
  if (platform === null) {
      throw new Error('Platform not found')
  }

  // Load token
  const tokenAddress = event.params.token.toHexString()
  const token = Token.load(tokenAddress)
  if (token === null) {
      throw new Error('Token not found: ' + tokenAddress)
  }

  const traderAddress = event.params.account
  // Load or create trader
  let trader = User.load(traderAddress.toHexString());
  if (trader === null) trader = createUser(traderAddress, platform, false);
  
  // Create trade record
  const tradeId = tokenAddress + '-' + event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  createTrade(
    token,
    trader,
    tradeId,
    event.transaction.hash.toHexString(),
    event.params.amountIn,
    event.params.amountOut,
    event.params.liquidity,
    event.params.isBuy,
    event.params.excludeFee,
    event.params.balanceToDex,
    event.block.timestamp,
    platform
  )
  // Update only volume data in candles
  updateCandleVolume(
    token,
    event.params.isBuy ? event.params.amountOut : event.params.excludeFee,
    event.block.timestamp
  )
}

export function handleTransferToDex(event: TransferToDexEvent): void {
  const tokenAddress = event.params.token.toHexString()
  const token = Token.load(tokenAddress)
  if (token === null) {
      log.error('Token not found: {}', [tokenAddress])
      return
  }
  const platform = Platform.load('1')
  if (platform === null) {
      throw new Error('Platform not found')
  }
  token.onDex = true;
  token.onDexSince = event.block.timestamp;
  platform.totalTokensOnDex = platform.totalTokensOnDex.plus(BigInt.fromI32(1))
  token.save();
  platform.save()
}
