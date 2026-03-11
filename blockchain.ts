import pino from 'pino'
import pkg from './package.json'

import {
	createSocket, 
	createQueuedCommandResultEventDispatcher,
	type QueuedCommandResultEventDispatcher,
	type ReconnectingSocket,
	type SocketHandlers
} from './socket'

import type { 
	Caip2ChainId, 
	BlockchainMethod,
	BlockchainRegisterCommand, 
	BlockchainRegisterResult, 
	WalletVerifyCommand,
	WalletVerifyResult,
	WalletCreateCommand, 
	WalletCreateResult,
	WalletQueryCommand,
	WalletQueryResult,
	WalletSubscribeCommand,
	WalletUnsubscribeCommand,
	WalletUpdateEvent,
} from './blockchain.protocol'


type BlockchainInterfaceMethods = {
	WalletVerify: (args: WalletVerifyCommand) => Promise<WalletVerifyResult>
	WalletCreate: (args: WalletCreateCommand) => Promise<WalletCreateResult>
	WalletQuery: (args: WalletQueryCommand) => Promise<WalletQueryResult>
	WalletSubscribe: (args: WalletSubscribeCommand) => Promise<void>
	WalletUnsubscribe: (args: WalletUnsubscribeCommand) => Promise<void>
}

type BlockchainMethodImplementations = Partial<BlockchainInterfaceMethods>

export interface LoggerLike {
	info: (...args: unknown[]) => void
	warn: (...args: unknown[]) => void
	error: (...args: unknown[]) => void
	debug: (...args: unknown[]) => void
	child: (bindings: Record<string, unknown>) => LoggerLike
}

interface BlockchainRegistration {
	socket: ReconnectingSocket
	sendCommand: QueuedCommandResultEventDispatcher['sendCommand']
	sendEvent: QueuedCommandResultEventDispatcher['sendEvent']
	methods: BlockchainMethodImplementations
	logger: LoggerLike
}

const registrations: Partial<Record<Caip2ChainId, BlockchainRegistration>> = {}
const methodsByChain: Partial<Record<Caip2ChainId, BlockchainMethodImplementations>> = {}

function getMethods(chainId: Caip2ChainId): BlockchainMethodImplementations {
	return (methodsByChain[chainId] ??= {})
}

function getImplementedMethods(methods: BlockchainMethodImplementations): BlockchainMethod[] {
	return Object.keys(methods) as BlockchainMethod[]
}

export let logger: LoggerLike = pino({ enabled: false })

export function setLogger(nextLogger: LoggerLike){
	logger = nextLogger
}

export function register(chainId: Caip2ChainId){
	if(registrations[chainId])
		return

	const registrationLogger = logger.child({ chainId })
	const masterUrl = process.env.ROUTER_MASTER_URL || 'ws://master:70/adapter'
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
		logger: registrationLogger
	}

	socket.on('connecting', () => {
		registrationLogger.info(`reconnecting to master ${masterUrl} using sdk version ${pkg.version}`)
	})

	socket.on('error', () => {
		registrationLogger.info(`failed to connect to master`)
	})

	socket.on('open', () => {
		registrationLogger.info(`connection to master opened - sending registration`)

		socket.once('close', () => {
			registrationLogger.warn(`connection to master closed`)
		})

		sendCommand<BlockchainRegisterResult>({
			command: 'BlockchainRegister',
			chainId,
			implementedMethods: getImplementedMethods(methods)
		} satisfies BlockchainRegisterCommand)
			.then(() => registrationLogger.info(`successfully registered with master`))
			.catch(error => registrationLogger.error(`failed to register with master: ${error.message}`))
	})

	registrationLogger.info(`connecting to master ${masterUrl} using sdk version ${pkg.version}`)
}


export function unregister(chainId: Caip2ChainId, reason?: string){
	const registration = registrations[chainId]

	if(!registration)
		return

	registration.logger.info(`unregistering from master with reason "${reason}"`)
	registration.socket.close(4000, reason)
	delete registrations[chainId]
}

export function implementWalletVerify(
	chainId: Caip2ChainId,
	walletVerify: (args: WalletVerifyCommand) => Promise<WalletVerifyResult>
){
	getMethods(chainId).WalletVerify = async (args: WalletVerifyCommand) => {
		const wallet = await walletVerify(args)
		registrations[chainId]?.logger.info(`verified wallet: ${wallet.address}`)
		return wallet
	}
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

export function implementWalletSubscribe(
	chainId: Caip2ChainId,
	walletSubscribe: (args: WalletSubscribeCommand) => Promise<void>
){
	getMethods(chainId).WalletSubscribe = async (args: WalletSubscribeCommand) => {
		registrations[chainId]?.logger.info(`subscribing wallet ${args.address}`)
		await walletSubscribe(args)
	}
}

export function implementWalletUnsubscribe(
	chainId: Caip2ChainId,
	walletUnsubscribe: (args: WalletUnsubscribeCommand) => Promise<void>
){
	getMethods(chainId).WalletUnsubscribe = async (args: WalletUnsubscribeCommand) => {
		registrations[chainId]?.logger.info(`unsubscribing wallet ${args.address}`)
		await walletUnsubscribe(args)
	}
}

export function dispatchWalletUpdate(
	chainId: Caip2ChainId,
	address: WalletUpdateEvent['address'],
	result: Pick<WalletUpdateEvent, 'balances'>
){
	const registration = registrations[chainId]

	if(!registration)
		return

	registration.sendEvent({
		event: 'WalletUpdate',
		address,
		balances: result.balances
	} satisfies WalletUpdateEvent)

	registration.logger.info(`dispatched wallet update for ${address}`)
}