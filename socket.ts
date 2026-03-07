import { EventEmitter } from 'node:events'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]

interface JsonObject {
	[key: string]: JsonValue
}

type PromiseResolver<T> = (value: T | PromiseLike<T>) => void
type PromiseRejecter = (reason?: unknown) => void

export interface SocketCommandPayload {
	[key: string]: unknown
	command: string
	requestId?: string
}

export interface SocketEventPayload {
	[key: string]: unknown
	event: string
}

export interface SocketResultPayload {
	[key: string]: unknown
	requestId?: string
	error?: unknown
}

type SocketIncomingPayload = SocketCommandPayload | SocketEventPayload | SocketResultPayload

type CommandHandler<TPayload extends SocketCommandPayload = SocketCommandPayload, TResult = unknown> =
	(payload: TPayload) => TResult | Promise<TResult>

type EventHandler<TPayload extends SocketEventPayload = SocketEventPayload> =
	(payload: TPayload) => void

export type SocketHandlers = Record<string, CommandHandler | EventHandler>

interface SocketCloseLikeEvent {
	reason?: string
}

export interface ReconnectingSocket extends EventEmitter {
	readyState: number
	on(event: 'open', listener: (event: Event) => void): this
	on(event: 'close', listener: (event: SocketCloseLikeEvent) => void): this
	on(event: 'error', listener: (event: Event) => void): this
	on(event: 'message', listener: (payload: SocketIncomingPayload) => void): this
	send(payload: SocketCommandPayload | SocketEventPayload | SocketResultPayload): void
}

interface PendingRequest<TResult = unknown> {
	requestId?: string
	payload: SocketCommandPayload | SocketEventPayload
	sent?: boolean
	resolve: PromiseResolver<TResult>
	reject: PromiseRejecter
}

export interface QueuedCommandPromise<TResult = unknown> extends Promise<TResult> {
	requestId: string
	payload: SocketCommandPayload
}

export interface QueuedCommandResultEventDispatcher {
	sendCommand(payload: Omit<SocketCommandPayload, 'requestId'>): QueuedCommandPromise
	sendEvent(payload: SocketEventPayload): void
}

type CommandRequestPayload = Omit<SocketCommandPayload, 'requestId'> & {
	command: string
}

export function createQueuedCommandResultEventDispatcher(
	socket: ReconnectingSocket,
	handlers: SocketHandlers
): QueuedCommandResultEventDispatcher {
	let requestRegistry: PendingRequest[] = []
	let requestCounter = 0

	socket.on('open', pushRequests)
	socket.on('close', event => {
		for(let { reject } of requestRegistry){
			reject(new Error(event?.reason || 'connection closed'))
		}

		requestRegistry.length = 0
	})

	socket.on('message', async payload => {
		if(payload.command){
			let commandPayload = payload as SocketCommandPayload
			let handler = handlers[commandPayload.command] as CommandHandler | undefined

			try{
				if(!handler)
					throw new Error(`unknown command "${commandPayload.command}"`)

				let commandResult = await handler(commandPayload)
				let resultPayload = (
					commandResult && typeof commandResult === 'object'
				) ? commandResult as Record<string, unknown> : {}

				socket.send({
					...resultPayload,
					requestId: commandPayload.requestId
				})
			}catch(error){
				let errorMessage = error instanceof Error ? error.message : String(error)

				socket.send({
					error: errorMessage,
					requestId: commandPayload.requestId
				})
			}
		}else if(payload.event){
			let eventPayload = payload as SocketEventPayload
			let handler = handlers[eventPayload.event] as EventHandler | undefined

			if(!handler)
				throw new Error(`unknown event "${eventPayload.event}"`)

			handler(eventPayload)
		}else if(payload.requestId){
			let resultPayload = payload as SocketResultPayload
			let handlerIndex = requestRegistry
				.findIndex(({ requestId }) => requestId === resultPayload.requestId)

			if(handlerIndex === -1)
				return

			let { resolve, reject } = requestRegistry[handlerIndex] as PendingRequest<SocketResultPayload>

			try{
				if(resultPayload.error)
					reject(resultPayload)
				else
					resolve(resultPayload)
			}catch(error){
				throw error
			}finally{
				requestRegistry.splice(handlerIndex, 1)
			}
		}else{
			throw new Error(`unexpected message format: ${JSON.stringify(payload)}`)
		}
	})

	function pushRequests(){
		if(socket.readyState !== 1)
			return

		for(let request of requestRegistry.slice()){
			if(request.sent)
				continue

			socket.send(request.payload)

			if(request.requestId)
				request.sent = true
			else
				requestRegistry.splice(requestRegistry.indexOf(request), 1)
		}
	}

	return {
		sendCommand(payload: CommandRequestPayload){
			let requestId = `r${++requestCounter}`
			let requestPayload: SocketCommandPayload = {
				...payload,
				requestId
			}

			let request: PendingRequest = {
				requestId,
				payload: requestPayload,
				resolve: () => undefined,
				reject: () => undefined
			}

			return Object.assign(
				new Promise<unknown>((resolve, reject) => {
					Object.assign(request, {
						resolve,
						reject
					})

					requestRegistry.push(request)
					pushRequests()
				}),
				request
			) as unknown as QueuedCommandPromise
		},
		sendEvent(payload: SocketEventPayload){
			requestRegistry.push({
				payload,
				resolve: () => undefined,
				reject: () => undefined
			})
			pushRequests()
		}
	}
}

export function createSocket(url: string): ReconnectingSocket {
	let socket: WebSocket | null
	let events = new EventEmitter()

	function connect(){
		if(socket)
			return
		
		socket = new WebSocket(url)
		socket.addEventListener('open', handleOpen)
		socket.addEventListener('close', handleClose)
		socket.addEventListener('error', handleError)
		socket.addEventListener('message', handleMessage)
	}

	function handleOpen(event: Event){
		events.emit('open', event)
	}

	function handleClose(event: CloseEvent){
		setTimeout(connect, 1000)
		events.emit('close', event)
		socket = null
	}

	function handleError(event: Event){
		events.emit('error', event)
	}

	function handleMessage(evt: MessageEvent<string>){
		events.emit('message', JSON.parse(evt.data) as SocketIncomingPayload)
	}

	connect()

	return Object.defineProperties(
		Object.assign(
			events,
			{
				send(payload: JsonObject){
					if(!socket)
						throw new Error(`socket not connected`)

					socket.send(JSON.stringify(payload))
				}
			}
		),
		{
			readyState: {
				get(){
					return socket?.readyState ?? WebSocket.CLOSED
				},
				enumerable: true,
				configurable: true
			}
		}
	) as ReconnectingSocket
}