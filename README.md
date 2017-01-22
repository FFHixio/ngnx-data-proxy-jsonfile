# NGNX.DATA.JsonFileProxy

`npm i ngnx-data-proxy-jsonfile`

```js
require('ngnx-data-proxy-jsonfile')

const Person = new NGN.DATA.Model({
  fields: {
    firstname: null,
    lastname: null
  },

  proxy: new NGNX.DATA.JsonFileProxy('./mydb.json')
})
```

The JSON file proxy is used to perform CRUD operations from an NGN.DATA.Store and/or
NGN.DATA.Model.  
