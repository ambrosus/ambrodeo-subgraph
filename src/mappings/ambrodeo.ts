import { BigInt, Address } from '@graphprotocol/graph-ts'
import {
  CreateToken as CreateTokenEvent,
  TokenTrade as TokenTradeEvent
} from '../types/AMBRodeo/AMBRodeo'
import { Token, User, Holder,Trade, Candle } from '../types/schema'
import { Token as TokenTemplate } from '../types/templates'

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
  token.initialSupply = event.params.totalSupply
  token.totalSupply = event.params.totalSupply
  token.createdAt = event.block.timestamp
  token.curvePoints = event.params.stepPrice
  token.save()

  // Create initial holder entry for creator
  const holderId = tokenAddress + '-' + event.params.account.toHexString()
  const holder = new Holder(holderId)
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
  if (token) {
    // TODO: Determine if we need to update total supply based on reserve changes
    token.save()
  }

  // Update or create holder balance
  const holderId = tokenAddress + '-' + traderAddress
  let holder = Holder.load(holderId)
  if (holder === null) {
    holder = new Holder(holderId)
    holder.token = tokenAddress
    holder.user = traderAddress
    holder.balance = BigInt.fromI32(0)
  }
  
  // Update holder balance based on input/output
  if (event.params.isBuy) {
    holder.balance = holder.balance.plus(event.params.output)
  } else {
    holder.balance = holder.balance.minus(event.params.input)
  }
  holder.save()

  // TODO: Calculate actual price from input/output ratio
  let price = BigInt.fromI32(0)
  if (event.params.balanceToken > BigInt.fromI32(0)) {
    price = event.params.reserveTokens.div(event.params.balanceToken)
  }

  // Create trade record
  const trade = new Trade(tradeId)
  trade.token = tokenAddress
  trade.user = traderAddress
  trade.amount = event.params.isBuy ? event.params.output : event.params.input
  // TODO: Calculate actual price from input/output ratio
  trade.price = price
  // TODO: Calculate actual fees
  trade.fees = BigInt.fromI32(0)
  trade.timestamp = event.block.timestamp
  trade.save()

  // Update candle data
  updateCandle(
    token!,
    price,
    event.params.isBuy ? event.params.output : event.params.input,
    event.block.timestamp
  )
}

// Helper function to update candle data
function updateCandle(
  token: Token,
  price: BigInt,
  amount: BigInt,
  timestamp: BigInt
): void {
  const hourlyId = token.id + '-' + timestamp.div(BigInt.fromI32(3600)).toString()
  const dailyId = token.id + '-' + timestamp.div(BigInt.fromI32(86400)).toString()
  
  updateCandleEntity(hourlyId, token.id, "hourly", price, amount, timestamp)
  updateCandleEntity(dailyId, token.id, "daily", price, amount, timestamp)
}

function updateCandleEntity(
  id: string,
  tokenId: string,
  interval: string,
  price: BigInt,
  amount: BigInt,
  timestamp: BigInt,
): void {
  let candle = Candle.load(id)
  const intervalSeconds = interval == "hourly" ? 3600 : 86400
  const startTime = timestamp.div(BigInt.fromI32(intervalSeconds)).times(BigInt.fromI32(intervalSeconds))
  
  if (candle === null) {
    candle = new Candle(id)
    candle.token = tokenId
    candle.interval = interval
    candle.startTime = startTime
    candle.endTime = startTime.plus(BigInt.fromI32(intervalSeconds))
    candle.open = price
    candle.high = price
    candle.low = price
    candle.close = price
    candle.volume = amount
  } else {
    candle.high = price.gt(candle.high) ? price : candle.high
    candle.low = price.lt(candle.low) ? price : candle.low
    candle.close = price
    candle.volume = candle.volume.plus(amount)
    // Note: For proper unique traders counting, you'd need to maintain sets of addresses
    // This is a simplified version
  }
  
  candle.save()
}
