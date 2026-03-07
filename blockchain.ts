import log from '@mwni/log'

import { 
	createSocket, 
	createQueuedCommandResultEventDispatcher,
	type SocketHandlers
} from './socket'

import { 
	BlockchainRegisterCommand, 
	BlockchainRegisterResult, 
	BlockchainOnlineEvent,
	WalletCreateCommand, 
	WalletCreateResult,
	WalletQueryCommand,
	WalletQueryResult
} from './blockchain.protocol'


type BlockchainInterfaceMethods = {
	WalletCreate: Function
	WalletQuery: Function
	WalletWatch: Function
}

export type RouterConnection = {
	socket: any,
	sendCommand: Function,
	sendEvent: Function,
	methods: Partial<BlockchainInterfaceMethods>
}

export function createRouterConnection({ chainId }: { chainId: string }): RouterConnection {
	log.info(`connecting to master`)

	const methods: Partial<BlockchainInterfaceMethods> = {}
	const socket = createSocket(process.env.ROUTER_INTERFACE_URL || 'ws://localhost:8070')
	const { sendCommand, sendEvent } = createQueuedCommandResultEventDispatcher(
		socket,
		methods as SocketHandlers
	)

	const connection: RouterConnection = {
		socket,
		sendCommand,
		sendEvent,
		methods
	}

	socket.on('open', () => {
		log.info(`registering with master`)

		sendCommand({
			command: 'BlockchainRegister',
			chainId,
			implementedMethods: Object.keys(connection.methods)
		} as BlockchainRegisterCommand)
			.then(() => log.info(`successfully registered with master`))
			.catch(error => log.error(`failed to register with master: ${error.message}`))
	})

	socket.on('close', () => {
		log.warn(`connection to master closed`)
	})

	socket.on('error', (error: any) => {
		log.error(`master connection error`)
	})

	return connection
}

export function dispatchOnline(connection: RouterConnection, online: boolean, error?: string){
	log.info(`dispatched online status: ${online}`)
	connection.sendEvent({
		event: 'BlockchainOnline',
		online,
		error
	} as BlockchainOnlineEvent)
}

export function implementWalletCreate(
	connection: RouterConnection, 
	walletCreate: (args: WalletCreateCommand) => Promise<WalletCreateResult>
){
	connection.methods.WalletCreate = async (args: WalletCreateCommand) => {
		const wallet = await walletCreate(args)
		log.info(`created wallet: ${wallet.address}`)
		return wallet
	}
}

export function implementWalletQuery(
	connection: RouterConnection,
	walletQuery: (args: WalletQueryCommand) => Promise<WalletQueryResult>
){
	connection.methods.WalletQuery = async (args: WalletQueryCommand) => {
		log.info(`querying wallet ${args.address}`)
		return await walletQuery(args)
	}
}

/*
export function implementWalletWatch(connection: RouterConnection, method: Function) {
	connection.methods.WalletWatch = method
}*/