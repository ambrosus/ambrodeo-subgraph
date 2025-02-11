import { log, BigInt, BigDecimal } from '@graphprotocol/graph-ts'
import {
  CreateToken as CreateTokenEvent,
  TokenTrade as TokenTradeEvent,
  TransferToDex as TransferToDexEvent
} from '../types/AMBRodeo/AMBRodeo'
import { Token, User, Holder,Trade, Candle, LastAmbPrice, Platform } from '../types/schema'
import { Token as TokenTemplate } from '../types/templates'

const AMBRODEO_ADDRESS = '0xCE053020E337E212F71D330199968c39cAc510B8'

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
    platform.totalHolders = BigInt.fromI32(0)
    platform.totalAmb = BigInt.fromI32(0)
    platform.totalLiquidity = BigInt.fromI32(0)
    platform.totalTokensOnDex = BigInt.fromI32(0)
    platform.save()
  }
  // Create or load the creator user
  let creator = User.load(event.params.account.toHexString())
  if (creator === null) {
    creator = new User(event.params.account.toHexString())
    platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1))
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
  token.reachedHalfWayToDex = false;
  token.liquidity = BigInt.fromI32(0)
  token.totalToken = BigInt.fromI32(0)
  token.totalAmb = BigInt.fromI32(0)
  token.save()
  platform.totalTokens = platform.totalTokens.plus(BigInt.fromI32(1))
  
  let contractUser = User.load(AMBRODEO_ADDRESS)
  if (contractUser === null) {
      contractUser = new User(AMBRODEO_ADDRESS)
      contractUser.save()
  }

  let holderId = new Holder(tokenAddress + '-' + AMBRODEO_ADDRESS)
  let holder = new Holder(holderId.id)
  holder.token = tokenAddress
  holder.user = contractUser.id
  holder.balance = event.params.totalSupply
  holder.save()

  platform.save()

  // Start indexing events from the new token contract
  TokenTemplate.create(event.params.token)
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
    platform.totalUsers = platform.totalUsers.plus(BigInt.fromI32(1))
    trader.save()
  }

  // Load token and update supply
  const token = Token.load(tokenAddress)
  if (token === null) {
      throw new Error('Token not found: ' + tokenAddress)
  }

  // Update or create holder balance
  const holderId = tokenAddress + '-' + traderAddress
  let holder = Holder.load(holderId)
  if (holder === null) {
    holder = new Holder(holderId)
    platform.totalHolders = platform.totalUsers.plus(BigInt.fromI32(1))
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

  const contractHolderId = tokenAddress + '-' + AMBRODEO_ADDRESS
  let contractHolder = Holder.load(contractHolderId)

  if (holder === null) {
      throw new Error('Contract holder not found')
  }

  if (event.params.isBuy) {
    contractHolder!.balance = contractHolder!.balance.minus(event.params.amountIn)
  } else {
    contractHolder!.balance = contractHolder!.balance.plus(event.params.amountOut)
  }

  contractHolder!.save()

  const amountInDec = new BigDecimal(event.params.amountIn).div(BigDecimal.fromString("1e18"))
  const amountOutDec = new BigDecimal(event.params.amountOut).div(BigDecimal.fromString("1e18"))
  const price = event.params.isBuy ? amountInDec.div(amountOutDec) : amountOutDec.div(amountInDec)

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
  if (event.params.liquidity.ge(BigInt.fromI32(1000000 * (10 ** 18)))) {
    token.reachedOneMillions = true
    token.reachedOneMillionsAt = event.block.timestamp
  } else {
    token.reachedOneMillions = false
    token.reachedOneMillionsAt = BigInt.fromI32(0)
  }

  if (event.params.liquidity.ge(event.params.balanceToDex.div(BigInt.fromI32(2)))) {
    token.reachedHalfWayToDex = true
    token.reachedHalfWayToDexAt = event.block.timestamp
  } else {
    token.reachedHalfWayToDex = false
    token.reachedHalfWayToDexAt = BigInt.fromI32(0)
  }

  token.totalToken = event.params.isBuy ? token.totalToken.plus(event.params.amountOut) : token.totalToken.minus(event.params.amountIn)
  token.totalAmb = event.params.isBuy ? token.totalAmb.plus(event.params.amountIn) : token.totalAmb.minus(event.params.amountOut)
  
  platform.totalAmb = event.params.isBuy ? platform.totalAmb.plus(event.params.amountIn) : platform.totalAmb.minus(event.params.amountOut)
  platform.totalLiquidity = platform.totalLiquidity.minus(token.liquidity).plus(event.params.liquidity)

  token.liquidity = event.params.liquidity

  token.save()

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
  platform.totalTrades = platform.totalTrades.plus(BigInt.fromI32(1))

  platform.save()
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

  const platform = Platform.load('1')
  if (platform === null) {
      throw new Error('Platform not found')
  }
  platform.totalTokensOnDex = platform.totalTokensOnDex.plus(BigInt.fromI32(1))
  platform.save()
}

// Helper function to update candle data
function updateCandle(
  token: Token,
  price: BigDecimal,
  lastPrice: BigDecimal,
  amount: BigInt,
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
