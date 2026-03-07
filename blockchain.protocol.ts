export type Caip2ChainId = `${string}:${string}`
export type Caip10WalletAddress = `${Caip2ChainId}:${string}`
export type Caip19AssetId = `${Caip2ChainId}/${string}:${string}`

export type BlockchainMethod = 'WalletCreate' | 'WalletQuery'

export type WalletSecrets = Record<string, string>
export type WalletBalances = Record<Caip19AssetId, string>

export interface BlockchainRegisterCommand {
	command: 'BlockchainRegister'
	chainId: Caip2ChainId
	implementedMethods: BlockchainMethod[]
}

export type BlockchainRegisterResult = Record<string, never>

export interface WalletCreateCommand {
	command: 'WalletCreate'
	entropy: string
}

export interface WalletCreateResult {
	address: Caip10WalletAddress
	secrets: WalletSecrets
}

export interface WalletQueryCommand {
	command: 'WalletQuery'
	address: Caip10WalletAddress
}

export interface WalletQueryResult {
	balances: WalletBalances
}

export type BlockchainCommand =
	| BlockchainRegisterCommand
	| WalletCreateCommand
	| WalletQueryCommand

export type BlockchainResult =
	| BlockchainRegisterResult
	| WalletCreateResult
	| WalletQueryResult