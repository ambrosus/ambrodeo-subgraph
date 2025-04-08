import { BigDecimal, BigInt } from "@graphprotocol/graph-ts";

const X18 = BigInt.fromI32(10).pow(18);
const MILLION = BigInt.fromI32(1000000);
export const MILLION_x18 = MILLION.times(X18);
export const X18BD = new BigDecimal(X18);

class Interval {
  name: string;
  seconds: BigInt;

  constructor(name: string, seconds: BigInt) {
    this.name = name;
    this.seconds = seconds;
  }
}

const INTERVAL_1M = BigInt.fromI32(60);
const INTERVAL_5M = INTERVAL_1M.times(BigInt.fromI32(5));
const INTERVAL_15M = INTERVAL_1M.times(BigInt.fromI32(15));
const INTERVAL_30M = INTERVAL_1M.times(BigInt.fromI32(30));
const INTERVAL_1H = INTERVAL_1M.times(BigInt.fromI32(60));
const INTERVAL_4H = INTERVAL_1H.times(BigInt.fromI32(4));
const INTERVAL_1D = INTERVAL_1H.times(BigInt.fromI32(24));

export const INTERVALS: Interval[] = [
  new Interval("1m", INTERVAL_1M),
  new Interval("5m", INTERVAL_5M),
  new Interval("15m", INTERVAL_15M),
  new Interval("30m", INTERVAL_30M),
  new Interval("1h", INTERVAL_1H),
  new Interval("4h", INTERVAL_4H),
  new Interval("1d", INTERVAL_1D),
];
