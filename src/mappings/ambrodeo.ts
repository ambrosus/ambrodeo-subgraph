import { log, BigInt, BigDecimal } from '@graphprotocol/graph-ts'
import {
  CreateToken as CreateTokenEvent,
  TokenTrade as TokenTradeEvent,
  TransferToDex as TransferToDexEvent
} from '../types/AMBRodeo/AMBRodeo'
import { Token, User, Holder,Trade, Candle, LastAmbPrice } from '../types/schema'
import { Token as TokenTemplate } from '../types/templates'

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
  // Create or load the creator user
  let creator = User.load(event.params.account.toHexString())
  if (creator === null) {
    creator = new User(event.params.account.toHexString())
    creator.isInsider = false
    creator.save()
  }

  // Create the token entity
  const tokenAddress = event.params.token.toHexString()
  const token = new Token(tokenAddress)
  token.creator = creator.id
  token.name = event.params.name.toString()
  token.symbol = event.params.symbol
  token.createdAt = event.block.timestamp
  token.data = event.params.data
  token.lastPrice = BigDecimal.zero()
  token.lastPriceUpdate = event.block.timestamp
  token.onDex = false;
  token.reachedOneMillions = false;
  token.save()

  // Create initial holder entry for creator
  const holderId = tokenAddress + '-' + event.params.account.toHexString()
  const holder = new Holder(holderId)
  log.info("Create the holder for new token with id: {}, user id: {}", [holderId, creator.id])
  holder.token = token.id
  holder.user = creator.id
  holder.balance = BigInt.zero()
  holder.save()

  // Start indexing events from the new token contract
  TokenTemplate.create(event.params.token)
}

export function handleTokenTrade(event: TokenTradeEvent): void {
  const tokenAddress = event.params.token.toHexString()
  const traderAddress = event.params.account.toHexString()
  const tradeId = tokenAddress + '-' + event.transaction.hash.toHexString() + '-' + event.logIndex.toString()
  
  // Load or create trader
  let trader = User.load(traderAddress)
  if (trader === null) {
    trader = new User(traderAddress)
    trader.isInsider = false
    trader.save()
  }

  // Load token and update supply
  const token = Token.load(tokenAddress)
  if (token === null) {
      log.error('Token not found: {}', [tokenAddress])
      return
  }

  // Update or create holder balance
  const holderId = tokenAddress + '-' + traderAddress
  let holder = Holder.load(holderId)
  if (holder === null) {
    log.info("Got null holder, creating new one with id: {}, user id: {}", [holderId, trader.id])
    holder = new Holder(holderId)
    holder.token = tokenAddress
    holder.user = trader.id
    holder.balance = BigInt.fromI32(0)
  }
  
  // Update holder balance based on input/output
  if (event.params.isBuy) {
    holder.balance = holder.balance.plus(event.params.amountOut)
  } else {
    holder.balance = holder.balance.minus(event.params.amountIn)
  }
  holder.save()

  const amountIdDec = new BigDecimal(event.params.amountIn).div(BigDecimal.fromString("1e18"))
  const amountOutDec = new BigDecimal(event.params.amountOut).div(BigDecimal.fromString("1e18"))
  const price = event.params.isBuy ? amountIdDec.div(amountOutDec) : amountOutDec.div(amountIdDec)

  let priceUSDC = BigDecimal.fromString('0')
  const lastAmbPrice = LastAmbPrice.load('1')
  if (lastAmbPrice === null) {
      priceUSDC = BigDecimal.fromString('0')
  } else {
      priceUSDC = price.times(lastAmbPrice.price)
  }



  //Update lastPrice
  const lastPrice = token.lastPrice
  token.lastPrice = price

  //Check if is one million amber inside the pool
  if (event.params.liquidity.ge(BigInt.fromI32(1000000))) {
    token.reachedOneMillions = true
  } else {
    token.reachedOneMillions = false
  }

  token.save()

  // Create trade record
  const trade = new Trade(tradeId)
  trade.token = tokenAddress
  trade.hash = event.transaction.hash.toHexString()
  trade.user = traderAddress
  trade.amount = event.params.isBuy ? event.params.amountOut : event.params.amountIn
  trade.price = price
  trade.priceUSDC = priceUSDC
  trade.fees = event.params.excludeFee
  trade.timestamp = event.block.timestamp
  trade.isBuy = event.params.isBuy
  trade.save()

  // Update candle data
  updateCandle(
    token,
    price,
    lastPrice,
    event.params.isBuy ? event.params.amountOut : event.params.amountIn,
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
}

// Helper function to update candle data
function updateCandle(
  token: Token,
  price: BigDecimal,
  lastPrice: BigDecimal,
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
    
    updateCandleEntity(
      candleId,
      token.id,
      interval.name,
      price,
      lastPrice,
      amount,
      timestamp,
      interval.seconds
    );
  }
}

function updateCandleEntity(
  id: string,
  tokenId: string,
  interval: string,
  price: BigDecimal,
  lastPrice: BigDecimal,
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
    candle.open = lastPrice
    candle.high = price
    candle.low = price
    candle.close = price
    candle.volume = amount
  } else {
    candle.high = price.gt(candle.high) ? price : candle.high
    candle.low = price.lt(candle.low) ? price : candle.low
    candle.close = price
    candle.volume = candle.volume.plus(amount)
  }
  
  candle.save()
}
