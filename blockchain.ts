import log from '@mwni/log'
import pkg from './package.json'

import { 
	createSocket, 
	createQueuedCommandResultEventDispatcher,
	type QueuedCommandResultEventDispatcher,
	type ReconnectingSocket,
	type SocketHandlers
} from './socket'

import { 
	Caip2ChainId, 
	type BlockchainMethod,
	BlockchainRegisterCommand, 
	BlockchainRegisterResult, 
	WalletCreateCommand, 
	WalletCreateResult,
	WalletQueryCommand,
	WalletQueryResult
} from './blockchain.protocol'


type BlockchainInterfaceMethods = {
	WalletCreate: (args: WalletCreateCommand) => Promise<WalletCreateResult>
	WalletQuery: (args: WalletQueryCommand) => Promise<WalletQueryResult>
}

type BlockchainMethodImplementations = Partial<BlockchainInterfaceMethods>
type Logger = ReturnType<typeof log.fork>

interface BlockchainRegistration {
	socket: ReconnectingSocket
	sendCommand: QueuedCommandResultEventDispatcher['sendCommand']
	sendEvent: QueuedCommandResultEventDispatcher['sendEvent']
	methods: BlockchainMethodImplementations
	logger: Logger
}

const registrations: Partial<Record<Caip2ChainId, BlockchainRegistration>> = {}
const methodsByChain: Partial<Record<Caip2ChainId, BlockchainMethodImplementations>> = {}

function getMethods(chainId: Caip2ChainId): BlockchainMethodImplementations {
	return (methodsByChain[chainId] ??= {})
}

function getRegistration(chainId: Caip2ChainId): BlockchainRegistration {
	const registration = registrations[chainId]

	if(!registration)
		throw new Error(`chain "${chainId}" is not registered`)

	return registration
}

function getImplementedMethods(methods: BlockchainMethodImplementations): BlockchainMethod[] {
	return Object.keys(methods) as BlockchainMethod[]
}

export function register(chainId: Caip2ChainId){
	if(registrations[chainId])
		return

	const logger = log.fork({ name: chainId, root: undefined })
	const masterUrl = process.env.ROUTER_MASTER_URL || 'ws://master:70/interface'
	const methods = getMethods(chainId)
	const socket = createSocket(masterUrl)
	const { sendCommand, sendEvent } = createQueuedCommandResultEventDispatcher(
		socket,
		methods as unknown as SocketHandlers
	)

	registrations[chainId] = {
		socket,
		sendCommand,
		sendEvent,
		methods,
		logger
	}

	socket.on('open', () => {
		logger.info(`connection to master opened - sending registration`)

		sendCommand<BlockchainRegisterResult>({
			command: 'BlockchainRegister',
			chainId,
			implementedMethods: getImplementedMethods(methods)
		} satisfies BlockchainRegisterCommand)
			.then(() => logger.info(`successfully registered with master`))
			.catch(error => logger.error(`failed to register with master: ${error.message}`))
	})

	socket.on('close', () => {
		logger.warn(`connection to master closed`)
	})

	socket.on('error', () => {
		logger.debug(`master connection error`)
	})

	logger.info(`connecting to master ${masterUrl} using sdk version ${pkg.version}`)
}


export function unregister(chainId: Caip2ChainId, reason?: string){
	const registration = registrations[chainId]

	if(!registration)
		return

	registration.logger.info(`unregistering from master with reason "${reason}"`)
	registration.socket.close(4000, reason)
	delete registrations[chainId]
}

export function implementWalletCreate(
	chainId: Caip2ChainId,
	walletCreate: (args: WalletCreateCommand) => Promise<WalletCreateResult>
){
	getMethods(chainId).WalletCreate = async (args: WalletCreateCommand) => {
		const wallet = await walletCreate(args)
		registrations[chainId]?.logger.info(`created wallet: ${wallet.address}`)
		return wallet
	}
}

export function implementWalletQuery(
	chainId: Caip2ChainId,
	walletQuery: (args: WalletQueryCommand) => Promise<WalletQueryResult>
){
	getMethods(chainId).WalletQuery = async (args: WalletQueryCommand) => {
		registrations[chainId]?.logger.info(`querying wallet ${args.address}`)
		return await walletQuery(args)
	}
}