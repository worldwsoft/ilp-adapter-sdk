import tsrpc from 'tsrpc'
import { serviceProto, ServiceType } from './blockchain/protocol.generated'

type RouterMethods = {
	WalletCreate: Function
	WalletQuery: Function
	WalletWatch: Function
}

export type RouterConnection = {
	client: any
	methods: Partial<RouterMethods>
}

export function createRouterConnection({ chainId }: { chainId: string }): RouterConnection {
	const client = new tsrpc.WsClient(serviceProto, {
		server: process.env.ROUTER_INTERFACE_URL || 'ws://localhost:8070'
	})

	const connection: RouterConnection = {
		client,
		methods: {}
	}

	client.flows.postConnectFlow.push(async () => {
		await client.callApi('Init', {
			chain: chainId,
			implementedMethods: Object.keys(connection.methods)
		})
	})

	client.listenMsg('WalletCreate' as any, async (req: any) => {
		if (!connection.methods.WalletCreate)
			throw new Error('WalletCreate is not implemented')

		return await connection.methods.WalletCreate(req)
	})

	client.listenMsg('WalletQuery' as any, async (req: any) => {
		if (!connection.methods.WalletQuery)
		throw new Error('WalletQuery is not implemented')

		return await connection.methods.WalletQuery(req)
	})

	client.listenMsg('WalletWatch' as any, async (req: any) => {
		if (!connection.methods.WalletWatch)
			throw new Error('WalletWatch is not implemented')

		return await connection.methods.WalletWatch(req)
	})

	void client.connect()

	return connection
}

export function implementWalletCreate(connection: RouterConnection, method: Function) {
	connection.methods.WalletCreate = method
}

export function implementWalletQuery(connection: RouterConnection, method: Function) {
	connection.methods.WalletQuery = method
}

export function implementWalletWatch(connection: RouterConnection, method: Function) {
	connection.methods.WalletWatch = method
}