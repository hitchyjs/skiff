'use strict'

const lab = exports.lab = require('lab').script()
const describe = lab.experiment
const before = lab.before
const after = lab.after
const it = lab.it
const expect = require('code').expect

const memdown = require('memdown')
const async = require('async')
const timers = require('timers')
const networkAddress = require('network-address')()

const Node = require('../')

describe('shared network', () => {
  let baseNode
  const nodeAddresses = [
    `/ip4/${networkAddress}/tcp/9991/p/1`,
    `/ip4/${networkAddress}/tcp/9992/p/1`,
    `/ip4/${networkAddress}/tcp/9993/p/1`
  ]

  const base = nodeAddresses[0]
  const nodes = []

  it('can create base node', {timeout: 10000}, done => {
    const network = Node.createNetwork({
      passive: {
        server: {
          host: networkAddress,
          port: 9991
        }
      }
    })
    baseNode = Node(
      nodeAddresses[0],
      {
        db: memdown,
        network
      })
    nodes.push(baseNode)
    baseNode.start(err => {
      if (err) {
        return done(err)
      }
      baseNode.once('leader', done)
    })
  })

  it ('can make a few writes', done => {
    const db = baseNode.leveldown()
    async.eachSeries([1,2,3,4,5,6,7,8,9], (key, cb) => {
      db.put(key.toString(), key.toString(), cb)
    }, done)
  })

  it('can join a second node', done => {
    baseNode.join(nodeAddresses[1], done)
  })

  it('can wait a bit', {timeout: 2000}, done => timers.setTimeout(done, 1000))

  return;

  it('can rail in a second node', done => {
    const network = Node.createNetwork({
      passive: {
        server: {
          host: networkAddress,
          port: 9992
        }
      }
    })

    const node = Node(
      nodeAddresses[1],
      {
        db: memdown,
        network,
        peers: [nodeAddresses[0]]
      })
    nodes.push(node)
    node.start(done)
  })

  it ('can make a few more writes', done => {
    const db = nodes[1].leveldown()
    async.eachSeries([11,12,13,14,15,16,17,18,19], (key, cb) => {
      db.put(key.toString(), key.toString(), cb)
    }, done)
  })

  it ('can rail in a third node', {timeout: 10000}, done => {

    const network = Node.createNetwork({
      passive: {
        server: {
          host: networkAddress,
          port: 9993
        }
      }
    })

    const node = Node(
      nodeAddresses[2],
      {
        db: memdown,
        network,
        peers: [nodeAddresses[0], nodeAddresses[1]]
      })
    nodes.push(node)
    node.start(err => {
      if (err) {
        return done(err)
      }
      node.weaken(1000)
      baseNode.join(nodeAddresses[2], done)
    })
  })

  it ('can make a few more writes', done => {
    const db = baseNode.leveldown()
    async.eachSeries([11,12,13,14,15,16,17,18,19], (key, cb) => {
      db.put(key.toString(), key.toString(), cb)
    }, done)
  })
})