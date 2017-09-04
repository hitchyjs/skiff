'use strict';

const lab = exports.lab = require( 'lab' ).script();
const describe = lab.experiment;
const before = lab.before;
const after = lab.after;
const it = lab.it;
const expect = require( 'code' ).expect;

const async = require( 'async' );
const MemDown = require( 'memdown' );

const Node = require( '../' );

describe( 'election', () => {
	let nodes, followers, leader;

	const nodeAddresses = [
		'/ip4/127.0.0.1/tcp/9090',
		'/ip4/127.0.0.1/tcp/9091',
		'/ip4/127.0.0.1/tcp/9092'
	];

	before( done => {
		nodes = nodeAddresses.map( address => Node( address, {
			db: MemDown,
			peers: nodeAddresses
		} ) );
		done();
	} );

	before( done => {
		async.each( nodes, ( node, cb ) => node.start( cb ), done );
	} );

	after( done => {
		async.each( nodes, ( node, cb ) => node.stop( cb ), done );
	} );

	it( 'waits for end of election', { timeout: 5000 }, done => {
		async.each( nodes, ( node, cb ) => node.once( 'elected', () => cb() ), done );
	} );

	it( 'one of the nodes was elected leader', done => {
		leader = nodes.find( node => node.is( 'leader' ) );
		followers = nodes.filter( node => node.is( 'follower' ) );
		expect( followers.length ).to.equal( 2 );
		expect( leader ).to.not.be.undefined();
		expect( followers.indexOf( leader ) ).to.equal( -1 );
		done();
	} );

} );
