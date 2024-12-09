import { BigInt, Address } from '@graphprotocol/graph-ts'
import {
  CreateToken as CreateTokenEvent
} from '../../generated/AMBRodeo/AMBRodeo'
import { Token, User, Curve, Holder, Insider } from '../../generated/schema'
import { Token as TokenTemplate } from '../../generated/templates'

export function handleCreateToken(event: CreateTokenEvent): void {
  // Create or load the creator user
  let creator = User.load(event.params.creator.toHexString())
  if (creator === null) {
    creator = new User(event.params.creator.toHexString())
    creator.isInsider = false
    creator.save()
  }

  // Create the token entity
  const tokenAddress = event.params.token.toHexString()
  const token = new Token(tokenAddress)
  token.creator = creator.id
  token.name = event.params.name
  token.symbol = event.params.symbol
  token.initialSupply = event.params.initialSupply
  token.totalSupply = event.params.initialSupply
  token.createdAt = event.block.timestamp

  // Create and link the curve
  const curve = new Curve(tokenAddress)
  curve.token = token.id
  curve.points = event.params.curvePoints
  curve.updatedAt = event.block.timestamp
  curve.save()

  token.curve = curve.id
  token.save()

  // Create initial holder entry for creator
  const holderId = tokenAddress + '-' + event.params.creator.toHexString()
  const holder = new Holder(holderId)
  holder.token = token.id
  holder.user = creator.id
  holder.balance = event.params.initialSupply
  holder.updatedAt = event.block.timestamp
  holder.save()

  // Create initial insider entry for creator
  const insiderId = tokenAddress + '-' + event.params.creator.toHexString()
  const insider = new Insider(insiderId)
  insider.token = token.id
  insider.user = creator.id
  insider.addedAt = event.block.timestamp
  insider.removedAt = null
  insider.save()

  // Start indexing events from the new token contract
  TokenTemplate.create(event.params.token)
}
