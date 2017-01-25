'use strict'

/**
 * @class NGNX.DATA.JsonFileProxy
 * Persist NGN DATA stores using a JSON file.
 */
class JsonFileProxy extends NGN.DATA.Proxy {
  constructor (config) {
    config = config || {}

    if (typeof config === 'string') {
      config = {
        directory: config
      }
    }

    if (!config.directory) {
      throw new Error('No database configuration detected.')
    }

    if (!NGN.util.pathReadable(config.directory)) {
      console.warn(config.directory + ' does not exist or cannot be found. It will be created automatically if any data operation is requested.')
    }

    super(config)

    config.directory = require('path').resolve(config.directory)

    Object.defineProperties(this, {
      /**
       * @cfg {string} directory
       * Path to the JSON file.
       */
      directory: NGN.const(require('path').dirname(config.directory)),

      dbfile: NGN.const(config.directory),

      file: NGN.const(require('path').basename(config.directory)),

      /**
       * @cfg {string} [encryptionKey=null]
       * Set this to a hash key to obfuscate (scramble) the data. This is a
       * reversible hashing method and should not be considered "secure", but it
       * will make the file on disk unreadable to a human if they do not have
       * the key.
       */
      munge: NGN.private(NGN.coalesce(config.encryptionKey, null))
    })
  }

  get lockfile () {
    return this.dbfile + '.lock'
  }

  get locked () {
    return NGN.util.pathReadable(this.lockfile)
  }

  get lockfilepid () {
    if (!this.locked) {
      return 'None'
    }

    return require('fs').readFileSync(this.lockfile).toString().trim()
  }

  init (datastore) {
    super.init(datastore)
    NGN.inherit(this, datastore)
  }

  mkdirp (dir) {
    if (NGN.util.pathReadable(dir)) {
      return
    }

    if (NGN.util.pathReadable(require('path').join(dir, '..'))) {
      require('fs').mkdirSync(dir)
      return
    }

    this.mkdirp(require('path').join(dir, '..'))
    this.mkdirp(dir)
  }

  encrypt (data) {
    let cipher = require('crypto').createCipher('aes-256-cbc', this.munge)
    let encoded = cipher.update(data, 'utf8', 'hex')
    encoded += cipher.final('hex')
    return encoded
  }

  decrypt (data) {
    let cipher = require('crypto').createDecipher('aes-256-cbc', this.munge)
    let decoded = cipher.update(data, 'hex', 'utf8')
    decoded += cipher.final('utf8')
    return decoded
  }

  lock () {
    require('fs').writeFileSync(this.proxy.lockfile, process.pid, {
      encoding: 'utf8'
    })
  }

  unlock () {
    require('fs').unlinkSync(this.proxy.lockfile)
  }

  /**
   * @method save
   * Save data to the JSON file.
   * @param {function} [callback]
   * An optional callback executes after the save is complete. Receives no arguments.
   * @fires save
   * Fired after the save is complete.
   */
  save (callback) {
    if (this.proxy.locked) {
      throw new Error('Process ID ' + this.proxy.lockfilepid + ' has a lock on ' + this.dbfile + '. Cannot save.')
    }

    this.mkdirp(this.directory)

    let content = JSON.stringify({data: this.data})

    if (this.munge) {
      content = this.encrypt(content)
    }

    // Create a lock file
    this.lock()

    // Write contents to disk
    require('fs').writeFileSync(this.dbfile, content, {
      encoding: 'utf8'
    })

    // Unlock
    this.unlock()

    this.emit('save')
    if (callback && typeof callback === 'function') {
      callback()
    }
  }

  /**
   * @method fetch
   * Automatically populates the store/record with the full set of
   * data from the JSON file.
   * @param {function} [callback]
   * An optional callback executes after the fetch and parse is complete. Receives no arguments.
   * @fires fetch
   * Fired after the fetch and parse is complete.
   */
  fetch (callback) {
    if (!NGN.util.pathReadable(this.dbfile)) {
      // throw new Error(this.dbfile + ' does not exist or cannot be found.')
      if (this.type === 'model') {
        this.load({})
      } else {
        this.reload([])
      }

      this.emit('fetch')
      if (NGN.isFn(callback)) {
        callback()
      }

      return
    }

    let content

    try {
      content = require('fs').readFileSync(this.dbfile).toString()
    } catch (err) {
      throw err
    }

    if (content.trim().substr(0, 1) !== '{') {
      if (this.munge) {
        content = this.decrypt(content)
      } else {
        throw new Error('Unrecognized or encrypted format detected. If the file is encrypted, the proxy must have an encryptionKey configured..')
      }
    }

    if (typeof content !== 'object') {
      content = JSON.parse(content)
    }

    if (this.type === 'model') {
      this.load(content.data)
    } else {
      this.reload(content.data)
    }

    content = null // Garbage collect immediately

    this.emit('fetch')
    callback && callback()
  }

  /**
   * @method enableLiveSync
   * Live synchronization monitors the dataset for changes and immediately
   * commits them to the data storage system.
   * @fires live.create
   * Triggered when a new record is persisted to the data store.
   * @fires live.update
   * Triggered when a record modification is persisted to the data store.
   * @fires live.delete
   * Triggered when a record is removed from the data store.
   */
  enableLiveSync () {
    if (this.type === 'model') {
      this.on('field.create', () => {
        this.save(() => {
          this.emit('live.create')
        })
      })

      this.on('field.update', () => {
        this.save(() => {
          this.emit('live.update')
        })
      })

      this.on('field.remove', () => {
        this.save(() => {
          this.emit('live.delete')
        })
      })

      // relationship.create is unncessary because no data is available
      // when a relationship is created. All related data will trigger a
      // `field.update` event.
      this.on('relationship.remove', () => {
        this.save(() => {
          this.emit('live.delete')
        })
      })
    } else {
      // Persist new records
      this.on('record.create', (record) => {
        this.save(() => {
          this.emit('live.create', record)
        })
      })

      // Update existing records
      this.on('record.update', (record, change) => {
        this.save(() => {
          this.emit('live.update', record)
        })
      })

      // Remove old records
      this.on('record.delete', (record) => {
        this.save(() => {
          this.emit('live.delete', record)
        })
      })

      this.on('clear', () => {
        this.save(() => {
          this.emit('live.delete')
        })
      })
    }
  }
}

global.NGNX = NGN.coalesce(global.NGNX, {DATA: {}})
global.NGNX.DATA = NGN.coalesce(global.NGNX.DATA, {})
Object.defineProperty(global.NGNX.DATA, 'JsonFileProxy', NGN.const(JsonFileProxy))
