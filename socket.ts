import { EventEmitter } from 'node:events'

type PromiseResolver<T> = (value: T | PromiseLike<T>) => void
type PromiseRejecter = (reason?: unknown) => void

export class AdapterError extends Error {
	constructor(message: string){
		super(message)
		this.name = 'AdapterError'
	}
}

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
	error?: string
}

type SocketIncomingPayload = SocketCommandPayload | SocketEventPayload | SocketResultPayload
type SocketOutgoingPayload = SocketCommandPayload | SocketEventPayload | SocketResultPayload

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
	on(event: 'connecting', listener: (event: Event) => void): this
	on(event: 'open', listener: (event: Event) => void): this
	on(event: 'close', listener: (event: SocketCloseLikeEvent) => void): this
	on(event: 'error', listener: (event: Event) => void): this
	on(event: 'message', listener: (payload: SocketIncomingPayload) => void): this
	send(payload: SocketOutgoingPayload): void
	close(code?: number, reason?: string): void
}

interface PendingRequest {
	requestId?: string
	payload: SocketCommandPayload | SocketEventPayload
	sent?: boolean
	resolve: PromiseResolver<unknown>
	reject: PromiseRejecter
}

export interface QueuedCommandPromise<TResult = unknown> extends Promise<TResult> {
	requestId: string
	payload: SocketCommandPayload
}

export interface QueuedCommandResultEventDispatcher {
	sendCommand<TResult = SocketResultPayload>(payload: Omit<SocketCommandPayload, 'requestId'>): QueuedCommandPromise<TResult>
	sendEvent(payload: SocketEventPayload): void
}

type CommandRequestPayload = Omit<SocketCommandPayload, 'requestId'> & {
	command: string
}

function isCommandPayload(payload: SocketIncomingPayload): payload is SocketCommandPayload {
	return 'command' in payload
}

function isEventPayload(payload: SocketIncomingPayload): payload is SocketEventPayload {
	return 'event' in payload
}

function isResultPayload(payload: SocketIncomingPayload): payload is SocketResultPayload {
	return 'requestId' in payload
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
		if(isCommandPayload(payload)){
			let commandPayload = payload
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
		}else if(isResultPayload(payload)){
			let resultPayload = payload
			let handlerIndex = requestRegistry
				.findIndex(({ requestId }) => requestId === resultPayload.requestId)

			if(handlerIndex === -1)
				return

			let { resolve, reject } = requestRegistry[handlerIndex]

			try{
				if(resultPayload.error)
					reject(new AdapterError(resultPayload.error))
				else
					resolve(resultPayload)
			}catch(error){
				throw error
			}finally{
				requestRegistry.splice(handlerIndex, 1)
			}
		}else if(isEventPayload(payload)){
			let eventPayload = payload
			let handler = handlers[eventPayload.event] as EventHandler | undefined

			if(!handler)
				throw new Error(`unknown event "${eventPayload.event}"`)

			handler(eventPayload)
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
		sendCommand<TResult = SocketResultPayload>(payload: CommandRequestPayload){
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
				new Promise<TResult>((resolve, reject) => {
					Object.assign(request, {
						resolve,
						reject
					})

					requestRegistry.push(request)
					pushRequests()
				}),
				{
					requestId,
					payload: requestPayload
				}
			) as QueuedCommandPromise<TResult>
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
	let socket: WebSocket | null = null
	let events = new EventEmitter()

	function connect(){
		if(socket)
			return
		
		socket = new WebSocket(url)
		socket.addEventListener('open', handleOpen)
		socket.addEventListener('close', handleClose)
		socket.addEventListener('error', handleError)
		socket.addEventListener('message', handleMessage)
		events.emit('connecting')
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

	const reconnectingSocket = Object.assign(events, {
		send(payload: SocketOutgoingPayload){
			if(!socket)
				throw new Error(`socket not connected`)

			socket.send(JSON.stringify(payload))
		},
		close(code?: number, reason?: string){
			socket?.close(code, reason)
		}
	})

	Object.defineProperty(reconnectingSocket, 'readyState', {
		get(){
			return socket?.readyState ?? WebSocket.CLOSED
		},
		enumerable: true,
		configurable: true
	})

	return reconnectingSocket as unknown as ReconnectingSocket
}