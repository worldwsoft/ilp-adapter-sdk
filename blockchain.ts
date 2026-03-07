import log from '@mwni/log'
import { createSocket, createQueuedCommandResultEventDispatcher } from './socket'
import { 
	RegisterCommand, 
	RegisterResult, 
	OnlineEvent,
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
	log.info(`registering with master`)

	const methods: Partial<BlockchainInterfaceMethods> = {}
	const socket = createSocket(process.env.ROUTER_INTERFACE_URL || 'ws://localhost:8070')
	const { sendCommand, sendEvent } = createQueuedCommandResultEventDispatcher(
		socket,
		methods
	)

	const connection: RouterConnection = {
		socket,
		sendCommand,
		sendEvent,
		methods
	}

	socket.on('open', () => {
		sendCommand({
			command: 'Register',
			chainId,
			implementedMethods: Object.keys(connection.methods)
		} as RegisterCommand)
			.then(() => log.info(`successfully registered with master`))
			.catch(error => log.error(`failed to register with master: ${error.message}`))
	})

	return connection
}

export function dispatchOnline(connection: RouterConnection, online: boolean, error?: string){
	log.info(`dispatched online status: ${online}`)
	connection.sendEvent({
		event: 'Online',
		online,
		error
	} as OnlineEvent)
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