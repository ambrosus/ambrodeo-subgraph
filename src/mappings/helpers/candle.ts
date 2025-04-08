import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";
import { Candle, Token } from "../../types/schema";
import { INTERVALS } from "./constants";

function createCandle(
  id: string,
  tokenId: string,
  interval: string,
  startTime: BigInt,
  intervalSeconds: BigInt,
  lastPrice: BigDecimal,
  price: BigDecimal
): Candle {
  const candle = new Candle(id);
  candle.token = tokenId;
  candle.interval = interval;
  candle.startTime = startTime;
  candle.endTime = startTime.plus(intervalSeconds);
  candle.open = lastPrice;
  candle.high = price;
  candle.low = price;
  candle.close = price;
  candle.volume = BigInt.fromI32(0);
  candle.save();
  return candle;
}

// Split into two helper functions - one for price updates and one for volume updates
export function updateCandlePrice(
  token: Token,
  price: BigDecimal,
  lastPrice: BigDecimal,
  timestamp: BigInt
): void {
  // If it's the first trade ever - the lastPrice is the current price
  if (lastPrice.equals(BigDecimal.zero())) {
    lastPrice = price;
  }
  // Update candles for all intervals
  for (let i = 0; i < INTERVALS.length; i++) {
    const interval = INTERVALS[i];
    const candleId =
      token.id +
      "-" +
      interval.name +
      "-" +
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

export function updateCandleVolume(
  token: Token,
  amount: BigInt,
  timestamp: BigInt
): void {
  // Update candles for all intervals
  for (let i = 0; i < INTERVALS.length; i++) {
    const interval = INTERVALS[i];
    const candleId =
      token.id +
      "-" +
      interval.name +
      "-" +
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

export function updateCandlePriceEntity(
  id: string,
  tokenId: string,
  interval: string,
  price: BigDecimal,
  lastPrice: BigDecimal,
  timestamp: BigInt,
  intervalSeconds: BigInt
): void {
  const startTime = timestamp.div(intervalSeconds).times(intervalSeconds);
  let candle = Candle.load(id);
  if (candle === null)
    candle = createCandle(
      id,
      tokenId,
      interval,
      startTime,
      intervalSeconds,
      lastPrice,
      price
    );

  candle.high = price.gt(candle.high) ? price : candle.high;
  candle.low = price.lt(candle.low) ? price : candle.low;
  candle.close = price;

  if (candle.open.equals(BigDecimal.zero())) {
    candle.open = lastPrice;
  }

  if (candle.low.equals(BigDecimal.zero())) {
    candle.low = lastPrice;
  }

  candle.save();
}

export function updateCandleVolumeEntity(
  id: string,
  tokenId: string,
  interval: string,
  amount: BigInt,
  timestamp: BigInt,
  intervalSeconds: BigInt
): void {
  const startTime = timestamp.div(intervalSeconds).times(intervalSeconds);
  let candle = Candle.load(id);
  if (candle === null)
    candle = createCandle(
      id,
      tokenId,
      interval,
      startTime,
      intervalSeconds,
      BigDecimal.zero(),
      BigDecimal.zero()
    );

  candle.volume = candle.volume.plus(amount);

  candle.save();
}
