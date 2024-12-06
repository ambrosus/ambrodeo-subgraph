import { TokenCreated } from '../generated/TokenFactory/TokenFactory'
import { Token, User } from '../generated/schema'

export function handleTokenCreated(event: TokenCreated): void {
  // Create or load the Token entity
  let token = new Token(event.params.tokenAddress.toHex())
  token.name = event.params.name
  token.symbol = event.params.symbol
  token.creator = event.params.creator.toHex()
  token.initialSupply = event.params.initialSupply
  token.createdAt = event.block.timestamp
  token.save()

  // Create or load the User entity
  let user = User.load(event.params.creator.toHex())
  if (user == null) {
    user = new User(event.params.creator.toHex())
    user.save()
  }
}
