import { log, BigInt, BigDecimal } from '@graphprotocol/graph-ts'
import {
  CreateToken as CreateTokenEvent,
  TokenTrade as TokenTradeEvent,
  TransferToDex as TransferToDexEvent,
  LiquidityTrade as LiquidityTradeEvent
} from '../types/AMBRodeo/AMBRodeo'
import { Token, User,Trade, Candle, LastAmbPrice, Platform } from '../types/schema'
import { Token as TokenTemplate } from '../types/templates'

const AMBRODEO_ADDRESS = '0x833Ae768cC7568c567983E05671d2d528609B862'
const MILLION = BigInt.fromI32(1000000).times(BigInt.fromI32(10).pow(18))

class Interval {
  name: string
  seconds: BigInt

  constructor(name: string, seconds: BigInt) {
    this.name = name
    this.seconds = seconds
  }
}

const INTERVALS: Interval[] = [
  new Interval("1m", BigInt.fromI32(60)),
  new Interval("5m", BigInt.fromI32(300)),
  new Interval("15m", BigInt.fromI32(900)),
  new Interval("30m", BigInt.fromI32(1800)),
  new Interval("1h", BigInt.fromI32(3600)),
  new Interval("4h", BigInt.fromI32(14400)),
  new Interval("1d", BigInt.fromI32(86400))
];

export function handleCreateToken(event: CreateTokenEvent): void {
  let platform = Platform.load('1')
  if (platform === null) {
    platform = new Platform('1')
    platform.totalTokens = BigInt.fromI32(0)
    platform.totalUsers = BigInt.fromI32(0)
    platform.totalTrades = BigInt.fromI32(0)
    platform.totalAmb = BigInt.fromI32(0)
    platform.totalTokensOnDex = BigInt.fromI32(0)
    platform.save()
  }
  // Create or load the creator user
  let creator = User.load(event.params.account.toHexString())
  if (creator === null) {
    creator = new User(event.params.account.toHexString())
    creator.totalTokensCreated = BigInt.fromI32(0)
    creator.totalTrades = BigInt.fromI32(0)
    creator.isInsider = true;
    platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1))
    creator.save()
  }
  creator.totalTokensCreated = creator.totalTokensCreated.plus(BigInt.fromI32(1))
  creator.save()

  // Create the token entity
  const tokenAddress = event.params.token.toHexString()
  const token = new Token(tokenAddress)
  token.creator = creator.id
  token.name = event.params.name.toString()
  token.nameLowerCase = event.params.name.toString().toLowerCase()
  token.symbol = event.params.symbol
  token.symbolLowerCase = event.params.symbol.toString().toLowerCase()
  token.createdAt = event.block.timestamp
  token.data = event.params.data
  token.lastPrice = BigDecimal.zero()
  token.lastPriceUpdate = event.block.timestamp
  token.onDex = false;
  token.reachedOneMillions = false;
  token.reachedHalfWayToDex = false;
  token.liquidity = BigInt.fromI32(0)
  token.totalTokenLiquidity = BigInt.fromI32(0)
  token.totalTokenSold = BigInt.fromI32(0)
  token.totalAmbSpend = BigInt.fromI32(0)
  token.totalTrades = BigInt.fromI32(0)
  token.totalHolders = BigInt.fromI32(0)
  token.totalSupply = event.params.totalSupply
  token.save()
  platform.totalTokens = platform.totalTokens.plus(BigInt.fromI32(1))
  
  let contractUser = User.load(AMBRODEO_ADDRESS)
  if (contractUser === null) {
    contractUser = new User(AMBRODEO_ADDRESS)
    contractUser.totalTokensCreated = BigInt.fromI32(0)
    contractUser.totalTrades = BigInt.fromI32(0)
    contractUser.isInsider = false;
    contractUser.save()
  }

  platform.save()

  // Start indexing events from the new token contract
  TokenTemplate.create(event.params.token)
}

export function handleLiquidityTrade(event: LiquidityTradeEvent): void {
    const totalToken = event.params.tokenBlanace.plus(event.params.virtualToken)
    const totalTokenDec = new BigDecimal(totalToken).div(BigDecimal.fromString("1e18"))
    const liquidityDec = new BigDecimal(event.params.liquidity).div(BigDecimal.fromString("1e18"))
    let price = liquidityDec.div(totalTokenDec)

    let token = Token.load(event.params.token.toHexString())
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
  let platform = Platform.load('1')
  if (platform === null) {
      throw new Error('Platform not found')
  }

  const tokenAddress = event.params.token.toHexString()
  const traderAddress = event.params.account.toHexString()
  const tradeId = tokenAddress + '-' + event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  
  // Load or create trader
  let trader = User.load(traderAddress)
  if (trader === null) {
    trader = new User(traderAddress)
    trader.totalTokensCreated = BigInt.fromI32(0)
    trader.totalTrades = BigInt.fromI32(0)
    trader.isInsider = false;
    platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1))
    trader.save()
  }

  trader.totalTrades = trader.totalTrades.plus(BigInt.fromI32(1))

  // Load token and update supply
  const token = Token.load(tokenAddress)
  if (token === null) {
      throw new Error('Token not found: ' + tokenAddress)
  }
  const amountInDec = event.params.isBuy ? new BigDecimal(event.params.excludeFee).div(BigDecimal.fromString("1e18")): new BigDecimal(event.params.amountIn).div(BigDecimal.fromString("1e18"))
  const amountOutDec = event.params.isBuy ? new BigDecimal(event.params.amountOut).div(BigDecimal.fromString("1e18")): new BigDecimal(event.params.excludeFee).div(BigDecimal.fromString("1e18"))
  const price = event.params.isBuy ? amountInDec.div(amountOutDec) : amountOutDec.div(amountInDec)

  let priceUSDC = BigDecimal.fromString('0')
  const lastAmbPrice = LastAmbPrice.load('1')
  if (lastAmbPrice === null) {
      priceUSDC = BigDecimal.fromString('0')
  } else {
      priceUSDC = price.times(lastAmbPrice.price)
  }

  //Check if is one million amber inside the pool
  if (event.params.liquidity.gt(MILLION)) {
    log.info('One million amber reached, token: {}, liquidity: {}', [token.id, event.params.liquidity.toString()])
    token.reachedOneMillions = true
    token.reachedOneMillionsAt = event.block.timestamp
  } else {
    log.info('One million amber not reached, token: {}, liquidity: {}', [token.id, event.params.liquidity.toString()])
    token.reachedOneMillions = false
    token.reachedOneMillionsAt = BigInt.fromI32(0)
  }

  if (event.params.liquidity.gt(event.params.balanceToDex.div(BigInt.fromI32(2)))) {
    token.reachedHalfWayToDex = true
    token.reachedHalfWayToDexAt = event.block.timestamp
  } else {
    token.reachedHalfWayToDex = false
    token.reachedHalfWayToDexAt = BigInt.fromI32(0)
  }

  token.totalTokenSold = event.params.isBuy ? token.totalTokenSold.plus(event.params.amountOut) : token.totalTokenSold.minus(event.params.excludeFee)
  token.totalAmbSpend = event.params.isBuy ? token.totalAmbSpend.plus(event.params.excludeFee) : token.totalAmbSpend.minus(event.params.amountOut)
  
  platform.totalAmb = event.params.isBuy ? platform.totalAmb.plus(event.params.excludeFee) : platform.totalAmb.minus(event.params.amountOut)

  token.liquidity = event.params.liquidity

  // Create trade record
  const trade = new Trade(tradeId)
  trade.token = tokenAddress
  trade.hash = event.transaction.hash.toHexString()
  trade.user = traderAddress
  trade.amount = event.params.isBuy ? event.params.amountOut : event.params.amountIn
  trade.amountAmb = event.params.isBuy ? amountInDec : amountOutDec
  trade.amountUSDC = event.params.isBuy ? amountOutDec.times(priceUSDC) : amountInDec.times(priceUSDC)
  trade.price = price
  trade.priceUSDC = priceUSDC
  trade.fees = event.params.excludeFee
  trade.timestamp = event.block.timestamp
  trade.isBuy = event.params.isBuy
  trade.save()
  token.totalTrades = token.totalTrades.plus(BigInt.fromI32(1))
  platform.totalTrades = platform.totalTrades.plus(BigInt.fromI32(1))

  token.save()
  platform.save()
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
  token.onDex = true;
  token.onDexSince = event.block.timestamp;
  token.save();

  const platform = Platform.load('1')
  if (platform === null) {
      throw new Error('Platform not found')
  }
  platform.totalTokensOnDex = platform.totalTokensOnDex.plus(BigInt.fromI32(1))
  platform.save()
}

// Split into two helper functions - one for price updates and one for volume updates
function updateCandlePrice(
  token: Token,
  price: BigDecimal,
  lastPrice: BigDecimal,
  timestamp: BigInt
): void {
  // If it's the first trade ever - the lastPrice is the current price
  if (lastPrice.equals(BigDecimal.zero())) {
    lastPrice = price
  }
  // Update candles for all intervals
  for (let i = 0; i < INTERVALS.length; i++) {
    const interval = INTERVALS[i];
    const candleId = token.id + 
      '-' + 
      interval.name + 
      '-' + 
      timestamp.div(interval.seconds).toString();
    
    updateCandlePriceEntity(
      candleId,
      token.id,
      interval.name,
      price,
      lastPrice,
      timestamp,
      interval.seconds
    );
  }
}

function updateCandleVolume(
  token: Token,
  amount: BigInt,
  timestamp: BigInt
): void {
  // Update candles for all intervals
  for (let i = 0; i < INTERVALS.length; i++) {
    const interval = INTERVALS[i];
    const candleId = token.id + 
      '-' + 
      interval.name + 
      '-' + 
      timestamp.div(interval.seconds).toString();
    
    updateCandleVolumeEntity(
      candleId,
      token.id,
      interval.name,
      amount,
      timestamp,
      interval.seconds
    );
  }
}

function updateCandlePriceEntity(
  id: string,
  tokenId: string,
  interval: string,
  price: BigDecimal,
  lastPrice: BigDecimal,
  timestamp: BigInt,
  intervalSeconds: BigInt
): void {
  let candle = Candle.load(id)
  const startTime = timestamp.div(intervalSeconds).times(intervalSeconds)
  
  if (candle === null) {
    candle = new Candle(id)
    candle.token = tokenId
    candle.interval = interval
    candle.startTime = startTime
    candle.endTime = startTime.plus(intervalSeconds)
    candle.open = lastPrice
    candle.high = price
    candle.low = price
    candle.close = price
    candle.volume = BigInt.fromI32(0)
  } else {
    candle.high = price.gt(candle.high) ? price : candle.high
    candle.low = price.lt(candle.low) ? price : candle.low
    candle.close = price
  }

  if (candle.open.equals(BigDecimal.zero())) {
    candle.open = lastPrice
  }

  if (candle.low.equals(BigDecimal.zero())) {
    candle.low = lastPrice
  }

  candle.save()
}

function updateCandleVolumeEntity(
  id: string,
  tokenId: string,
  interval: string,
  amount: BigInt,
  timestamp: BigInt,
  intervalSeconds: BigInt
): void {
  let candle = Candle.load(id)
  const startTime = timestamp.div(intervalSeconds).times(intervalSeconds)
  
  if (candle === null) {
    candle = new Candle(id)
    candle.token = tokenId
    candle.interval = interval
    candle.startTime = startTime
    candle.endTime = startTime.plus(intervalSeconds)
    candle.open = BigDecimal.zero()
    candle.high = BigDecimal.zero()
    candle.low = BigDecimal.zero()
    candle.close = BigDecimal.zero()
    candle.volume = amount
  } else {
    candle.volume = candle.volume.plus(amount)
  }
  
  candle.save()
}
