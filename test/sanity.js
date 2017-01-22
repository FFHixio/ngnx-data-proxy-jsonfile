'use strict'

let test = require('tape')
let fse = require('fs-extra')
let path = require('path')
let TaskRunner = require('shortbus')

require('ngn')
require('ngn-data')
require('../')

let root = require('path').join(__dirname, './data/db.json')

fse.emptyDirSync(path.dirname(root))

let meta = function () {
  return {
    idAttribute: 'testid',
    fields: {
      firstname: null,
      lastname: null,
      val: {
        min: 10,
        max: 20,
        default: 15
      }
    }
  }
}

let createPetSet = function () {
  let Pet = new NGN.DATA.Model({
    fields: {
      name: null,
      breed: null
    }
  })

  let m = meta()

  m.relationships = {
    pet: Pet
  }

  let NewModel = new NGN.DATA.Model(m)
  let dataset = new NGN.DATA.Store({
    model: NewModel,
    proxy: new NGNX.DATA.JsonFileProxy(root)
  })

  dataset.add({
    firstname: 'The',
    lastname: 'Doctor',
    pet: {
      name: 'K-9',
      breed: 'Robodog'
    }
  })

  dataset.add({
    firstname: 'The',
    lastname: 'Master',
    pet: {
      name: 'Drums',
      breed: '?'
    }
  })

  return dataset
}

test('Primary Namespace', function (t) {
  t.ok(NGNX.DATA.JsonFileProxy !== undefined, 'NGNX.DATA.JsonFileProxy is defined globally.')
  t.end()
})

test('Self Inspection', function (t) {
  let m = meta()
  let NewModel = new NGN.DATA.Model(m)
  let dataset = new NGN.DATA.Store({
    model: NewModel,
    proxy: new NGNX.DATA.JsonFileProxy(root)
  })

  t.ok(dataset.proxy.type === 'store', 'Recognized store.')

  m.proxy = new NGNX.DATA.JsonFileProxy(root)

  let TestRecord = new NGN.DATA.Model(m)
  let rec = new TestRecord({
    firstname: 'The',
    lastname: 'Doctor'
  })

  t.ok(rec.proxy.type === 'model', 'Recognized model.')
  t.end()
})

test('Cryptography for Data at Rest', function (t) {
  let m = meta()
  m.proxy = new NGNX.DATA.JsonFileProxy({
    directory: root,
    encryptionKey: 't3stK3y'
  })

  let NewModel = new NGN.DATA.Model(m)

  let record = new NewModel({
    firstname: 'The',
    lastname: 'Doctor'
  })

  let hash = record.proxy.encrypt(JSON.stringify(record.data))
  t.ok(hash !== null && hash !== undefined, 'Content successfully encrypted.')

  let out = record.proxy.decrypt(hash)
  t.ok(typeof JSON.parse(out) === 'object', 'Decrypted to object.')
  t.ok(JSON.parse(out).lastname === 'Doctor', 'Decrypted data matches unencrypted data.')

  t.end()
})

test('Basic Save & Fetch (Data Model)', function (t) {
  fse.emptyDirSync(path.dirname(root))

  let Pet = new NGN.DATA.Model({
    fields: {
      name: null,
      breed: null
    }
  })

  let m = meta()

  m.relationships = {
    pet: Pet
  }

  m.proxy = new NGNX.DATA.JsonFileProxy(root)

  let DataRecord = new NGN.DATA.Model(m)
  let record = new DataRecord({
    firstname: 'The',
    lastname: 'Doctor',
    pet: {
      name: 'K-9',
      breed: 'Robodog'
    }
  })

  record.once('field.update', function (change) {
    record.save(() => {
      t.pass('Save method applies callback.')
      t.ok(NGN.util.pathReadable(root), 'File created on save.')

      record.setSilent('lastname', 'Master')

      t.ok(record.lastname === 'Master', 'Changes apply normally.')

      record.fetch(() => {
        t.pass('Fetch method applies callback.')
        t.ok(record.lastname === 'Doctor', 'Data accurately loaded from disk.')
        t.ok(record.pet.name === 'K-9', 'Properly retrieved nested model data.')

        fse.emptyDirSync(path.dirname(root))
        t.end()
      })
    })
  })

  record.firstname = 'Da'
})

test('Basic Save & Fetch (Data Store)', function (t) {
  let ds = createPetSet()

  ds.once('record.update', function (record, change) {
    ds.save(() => {
      t.pass('Save method applies callback.')

      ds.fetch(() => {
        t.pass('Fetch method applies callback.')
        t.ok(ds.first.lastname === 'Doctor' &&
          ds.last.lastname === 'Master' &&
          ds.last.firstname === 'Da' &&
          ds.first.pet.name === 'K-9',
        'Successfully retrieved modified results.')

        fse.emptyDirSync(path.dirname(root))
        t.end()
      })
    })
  })

  ds.last.firstname = 'Da'
})

test('Store Array Values', function (t) {
  fse.emptyDirSync(path.dirname(root))

  let Model = new NGN.DATA.Model({
    fields: {
      a: Array
    },
    proxy: new NGNX.DATA.JsonFileProxy(root)
  })

  let record = new Model({
    a: ['a', 'b', 'c', {d: true}]
  })

  record.save(() => {
    t.pass('Saved array data.')
    record.a = []

    record.fetch(() => {
      t.pass('Retrieved array data.')

      t.ok(Array.isArray(record.a), 'Record returned in array format.')
      t.ok(typeof record.a.pop() === 'object' && record.a[0] === 'a', 'Array data is in correct format.')

      fse.emptyDirSync(path.dirname(root))

      t.end()
    })
  })
})

test('Non-String Primitive Data Types', function (t) {
  fse.emptyDirSync(path.dirname(root))

  let Model = new NGN.DATA.Model({
    fields: {
      b: Boolean,
      n: Number,
      nil: null,
      o: Object
    },
    proxy: new NGNX.DATA.JsonFileProxy(root)
  })

  let record = new Model({
    b: false,
    n: 3,
    o: {
      some: 'value'
    }
  })

  record.save(() => {
    record.b = true

    record.fetch(() => {
      t.ok(record.b === false, 'Boolean supported.')
      t.ok(record.n === 3, 'Number supported.')
      t.ok(record.nil === null, 'Null supported.')
      t.ok(record.o.some === 'value', 'Object/JSON supported for models.')
      fse.emptyDirSync(path.dirname(root))
      t.end()
    })
  })
})

test('Live Sync Model', function (t) {
  let Pet = new NGN.DATA.Model({
    fields: {
      name: null,
      breed: null
    }
  })

  let m = meta()

  m.relationships = {
    pet: Pet
  }

  m.proxy = new NGNX.DATA.JsonFileProxy(root)

  let TempDataRecord = new NGN.DATA.Model(m)
  let record = new TempDataRecord({
    firstname: 'The',
    lastname: 'Doctor',
    pet: {
      name: 'K-9',
      breed: 'Robodog'
    }
  })

  record.save(() => {
    record.enableLiveSync()

    let tasks = new TaskRunner()

    tasks.add((next) => {
      record.once('live.update', () => {
        t.pass('live.update method detected.')
        record.setSilent('firstname', 'Bubba')

        record.fetch(() => {
          t.ok(record.firstname === 'Da', 'Persisted correct value.')
          next()
        })
      })

      record.firstname = 'Da'
    })

    tasks.add((next) => {
      record.once('live.create', () => {
        t.pass('live.create triggered on new field creation.')
        record.fetch(() => {
          t.ok(record.hasOwnProperty('middlename') && record.middlename === 'Alonsi', 'Field creation persisted on the fly.')
          next()
        })
      })

      record.addField('middlename', {
        type: String,
        default: 'Alonsi',
        required: true
      })
    })

    tasks.add((next) => {
      record.once('live.delete', () => {
        t.pass('live.delete triggered on new field creation.')
        t.ok(!record.hasOwnProperty('middlename'), 'Field deletion persisted on the fly.')
        next()
      })

      record.removeField('middlename')
    })

    tasks.add((next) => {
      record.once('live.update', () => {
        t.pass('live.update triggered when new relationship is available.')

        record.vehicle.setSilent('type', 'other')

        record.fetch(() => {
          t.ok(record.vehicle.type === 'Tardis', 'Proper value persisted in nested model.')
          next()
        })
      })

      let Vehicle = new NGN.DATA.Model({
        fields: {
          type: null,
          doors: Number
        }
      })

      record.on('relationship.create', () => {
        record.vehicle.type = 'Tardis'
      })

      record.addRelationshipField('vehicle', Vehicle)
    })

    tasks.on('complete', () => {
      fse.emptyDirSync(path.dirname(root))
      t.end()
    })

    tasks.run(true)
  })
})

test('Live Sync Store', function (t) {
  fse.emptyDirSync(path.dirname(root))

  let Person = new NGN.DATA.Model({
    fields: {
      firstname: null,
      lastname: null
    }
  })

  let People = new NGN.DATA.Store({
    model: Person,
    proxy: new NGNX.DATA.JsonFileProxy(root)
  })

  People.enableLiveSync()

  let tasks = new TaskRunner()

  tasks.add((next) => {
    People.once('live.create', (record) => {
      let data = JSON.parse(require('fs').readFileSync(root).toString())
      t.ok(data.data[0].firstname === 'The' && data.data[0].lastname === 'Doctor', 'Correct values stored for first record.')

      next()
    })

    People.add({
      firstname: 'The',
      lastname: 'Doctor'
    })
  })

  tasks.add((next) => {
    People.once('live.create', (record) => {
      let data = JSON.parse(require('fs').readFileSync(root).toString())
      t.ok(data.data[1].firstname === 'The' && data.data[1].lastname === 'Master', 'Correct values stored for multiple records.')

      next()
    })

    People.add({
      firstname: 'The',
      lastname: 'Master'
    })
  })

  tasks.add((next) => {
    People.once('live.update', (record) => {
      let data = JSON.parse(require('fs').readFileSync(root).toString())
      t.ok(data.data[1].firstname === 'Da' && data.data[1].lastname === 'Master', 'Correct record and value written during update.')

      next()
    })

    People.last.firstname = 'Da'
  })

  tasks.add((next) => {
    People.once('live.delete', (record) => {
      let data = JSON.parse(require('fs').readFileSync(root).toString())
      t.ok(data.data.length === 1, 'Deleted record does not exist on disk.')

      next()
    })

    People.remove(People.first)
  })

  tasks.add((next) => {
    People.on('live.delete', () => {
      let data = JSON.parse(require('fs').readFileSync(root).toString())
      t.ok(data.data.length === 0, 'Deleted records do not exist on disk.')

      next()
    })

    People.clear()
  })

  tasks.on('complete', () => {
    t.end()
  })

  tasks.run(true)
})
