'use strict'
require('ngnx-data-proxy-file')

/**
 * @class NGNX.DATA.JsonFileProxy
 * Persist NGN DATA stores using a JSON file.
 */
class JsonFileProxy extends NGNX.DATA.FileProxy {
  constructor (config) {
    super(config)
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
    if (!this.presave()) {
      return
    }

    let content = JSON.stringify({data: this.store.data})

    this.writeToDisk(content)
    this.postsave(callback)
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
    let content = this.readFromDisk()

    if (content === null || content.trim().length === 0) {
      if (this.type === 'model') {
        this.store.load({})
      } else {
        this.store.reload([])
      }

      this.postfetch(callback)

      return
    }

    if (typeof content !== 'object') {
      content = JSON.parse(content)
    }

    if (this.type === 'model') {
      this.store.load(content.data)
    } else {
      this.store.reload(content.data)
    }

    this.postfetch(callback, content)
  }
}

global.NGNX = NGN.coalesce(global.NGNX, {DATA: {}})
global.NGNX.DATA = NGN.coalesce(global.NGNX.DATA, {})
Object.defineProperty(global.NGNX.DATA, 'JsonFileProxy', NGN.const(JsonFileProxy))
