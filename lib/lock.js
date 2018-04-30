var util = require('util')
var defaultTimeout = 5000
var promisify =
  util.promisify ||
  function(x) {
    return x
  }

function acquireLock(client, lockName, timeout, retryDelay, onLockAcquired) {
  function retry() {
    setTimeout(function() {
      acquireLock(client, lockName, timeout, retryDelay, onLockAcquired)
    }, retryDelay)
  }

  var lockTimeoutValue = Date.now() + timeout + 1
  client.set(lockName, lockTimeoutValue, 'PX', timeout, 'NX', function(
    err,
    result
  ) {
    if (err || result === null) {
      //l('Lock retry: ', lockName)
      retry()
    } else {
      //l('Lock success: ', lockName)
      onLockAcquired(lockTimeoutValue)
    }
  })
}

module.exports = function(client, retryDelay) {
  if (!(client && client.setnx)) {
    throw new Error(
      'You must specify a client instance of http://github.com/mranney/node_redis'
    )
  }

  retryDelay = retryDelay || 200

  function lock(lockName, timeout, taskToPerform) {
    if (!lockName) {
      throw new Error(
        'You must specify a lock string. It is on the redis key `lock.[string]` that the lock is acquired.'
      )
    }

    if (!taskToPerform) {
      taskToPerform = timeout
      timeout = defaultTimeout
    }

    lockName = 'lock.' + lockName

    acquireLock(client, lockName, timeout, retryDelay, function(
      lockTimeoutValue
    ) {
      taskToPerform(
        promisify(function(done) {
          done = done || function() {}

          if (lockTimeoutValue > Date.now()) {
            //l('Unlocked ', lockName)
            client.del(lockName, done)
          } else {
            done()
          }
        })
      )
    })
  }

  if (util.promisify) {
    lock[util.promisify.custom] = function(lockName, timeout) {
      return new Promise(function(resolve) {
        lock(lockName, timeout || defaultTimeout, resolve)
      })
    }
  }

  return lock
}