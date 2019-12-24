/**
 * (c) 2019 cepharum GmbH, Berlin, http://cepharum.de
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2019 cepharum GmbH
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 * @author: cepharum
 */

const UDP = require( "dgram" );
const Util = require( "util" );


/**
 * Cache singleton instance used to capture all logs.
 *
 * @type {LogServer}
 * @private
 */
let server;

/**
 * Caches socket instance used for transmitting messages as a client.
 *
 * @type {Socket}
 * @private
 */
let client;


/**
 * Implements UDP-based receiver for collecting log messages generated by
 * multiple clients.
 */
class LogServer {
	/**
	 * Fetches singleton server instance.
	 *
	 * @returns {LogServer}
	 */
	static get() {
		if ( !server ) {
			server = new this();
		}

		return server;
	}

	/**
	 * @param {int} bufferSize maximum number of records to keep
	 */
	constructor( bufferSize = null ) {
		const _size = Math.max( parseInt( bufferSize ) || process.env.DEBUG_LOG_BUFFER || 1000, 1000 );
		let write = 0;
		let captured = 0;

		Object.defineProperties( this, {
			/**
			 * Provides recently received log records.
			 *
			 * @name LogServer#logs
			 * @property {Array<{peer: string, msg: Buffer}>}
			 * @readonly
			 */
			logs: { value: new Array( _size ) },

			/**
			 * Exposes current number of entries in LogServer#logs.
			 *
			 * @name LogServer#write
			 * @property {int}
			 * @readonly
			 */
			write: { get: () => write },

			/**
			 * Exposes number of all captured log messages.
			 *
			 * @name LogServer#captured
			 * @property {int}
			 * @readonly
			 */
			captured: { get: () => captured },

			/**
			 * Collects provided message on behalf of server.
			 *
			 * @name LogServer#log
			 * @property {function(format: string, ...args):void}
			 * @readonly
			 */
			log: {
				value: ( msg, rinfo ) => {
					captured++;

					if ( write === _size ) {
						this.logs.splice( 0, 1 );
						write--;
					}

					this.logs[write++] = {
						peer: `${rinfo.address}:${rinfo.port}`,
						msg,
					};
				}
			},
		} );

		Object.defineProperties( this, {
			/**
			 * Exposes raw socket receiving incoming records.
			 *
			 * @name LogServer#_socket
			 * @property {Socket}
			 * @readonly
			 * @protected
			 */
			_socket: {
				value: UDP.createSocket( "udp4", this.log ),
			},
		} );

		Object.defineProperties( this, {
			/**
			 * Promises socket ready for receiving messages.
			 *
			 * @name LogServer#socket
			 * @property {Promise<Socket>}
			 * @readonly
			 */
			socket: {
				value: new Promise( ( resolve, reject ) => {
					const socket = this._socket;

					const onError = error => {
						socket.close();
						reject( error );
					};

					socket.once( "error", onError );
					socket.once( "listening", () => {
						socket.off( "error", onError );
						resolve( socket );
					} );

					socket.bind();
				} ),
			},
		} );

		Object.defineProperties( this, {
			/**
			 * Promises address of prepared socket receiving incoming messages.
			 *
			 * @property {Promise<{address: string, family: string, port: int}>}
			 * @readonly
			 */
			address: {
				value: this.socket.then( socket => {
					const { address, family, port } = socket.address();

					return {
						address: address === "0.0.0.0" ? "127.0.0.1" : address,
						family,
						port,
					};
				} )
			},
		} );
	}

	/**
	 * Displays and collects provided log message.
	 *
	 * @param {string} format format describing message to display and log
	 * @param {*} args data to be injected into message
	 * @returns {void}
	 */
	static log( format, ...args ) {
		process.stdout.write( Util.format( format, ...args ) + "\n" );

		this.collect( format, ...args );
	}

	/**
	 * Collects provided log message without displaying it.
	 *
	 * @param {string} format format describing message to log
	 * @param {*} args data to be injected into message
	 * @returns {void}
	 */
	static collect( format, ...args ) {
		if ( server ) {
			server.log( Buffer.from( Util.format( format, ...args ), "utf8" ), {
				address: "127.0.0.1",
				port: "server"
			} );
		} else {
			this.transmitLog( format, ...args );
		}
	}

	/**
	 * Promises service hasn't received new messages for a while.
	 *
	 * @param {int} timeout number of tenth of a second to wait for log settling
	 * @returns {Promise} promises service hasn't received new messages for a while
	 */
	settled( timeout = 50 ) {
		if ( !( timeout > 0 ) ) {
			return Promise.resolve();
		}

		process.stderr.write( "\nwaiting for log server to settle ...\n" );

		return new Promise( resolve => {
			let latest = this.captured;
			let settled = 0;
			let linear = 0;

			const timer = setInterval( () => {
				if ( ++linear >= timeout ) {
					clearInterval( timer );
					resolve();
				} else if ( this.captured > latest ) {
					settled = 0;
				} else if ( ++settled >= 10 ) {
					clearInterval( timer );
					resolve();
				}
			}, 100 );
		} );
	}

	/**
	 * Dumps current set of collected log messages to stderr.
	 *
	 * @param {int} settleTimeout number of tenth of a second to wait for log settling before dumping
	 * @returns {Promise} promises settled log dumped to stderr
	 */
	static dump( settleTimeout = 50 ) {
		if ( !server ) {
			process.stderr.write( `\nbacklog:\n... empty ...\n` );
			return Promise.resolve();
		}

		return server.settled( settleTimeout ).then( () => {
			process.stderr.write( `\nbacklog:\n` );

			for ( let i = 0, numEntries = server.write; i < numEntries; i++ ) {
				const { peer, msg } = server.logs[i];

				process.stderr.write( `${peer}: ${msg}\n` );
			}
		} );
	}

	/**
	 * Drops any current log server instance closing its listener socket.
	 *
	 * @returns {Promise} promises server dropped
	 */
	static drop() {
		return new Promise( ( resolve, reject ) => {
			if ( server ) {
				server._socket.once( "close", resolve );
				server._socket.once( "error", reject );
				server._socket.close();

				server = null;
			} else {
				resolve();
			}
		} );
	}

	/**
	 * Transmits provided message to log server selected by environment
	 * variables.
	 *
	 * @param {string} message log message to be transmitted
	 * @param {*} args data to be injected into message
	 * @returns {void}
	 */
	static transmitLog( message, ...args ) {
		const { DEBUG_LOG_SERVER_NAME, DEBUG_LOG_SERVER_PORT } = process.env;

		if ( DEBUG_LOG_SERVER_NAME && DEBUG_LOG_SERVER_PORT ) {
			if ( !client ) {
				client = UDP.createSocket( "udp4" );
			}

			const msg = args.length > 0 ? Util.format( message, ...args ) : message;

			client.send( Buffer.from( msg, "utf8" ), DEBUG_LOG_SERVER_PORT, DEBUG_LOG_SERVER_NAME );
		}
	}
}

module.exports = LogServer;
