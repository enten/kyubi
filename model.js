const _ = require('lodash')
const AQB = require('aqb')
const MQB = require('./mqb')
const inflect = require('i')()
const joi = require('joi')

const {
  ArangoError,
  aql: AQL,
  db,
  errors,
  printObject
} = require('@arangodb')

const DOCUMENT_COLLECTION_TYPE = 2
const EDGE_COLLECTION_TYPE = 3

const COLLECTION_TYPES = {
  [DOCUMENT_COLLECTION_TYPE]: 'document',
  [EDGE_COLLECTION_TYPE]: 'edge'
}

const CRUD_OPTIONS_KEYS = [
  'force',
  'keepNull',
  'mergeObjects',
  'overwrite',
  'returnNew',
  'returnOld',
  'safe',
  'silent',
  'waitForSync'
]

const INTERNAL_ATTRIBUTES = [
  '_key',
  '_id',
  '_rev',
]

const SPECIAL_ATTRIBUTES = INTERNAL_ATTRIBUTES.concat([
  '_oldRev'
])

const INTERNAL_ATTRIBUTES_AQB = AQB(INTERNAL_ATTRIBUTES)
const SPECIAL_ATTRIBUTES_AQB = AQB(SPECIAL_ATTRIBUTES)

const RELATION_ONE_TO_ONE = 'oneToOne'
const RELATION_ONE_TO_MANY = 'oneToMany'
const RELATION_MANY_TO_MANY = 'manyToMany'

const RELATION_TYPES = {
  [RELATION_ONE_TO_ONE]: RELATION_ONE_TO_ONE,
  '1': RELATION_ONE_TO_ONE,
  '1-1': RELATION_ONE_TO_ONE,
  [RELATION_ONE_TO_MANY]: RELATION_ONE_TO_MANY,
  '1-*': RELATION_ONE_TO_MANY,
  '1-N': RELATION_ONE_TO_MANY,
  '1-n': RELATION_ONE_TO_MANY,
  [RELATION_MANY_TO_MANY]: RELATION_MANY_TO_MANY,
  '*-*': RELATION_MANY_TO_MANY,
  'N-N': RELATION_MANY_TO_MANY,
  'n-n': RELATION_MANY_TO_MANY
}

class Model {
  /** @final */
  static get Document () {
    return this
  }

  /** @final */
  static get DocumentModel () {
    return this
  }

  /** @final */
  static get Edge () {
    return EdgeModel
  }

  /** @final */
  static get EdgeModel () {
    return EdgeModel
  }

  /** @final */
  static get Model () {
    return this
  }

  /** @final */
  static get _model () {
    return true
  }

  /** @overridable */
  static get allowUnknown () {
    return true
  }

  /** @final */
  static get aqb () {
    return AQB
  }

  /** @final */
  static get aql () {
    return AQL
  }

  /** @overridable */
  static get archiveTimestamp () {
    return 'archivedAt'
  }

  /** @final */
  static get collection () {
    return lazyProperty(this, '_collection', getCollection)
  }

  /** @overridable */
  static get collectionName () {
    return lazyProperty(this, '_collectionName', getCollectionName)
  }

  /** @final */
  static get db () {
    if (!this._db) {
      throw new Error(`Model "${this.name}" isn't bootstrapped yet`)
    }

    return this._db
  }

  /** @overridable */
  static get documentName () {
    return lazyProperty(this, '_documentName', getDocumentName)
  }

  /** @overridable */
  static get documentsName () {
    return lazyProperty(this, '_documentsName', getDocumentsName)
  }

  /** @overridable */
  static get computed () {
    return null
  }

  /** @overridable */
  static get createTimestamp () {
    return 'createdAt'
  }

  /** @overridable */
  static get defaultDocument () {
    return null
  }

  /** @overridable */
  static get deleteTimestamp () {
    return 'deletedAt'
  }

  /** @overridable */
  static get hidden () {
    return null
  }

  /** @final */
  static get indexes () {
    return this.collection.getIndexes()
  }

  /** @final */
  static get metaAttributes () {
    return lazyProperty(this, '_metaAttributes', getMetaAttributes)
  }

  /** @final */
  static get metaSpecials () {
    return lazyProperty(this, '_metaSpecials', getMetaSpecialAttributes)
  }

  /** @final */
  static get metaTimestamps () {
    return lazyProperty(this, '_metaTimestamps', getMetaTimestampAttributes)
  }

  /** @final */
  static get modelName () {
    return lazyProperty(this, '_modelName', getModelName)
  }

  /** @final */
  static get modelTimestamps () {
    return lazyProperty(this, '_modelTimestamps', getModelTimestampAttributes)
  }

  /** @final */
  static get mqb () {
    return lazyProperty(this, '_mqb', getModelQueryBuilder)
  }

  /** @final */
  static get partition () {
    return null
  }

  /** @overridable */
  static get partitionArchived () {
    return 'archived'
  }

  /** @final */
  static get partitionName () {
    return null
  }

  /** @final */
  static get partitionTimestamp () {
    return null
  }

  /** @overridable */
  static get partitionTrashed () {
    return 'trashed'
  }

  /** @overridable */
  static get partitions () {
    return null
  }

  /** @final */
  static get partitionsModels () {
    return this._partitionsModels
  }

  /** @overridable */
  static get pageSize () {
    return null
  }

  /** @overridable */
  static get recoverTimestamp () {
    return 'recoveredAt'
  }

  /** @overridable */
  static get relations () {
    return null
  }

  /** @final */
  static get relationsKeys () {
    return lazyProperty(this, '_relationsKeys', getRelationsKeys)
  }

  /** @final */
  static get relationsPlans () {
    return lazyProperty(this, '_relationsPlans', getRelationsPlans)
  }

  /** @overridable */
  static get queryScopes () {
    return null
  }

  /** @final */
  static get sortBy () {
    return this.createTimestamp || '_key'
  }

  /** @final */
  static get schema () {
    return lazyProperty(this, '_schema', getSchema)
  }

  /** @overridable */
  static get timestamps () {
    return null
  }

  /** @final */
  static get type () {
    return lazyProperty(this, '_type', getCollectionType)
  }

  /** @final */
  static get typeDocument () {
    return lazyProperty(this, '_typeDocument', isDocumentModel)
  }

  /** @final */
  static get typeEdge () {
    return lazyProperty(this, '_typeEdge', isEdgeModel)
  }

  /** @final */
  static get typeName () {
    return COLLECTION_TYPES[this.type]
  }

  /** @overridable */
  static get updateTimestamp () {
    return 'updatedAt'
  }

  // static get uniques () {
  //   return null
  // }

  /** @overridable */
  static get visible () {
    return null
  }

  static all () {
    return this.mqbAll.apply(this, arguments)
      .fetch()
  }

  static any () {
    return this.mqbAny.apply(this, arguments)
      .fetch()
  }

  static bootstrap (db) {
    return bootstrapModel(this, db)
  }

  static byExample () {
    return this.mqbByExample.apply(this, arguments)
      .fetch()
  }

  static castDocumentSelector (selector) {
    if (Array.isArray(selector)) {
      return selector.map((x) => this.castDocumentSelector(x))
    }

    if (typeof selector === 'object' && typeof selector._key === 'number') {
      selector._key = String(selector._key)
    }

    if (typeof selector === 'number') {
      return String(selector)
    }

    return selector
  }

  static castDocumentSelectorByExample (args) {
    args = _.isArguments(args) ? _.toArray(args) : [].concat(args || []);

    const opts = {};

    if (args.length) {
      if (args.length === 1) {
        if (!this.mqb.isOptionsObject(args[0])) {
          args[0] = {example: args[0]}
        }
        Object.assign(opts, args[0])
      } else if (typeof args[0] === 'string') {
        if (args.length % 2) {
          Object.assign(opts, args.pop());
        }
        opts.example = _.fromPairs(_.chunk(args, 2));
      } else {
        if (args.length > 1) {
          Object.assign(opts, args.pop());
        }
        opts.example = Object.assign.apply(null, [{}].concat(args))
      }
    }

    if (opts.example && typeof opts.example._key === 'number') {
      opts.example._key = String(opts.example._key)
    }

    return opts
  }

  static castQueryCursor (cursor, qb) {
    if (cursor && typeof cursor.next === 'function') {
      const next = cursor.next.bind(cursor)
      let first
      let last

      cursor.forEach = (cast, fn) => {
        if (typeof cast === 'function') {
          fn = cast
          cast = undefined
        }

        for (
          let i = 0;
          cursor.hasNext();
          fn(cursor.next(cast), i++, cursor)
        );
      }

      cursor.first = (cast) => {
        if (!first && cursor.hasNext()) {
          cursor.next(cast)
        }
        cursor.dispose()
        return first || null
      }

      cursor.last = (cast) => {
        for (; cursor.hasNext(); cursor.next(cast));
        cursor.dispose()
        return last || null
      }

      cursor.map = (cast, fn) => {
        if (typeof cast === 'function') {
          fn = cast
          cast = undefined
        }

        const result = []

        for (
          let i = 0;
          cursor.hasNext();
          result.push(fn(cursor.next(cast), i++, cursor))
        );

        return result
      }

      cursor.next = (cast) => {
        let doc = next()
        if (cast != null ? cast != false : (qb && qb.opts.cast != false)) {
          doc = this.castQueryResult(doc, qb)
        }
        if (!first) {
          first = doc
        }
        if (!last && !cursor.hasNext()) {
          last = doc
        }
        return doc
      }

      // TODO
      // cursor.recover
      // cursor.remove () { cursor.map((x) => x._remove())}
      // cursor.replace
      // cursor.update ({newValue}) { cursor.map((x) => x._remove())}
    }

    return cursor
  }

  static castQueryResult (result, qb) {
    if (!qb || qb.opts.cast != false) {
      if (Array.isArray(result)) {
        return result.map((x) => this.castQueryResult(x, qb))
      }

      if (result && !result._modelInstance && !result.error) {
        result = this.fromDb(result)
      }

      if (qb) {
        this.castQueryResultRelations(result, qb)
      }
    }

    return result
  }

  static castQueryResultRelations (data, qb) {
    const {cast, relations} = qb.opts

    if (relations) {
      Object.keys(relations).forEach((key) => {
        const relOpts = relations[key].opts

        if (data[key] && !relOpts.count && !relOpts.pair && !relOpts.pluck && (relOpts.cast ||( cast && relOpts.cast != false))) {
          const {target} = qb.model.relationsPlans[key]
          const inflateRelation = (values) => {
            if (values._edge) {
              const relPlans = qb.model.relationsPlans[key]
              const relPivotsLength = relPlans.pivots.length

              if (!relOpts.edges || !relOpts.edges[relPivotsLength - 1] || relOpts.edges[relPivotsLength - 1].opts.cast != false) {
                values._edge = new relPlans.pivot(values._edge)
              }
            }

            if (relOpts.relations) {
              values = this.castQueryResultRelations(values, relations[key])
            }

            return new target(values)
          }

          if (Array.isArray(data[key])) {
            data[key] = data[key].map((x) => inflateRelation(x))
          } else {
            data[key] = inflateRelation(data[key])
          }
        }
      })
    }

    return data
  }

  static clean (opts) {
    return this.removeByKeys(this.keys().toArray(), opts)
  }

  static closedRange () {
    return this.mqbClosedRange.apply(this, arguments)
      .fetch()
  }

  static count () {
    return this.mqbCount.apply(this, arguments)
      .fetch()
  }

  static create (data, opts) {
    return (new this(data))._save(opts)
  }

  static createMany (data, opts) {
    return _.castArray(data).map((x) => this.create(x, opts))
  }

  static define (schema) {
    return schema
  }

  static deserializeTimestamp (date) {
    if (~['number', 'string'].indexOf(typeof date)) {
      date = new Date(date)
    }

    return date
  }

  static deserializeTimestamps (data) {
    const out = data

    this.modelTimestamps.forEach((key) => {
      const timestamp = _.get(out, key)

      if (timestamp != null) {
        _.set(out, key, this.deserializeTimestamp(timestamp))
      }
    })

    return out
  }

  static doc () {
    return this.document.apply(this, arguments)
  }

  static document (selector) {
    if (Array.isArray(selector)) {
      return selector.map((x) => this.document(x))
    }

    selector = this.castDocumentSelector(selector)

    const result = this.collection.document(selector)
    const resultCasted = this.castQueryResult(result)

    return resultCasted
  }

  static documents (keys) {
    return this.document(_.castArray(keys))
  }

  // TODO using mqb ????
  static edges (data) {
    const result = this.collection.edges(data)
    const resultCasted = this.castQueryResult(result)

    return resultCasted
  }

  static exists (selector) {
    if (Array.isArray(selector)) {
      return selector.map((x) => this.exists(x))
    }

    selector = this.castDocumentSelector(selector)

    return this.collection.exists(selector)
  }

  static existsByExample () {
    return this.mqbExistsByExample.apply(this, arguments)
      .run()
      .toArray()
  }

  static existsFirstExample () {
    return this.mqbExistsFirstExample.apply(this, arguments)
      .run()
  }

  static find (selector) {
    return this.findOr(selector, null)
  }

  static findBy (example, opts) {
    if (typeof example === 'string') {
      example = {[example]: opts}
      opts = arguments[2]
    }

    return this.findByOr(example, null, opts)
  }

  static findByOr (example, orValue, opts) {
    if (typeof example === 'string') {
      example = {[example]: orValue}
      orValue = opts
      opts = arguments[3]
    }

    let result = this.firstExample(example, opts)

    if (!result) {
      const e = new ArangoError({
        errorNum: errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code,
        errorMessage: errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.message
      })

      result = typeof orValue === 'function' ? orValue(e, example) : orValue
    }

    return result
  }

  static findByOrCreate (example, doc) {
    return this.findByOr(example, () => this.create(doc))
  }

  static findByOrFail (example, error, opts) {
    if (typeof example === 'string') {
      example = {[example]: error}
      error = opts
      opts = arguments[3]
    }

    if (typeof error === 'object' && !(error instanceof Error)) {
      opts = error
      error = undefined
    }

    return this.findByOr(example, (e) => {throw (error || e)}, opts)
  }

  static findOr (selector, orValue) {
    let result

    try {
      result = this.document(selector)
    } catch (e) {
      if (arguments.length < 2 || e.errorNum !== errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code) {
        throw e
      }

      result = typeof orValue === 'function' ? orValue(e, selector) : orValue
    }

    return result
  }

  static findOrCreate (selector, doc) {
    return this.findOr(selector, () => this.create(doc))
  }

  static findOrFail (selector, error) {
    return this.findOr(selector, (e) => {throw (error || e)})
  }

  static fill (doc, data, dataValue, opts) {
    if (arguments.length > 2) {
      if (typeof data === 'string') {
        data = {[data]: dataValue}
      } else {
        opts = dataValue
        dataValue = undefined
      }
    }

    if (opts == false || (opts && opts.mutate == false)) {
      doc = new this(doc)
    }

    data = _.omit(data, this.metaSpecials)

    this.deserializeTimestamps(data)

    Object.assign(doc, data)

    return doc
  }

  static fillSpecials (doc, data, dataValue, opts) {
    if (arguments.length > 2) {
      if (typeof data === 'string') {
        data = {[data]: dataValue}
      } else {
        opts = dataValue
        dataValue = undefined
      }
    }

    if (opts == false || (opts && opts.mutate == false)) {
      doc = new this(doc)
    }

    data = _.pick(data, this.metaSpecials)

    Object.keys(data).forEach((key) => {
      Object.defineProperty(doc, key, {
        configurable: true,
        enumerable: true,
        value: data[key],
        writable: false
      })
    })

    return doc
  }

  static firstExample () {
    return this.mqbFirstExample.apply(this, arguments)
      .fetch()
  }

  static first () {
    return this.firstExample.apply(this, arguments)
  }

  static forClient (doc) {
    const format = lazyProperty(this, '_forClient', getFormatterForClient)

    return format(doc)
  }

  static forDb (data, opts = {}) {
    const out = Object.assign({}, data)

    if (opts.newDocument) {
      if (out._key === null) {
        delete out._key
      }
    } else {
      const rev = (opts.meta || data)._rev

      Object.assign(out, opts.meta, {_oldRev: rev})
    }

    // this.castDocumentSelector(out)

    return out
  }

  static forServer (doc) {
    const format = lazyProperty(this, '_forServer', getFormatterForServer)

    return format(doc)
  }

  static fromClient (obj) {
    // return new this(obj)
    return obj
  }

  static fromDb (data) {
    const out = new this(data)

    // this.deserializeTimestamps(out)

    return out
  }

  static ids () {
    return this.pluck.apply(this, ['_id'].concat(_.flattenDeep(arguments)))
  }

  // TODO using mqb ????
  static inEdges (data) {
    const result = this.collection.inEdges(data)
    const resultCasted = this.castQueryResult(result)

    return resultCasted
  }

  static index (id) {
    if (typeof id === 'number') {
      const indexes = this.indexes

      if (indexes[id]) {
        id = indexes[id].id
      }
    }

    return this.collection.index(id)
  }

  static insert () {
    return this.save.apply(this, arguments)
  }

  static insertOr (fn, data, opts) {
    if (Array.isArray(data)) {
      return data.map((x) => this.insertOr(fn, x, opts))
    }

    const id = data._key || data._id
    let meta = id && this.exists(id)
    let result

    if (!meta) {
      result = this.save(data, opts)
    } else {
      opts = Object.assign({}, opts, {meta})
      result = fn.call(this, data, opts)
    }

    return result
  }

  static insertOrReplace (data, opts) {
    return this.insertOr(this.replace, data, opts)
  }

  static insertOrUpdate (data, opts) {
    return this.insertOr(this.update, data, opts)
  }

  static isDocumentModel (obj) {
    return this.isModel(obj) && isDocumentModel(obj)
  }

  static isEdgeModel (obj) {
    return this.isModel(obj) && isEdgeModel(obj)
  }

  static isInheritedModel (obj) {
    return !!obj && obj.prototype instanceof this
  }

  static isInstance (obj) {
    return !!obj && obj instanceof this
  }

  static isModel (obj) {
    return !!obj && obj.prototype instanceof Model 
  }

  static iterate (...args) {
    const iterator = args.pop()

    const opts = this.castDocumentSelectorByExample(args)
    const query = this.mqbByExample.apply(this, args)

    return query.iterate(iterator)
  }

  static keys () {
    return this.pluck.apply(this, ['_key'].concat(_.flattenDeep(arguments)))
  }

  static lastExample () {
    return this.mqbLastExample.apply(this, arguments)
      .fetch()
  }

  static last () {
    return this.lastExample.apply(this, arguments)
  }

  static mqbAll () {
    const opts = this.castDocumentSelectorByExample(arguments)
    let query = this.mqb(opts, [
      'count',
      'first',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse',
      'pluck'
    ])

    return query
  }

  static mqbAny () {
    const opts = this.castDocumentSelectorByExample(arguments)
    let query = this.mqb(opts, [
      'count',
      'distinct',
      'first',
      'inverse',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse',
      'sort',
      'sortRand'
    ])

    return query
      .first(true)
      .sortRand(true)
  }

  static mqbByExample () {
    const opts = this.castDocumentSelectorByExample(arguments)
    const query = this.mqb(opts, [
      'count',
      'first',
      'last',
    ])

    return query
  }

  static mqbClosedRange (attr, left, right, ...args) {
    const query = this.mqbByExample.apply(this, args)

    return query
      .filter(attr, '>=', left, '&&', attr, '<=', right)
  }

  static mqbCount () {
    const opts = this.castDocumentSelectorByExample(arguments)
    const query = this.mqb(opts, [
      'cast',
      'count',
      'first',
      'inverse',
      'keep',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse',
      'pluck',
      'sort',
      'sortRand'
    ])

    return query
      .cast(false)
      .count(true)
  }

  static mqbExistsByExample () {
    return this.mqbByExample.apply(this, arguments)
      .cast(false)
      .limit(false)
      .keep(false)
      .keep(INTERNAL_ATTRIBUTES_AQB)
  }

  static mqbExistsFirstExample () {
    return this.mqbExistsByExample.apply(this, arguments)
      .first()
  }

  static mqbFirstExample () {
    const opts = this.castDocumentSelectorByExample(arguments)
    const query = this.mqb(opts, [
      'count',
      'first',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse',
      'sortRand'
    ])

    return query
      .first(true)
  }

  static mqbLastExample () {
    const opts = this.castDocumentSelectorByExample(arguments)
    const query = this.mqb(opts, [
      'count',
      'first',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse',
      'sortRand'
    ])

    return query
      .last(true)
  }

  static mqbPaginate (page, perPage, ...args) {
    if (typeof perPage !== 'number') {
      args.unshift(perPage)
      perPage = undefined
    }

    if (typeof page !== 'number') {
      args.unshift(page)
      page = undefined
    }

    const opts = this.castDocumentSelectorByExample(args)
    const query = this.mqb(opts, [
      'count',
      'first',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse'
    ])

    return query
      .page(page, perPage)
  }

  static mqbPair (left, right, ...args) {
    const opts = this.castDocumentSelectorByExample(args)
    const query = this.mqb(opts, [
      'cast',
      'count',
      'keep',
      'pluck'
    ])

    return query
      .cast(false)
      .pair(left, right)
  }

  static mqbPick (limit, ...args) {
    if (typeof limit !== 'number') {
      args.unshift(limit)
      limit = undefined
    }

    limit = limit || 1

    const opts = this.castDocumentSelectorByExample(args)
    const query = this.mqb(opts, [
      'count',
      'first',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse'
    ])

    return query
      .limit(limit)
  }

  static mqbPickInverse (limit, ...args) {
    if (typeof limit !== 'number') {
      args.unshift(limit)
      limit = undefined
    }

    limit = limit || 1

    const opts = this.castDocumentSelectorByExample(args)
    const query = this.mqb(opts, [
      'count',
      'first',
      // 'inverse',
      'limit',
      'last',
      'page',
      'pick',
      'pickInverse'
    ])

    return query
      .inverse(opts.inverse == null || opts.inverse == false)
      .limit(limit)
  }

  static mqbPluck (key, ...args) {
    const opts = this.castDocumentSelectorByExample(args)
    const query = this.mqb(opts, [
      'cast',
      'count',
      'keep',
      'last',
      'pluck'
    ])

    return query
      .cast(false)
      .pluck(key)
  }

  static mqbRange (attr, left, right, ...args) {
    const query = this.mqbByExample.apply(this, args)

    return query
      .filter(attr, '>=', left, '&&', attr, '<', right)
  }

  // TODO using mqb ????
  static outEdges (data) {
    const result = this.collection.outEdges(data)
    const resultCasted = this.castQueryResult(result)

    return resultCasted
  }

  static paginate () {
    return this.mqbPaginate.apply(this, arguments)
      .fetch()
  }

  static pair () {
    return this.mqbPair.apply(this, arguments)
      .fetch()
  }

  static pick () {
    return this.mqbPick.apply(this, arguments)
      .fetch()
  }

  static pickInverse () {
    return this.mqbPickInverse.apply(this, arguments)
      .fetch()
  }

  static pluck () {
    return this.mqbPluck.apply(this, arguments)
      .fetch()
  }

  static new (data) {
    return new this(data)
  }

  static query (...args) {
    let queryBindVars = args[1]
    let queryString

    if (typeof args[0] === 'string') {
      queryString = args[0]
    }

    if (!queryString && args[0] && args[0].toAQL) {
      queryString = args[0].toAQL()
    }

    if (!queryString && args[0] && args[0].query) {
      queryBindVars = args[0].bindVars
      queryString = args[0].query
    }

    if (queryString) {
      console.debug('query:', queryString)
      queryBindVars && console.debug('  `--  ', queryBindVars)
    }

    return this.db._query.apply(this.db, args)
  }

  static range () {
    return this.mqbRange.apply(this, arguments)
      .fetch()
  }

  static moveInto (partitionModel, doc, opts = {}) {
    if (Array.isArray(doc)) {
      return doc.map((x) => this.moveInto(partitionModel, x, opts))
    }

    if (typeof partitionModel === 'string') {
      partitionModel = this.partitionsModels[partitionModel]
    }

    const model = this

    if (typeof doc === 'number' || !doc._modelInstance) {
      doc = model.document(doc)
    }

    const id = doc._key || doc._id

    if (!id) {
      throw new Error(`Cannot move document without _key or _id (from ${model.partition || 'main'} into ${partitionKey}`)
    }

    if (opts.mutate == false) {
      doc = new partitionModel(doc)
    }

    if (model.partitionTimestamp) {
      _.set(doc, model.partitionTimestamp, null)
    }

    const now = Date.now()

    if (partitionModel.partitionTimestamp) {
      _.set(doc, partitionModel.partitionTimestamp, new Date(now))
    }

    if (model.updateTimestamp) {
      _.set(doc, model.updateTimestamp, new Date(now))
    }

    let partitionInstance
    let meta

    partitionInstance = partitionModel.create(doc, opts)

    meta = model.collection.remove(id, opts)

    if (opts.mutate == false) {
      doc = partitionInstance
    } else {
      model.fill(doc, partitionInstance)
      model.fillSpecials(doc, partitionInstance)

      if (model.partition && doc['_' + model.partition]) {
        Object.defineProperty(doc, '_' + model.partition, {
          configurable: true,
          enumerable: false,
          value: false,
          writable: false
        })
      }

      if (partitionModel.partition && !doc['_' + partitionModel.partition]) {
        Object.defineProperty(doc, '_' + partitionModel.partition, {
          configurable: true,
          enumerable: false,
          value: true,
          writable: false
        })
      }
    }

    if (meta.new) {
      Object.defineProperty(doc, 'new', {
        configurable: true,
        enumerable: false,
        value: meta.new,
        writable: false
      })
    }

    return doc
  }

  static remove (doc, opts = {}) {
    if (opts.safe != false && !opts.force && this.partitionTrashed) {
      return this.moveInto(this.partitionTrashed, doc, opts)
    }

    if (Array.isArray(doc)) {
      return doc.map((x) => this.remove(x, opts))
    }

    if (typeof doc === 'number' || !doc._modelInstance) {
      doc = this.document(doc)
    }

    const id = doc._key || doc._id

    if (!id) {
      throw new Error('Cannot remove document without _key or _id')
    }

    if (opts.mutate == false) {
      doc = new this(doc)
    }

    const now = Date.now()

    if (this.deleteTimestamp) {
      _.set(doc, this.deleteTimestamp, new Date(now))
    }

    if (this.updateTimestamp) {
      _.set(doc, this.updateTimestamp, new Date(now))
    }

    let meta

    meta = this.collection.remove(id, opts)

    if (this.partitionTrashed && !doc['_' + this.partitionTrashed]) {
      Object.defineProperty(doc, '_' + this.partitionTrashed, {
        configurable: true,
        enumerable: false,
        value: true,
        writable: false
      })
    }

    if (meta.old) {
      Object.defineProperty(doc, 'old', {
        configurable: true,
        enumerable: false,
        value: meta.old,
        writable: false
      })
    }

    return doc
  }

  static removeByExample (example, opts) {
    const removeOpts = _.pick(opts, CRUD_OPTIONS_KEYS)

    return this.mqbByExample(example, opts)
      .cast(false)
      .iterate((doc) => this.remove(doc, removeOpts))
  }

  static removeByKeys (keys, opts) {
    return this.remove(_.castArray(keys), opts)
  }

  static removeFirstExample (example, opts) {
    const doc = this.mqbFirstExample(example, opts)
      .cast(false)
      .fetch()

    if (!doc) {
      return null
    }

    return this.remove(doc, _.pick(opts, CRUD_OPTIONS_KEYS))
  }

  static replace (data, opts) {
    opts = Object.assign({}, opts, {replace: true})

    return this.update(data, opts)
  }

  static replaceByExample (example, newValue, opts) {
    opts = Object.assign({}, opts, {replace: true})

    return this.updateByExample(example, newValue, opts)
  }

  static replaceFirstExample (example, newValue, opts) {
    opts = Object.assign({}, opts, {replace: true})

    return this.updateFirstExample(example, newValue, opts)
  }

  static save (doc, opts = {}) {
    if (Array.isArray(doc)) {
      return doc.map((x) => this.save(x, opts))
    }

    if (!doc._modelInstance || opts.mutate == false) {
      doc = new this(doc)
    }

    if (this.createTimestamp && !_.get(doc, this.createTimestamp)) {
      _.set(doc, this.createTimestamp, new Date())
    }

    const data = this.forDb(doc, {newDocument: true})
    let meta

    // if (this.uniques) {
    //   const uniques = [].concat(this.uniques || [])
    //   const filter = uniques.reduce((acc, key) => Object.assign(acc, {key: data[key]}), {})
    //   const existentEntry = this.collection.firstExample(filter)

    //   if (existentEntry) {
    //     throw new Error('CUSTOM_UNIQUE_CONSTAINT_VIOLATED')
    //   }
    // }

    meta = this.collection.save(data, opts)

    this.fillSpecials(doc, meta)

    if (meta.new) {
      Object.defineProperty(doc, 'new', {
        configurable: true,
        enumerable: false,
        value: meta.new,
        writable: false
      })
    }

    return doc
  }

  static serializeTimestamp (date) {
    if (typeof date === 'number') {
      date = new Date(out[key])
    }

    if (date instanceof Date && !isNaN(date.getTime())) {
      date = JSON.parse(JSON.stringify(date))
    }

    return date
  }

  static serializeTimestamps (data) {
    const out = data

    this.modelTimestamps.forEach((key) => {
      const timestamp = _.get(out, key)

      if (timestamp != null) {
        _.set(out, key, this.serializeTimestamp(timestamp))
      }
    })

    return out
  }

  static update (doc, opts = {}) {
    if (Array.isArray(doc)) {
      return doc.map((x) => this.update(x, opts))
    }

    let data = doc
    let meta = opts.meta || this.exists(data)

    if (!doc._modelInstance) {
      doc = opts.replace ? new this(data) : this.document(data)._fill(data)
    }

    this.fillSpecials(doc, meta)

    const id = doc._key || doc._id

    if (!id) {
      throw new Error('Cannot replace/update document without _key or _id')
    }

    if (opts.mutate == false) {
      doc = new this(doc)
    }

    if (this.updateTimestamp) {
      _.set(doc, this.updateTimestamp, new Date())
    }

    data = this.forDb(doc)

    if (opts.replace) {
      meta = this.collection.replace(id, data, opts)
    } else {
      meta = this.collection.update(id, data, opts)
    }

    // this.fill(doc, data)
    this.fillSpecials(doc, meta)

    if (meta.new) {
      Object.defineProperty(doc, 'new', {
        configurable: true,
        enumerable: false,
        value: meta.new,
        writable: false
      })
    }

    if (meta.old) {
      Object.defineProperty(doc, 'old', {
        configurable: true,
        enumerable: false,
        value: meta.old,
        writable: false
      })
    }

    return doc
  }

  static updateByExample (example, newValue, opts = {}) {
    return this.mqbByExample(example)
      .cast(false)
      .iterate((doc) => {
        if (opts.replace) {
          doc = Object.assign({}, newValue, {_key: doc._key})
        } else {
          doc = Object.assign({}, doc, newValue)
        }

        return this.update(doc, opts)
      })
  }

  static updateFirstExample (example, newValue, opts = {}) {
    let doc = this.mqbByExample(example)
      .cast(false)
      .first()
      .fetch()

    if (!doc) {
      return null
    }

    if (opts.replace) {
      doc = Object.assign({}, newValue, {_key: doc._key})
    } else {
      doc = Object.assign({}, doc, newValue)
    }

    return this.update(doc, opts)
  }

  static _PRINT (context) {
    context.output += `[Model "${this.modelName}" (collection: ${this.collectionName})]`
  }

  constructor (data) {
    this.constructor.fillSpecials(this, {
      _id: null,
      _key: null,
      _rev: null,
      _oldRev: null
    }, true)

    if (this.constructor.defaultDocument) {
      Object.assign(this, this.constructor.defaultDocument)
    }

    if (data) {
      this.constructor.fillSpecials(this, data)
      this.constructor.fill(this, data)
    }
  }

  get _collection () {
    return this.constructor.collection
  }

  get _modelInstance () {
    return true
  }

  _edges () {
    return this.constructor.edges(this)
  }

  _exists () {
    return this._key || this._id ? this.constructor.exists(this) : false
  }

  _fill (...args) {
    return this.constructor.fill.apply(this.constructor, [this].concat(args))
  }

  _fillSpecials (...args) {
    return this.constructor.fillSpecials.apply(this.constructor, [this].concat(args))
  }

  _inEdges () {
    return this.constructor.inEdges(this)
  }

  _outEdges () {
    return this.constructor.outEdges(this)
  }

  _remove (opts) {
    return this.constructor.remove(this, opts)
  }

  _save (opts) {
    return this.constructor.insertOrUpdate(this, opts)
  }

  // toAQL (opts) {
  //   // TODO ???
  // }

  toDataObject (opts) {
    if (!opts) {
      const newDocument = !(this._key || this._id)
      const meta = !newDocument ? _.pick(this, this.constructor.metaSpecials) : undefined

      opts = {
        newDocument,
        meta
      }
    }

    return this.constructor.forDb(this, opts)
  }

  toJSON () {
    return this.constructor.forClient(this)
  }

  toPrettyString () {
    return [
      this.toString(),
      JSON.stringify(this.constructor.forServer(this), null, 2)
    ].join(' ')
  }

  toString () {
    return `${this.constructor.modelName}: ${this._id || '<new>'}`
  }

  _PRINT (context) {
    context.output += this.toString()
    context.output += ' '
    printObject(this.constructor.forServer(this), context)
  }
}

class EdgeModel extends Model {
  /** @overridable */
  static get collectionName () {
    return lazyProperty(this, '_collectionName', getCollectionEdgeName)
  }

  /** @overridable required */
  static get join () {
    return null
  }

  /** @final */
  static get relations () {
    return lazyProperty(this, '_relations', getEdgeRelations)
  }
}

function bootstrapModel (model, db) {
  if (model.hasOwnProperty('_db')) {
    throw new Error(`Model "${model.name}" is already bootstrapped`)
  }

  if (!db.hasOwnProperty('_models')) {
    Object.defineProperty(db, '_models', {
      configurable: true,
      enumerable: false,
      value: (name) => db._models[name] || null,
      writable: true
    })
  }

  Object.defineProperty(model, '_db', {
    configurable: true,
    enumerable: false,
    value: db,
    writable: true
  })

  if (!db._collection(model.collectionName)) {
    throw new ArangoError({
      errorNum: errors.ERROR_ARANGO_COLLECTION_NOT_FOUND.code,
      errorMessage: `${errors.ERROR_ARANGO_COLLECTION_NOT_FOUND.message} (${model.collectionName})`
    })
  }

  Object.defineProperty(db._models, model.name, {
    configurable: true,
    enumerable: false,
    value: model,
    writable: true
  })

  if ((model.typeEdge || model.join) && !EdgeModel.isInheritedModel(model)) {
    throw new Error(`Model "${model.name}" doesn't extend EdgeModel class`)
  }

  if (!model.typeEdge && EdgeModel.isInheritedModel(model)) {
    throw new Error(`Collection "${model.collectionName} isn't an edge collection (model: ${model.name})"`)
  }

  if (model.typeEdge) {
    const jointure = model.join

    if (!jointure || typeof jointure !== 'object') {
      throw new Error(`Edge model "${model.name}" don't define static get "join"`)
    }

    ;[
      'from',
      'to',
      'type'
    ].forEach((prop) => {
      if (!jointure[prop] || typeof jointure[prop] !== 'string') {
        throw new Error(`Edge Model "${model.name}" static get "join" returns an invalid object: missing property "${prop}"`)
      }
    })

    if (!RELATION_TYPES[jointure.type]) {
      throw new Error(`Edge Model "${model.name}" static get "join" returns an invalid object: join type "${jointure.type}" is unknown (valid types: "${RELATION_ONE_TO_ONE}","${RELATION_ONE_TO_MANY}" or "${RELATION_MANY_TO_MANY}")`)
    }
  }

  const partitionsModels = createPartitionsModels(model)

  Object.defineProperty(model, '_partitionsModels', {
    value: partitionsModels
  })

  Object.keys(partitionsModels).forEach((key) => {
    const partitionModel = partitionsModels[key]

    Object.defineProperty(db._models, partitionModel.modelName, {
      value: partitionModel
    })
  })

  return model
}

function createPartitionsModels (model) {
  const partitionsModels = {}
  const partitionsPlans = {}

  partitionsPlans.main = {
    collectionName: model.collectionName,
    moveMethod: 'recover',
    timestampKey: model.recoverTimestamp
  }

  if (model.partitionArchived) {
    partitionsPlans[model.partitionArchived] = {
      moveMethod: 'archive',
      timestampKey: model.archiveTimestamp
    }
  }

  if (model.partitionTrashed) {
    model.partitionTrashed
    partitionsPlans[model.partitionTrashed] = {
      moveMethod: 'softRemove',
      timestampKey: model.deleteTimestamp
    }
  }

  Object.assign(partitionsPlans, model.partitions)

  Object.keys(partitionsPlans).forEach((key) => {
    const partitionName = _.upperFirst(key)
    const plan = partitionsPlans[key]

    if (!plan.collectionName) {
      plan.collectionName = [model.collectionName, key].join('_')
    }

    if (!plan.timestampKey) {
      plan.timestampKey = key + 'At'
    }

    plan.relations = model.relations
    plan.join = model.join

    if (plan.relations) {
      plan.relations = Object.assign({}, plan.relations)

      Object.keys(plan.relations).forEach((relName) => {
        plan.relations[relName] = _.flattenDeep(_.castArray(plan.relations[relName]))
          .reduce((acc, x) => acc.concat(x.split('~')), [])
          .map((x) => {
            x = x.trim()

            const dotPos = x.indexOf('.')

            if (~dotPos) {
              x = x.substring(0, dotPos) + partitionName + x.substring(dotPos)
            } else {
              x = x + partitionName
            }

            return x
          })
          .join(' ~ ')
        })
    }

    if (plan.join) {
      plan.join = Object.assign({}, plan.join)

      plan.join.from += partitionName
      plan.join.to += partitionName
    }

    const partitionModel = class PartitionModel extends model {
      static get collectionName () {
        return plan.collectionName
      }

      static get db () {
        return model.db
      }

      static get name () {
        return model.name
      }

      static get join () {
        return plan.join
      }

      static get partition () {
        return key
      }

      static get partitionName () {
        return partitionName
      }

      static get partitionTimestamp () {
        return plan.timestampKey
      }

      static get relations () {
        return plan.relations
      }
    }

    Object.defineProperties(model, {
      [key]: {
        value: partitionModel
      },
      [`partition${partitionName}`]: {
        value: partitionModel
      },
      [`_${key}`]: {
        get: () => false
      }
    })

    Object.defineProperty(model.prototype, `_${key}`, {
      get: () => false
    })

    Object.defineProperty(partitionModel, `_${key}`, {
      get: () => true
    })

    Object.defineProperty(partitionModel.prototype, `_${key}`, {
      get: () => true
    })

    if (plan.moveMethod) {
      Object.defineProperties(model, {
        [plan.moveMethod]: {
          value: function (doc, opts) {
            return this.moveInto.call(this, partitionModel, doc, opts)
          }
        },
        [`${plan.moveMethod}ByExample`]: {
          value: function (example, opts) {
            const recoverOpts = _.pick(opts, CRUD_OPTIONS_KEYS)

            return this.mqbByExample(example, opts)
              .cast(false)
              .iterate((doc) => this[plan.moveMethod].call(this, doc, recoverOpts))
          }
        },
        [`${plan.moveMethod}ByKeys`]: {
          value: function (keys, opts) {
            return this[plan.moveMethod].call(this, _.castArray(keys), opts)
          }
        },
        [`${plan.moveMethod}FirstExample`]: {
          value: function (example, opts) {
            const doc = this.mqbFirstExample(example, opts)
              .cast(false)
              .fetch()

            if (!doc) {
              return null
            }

            return this[plan.moveMethod].call(this, doc, _.pick(opts, CRUD_OPTIONS_KEYS))
          }
        },
        [`clean${partitionName}`]: {
          value: function (opts) {
            return partitionModel.clean(opts)
          }
        }
      })

      Object.defineProperty(model.prototype, `_${plan.moveMethod}`, {
        value: function (opts) {
          return this.constructor[plan.moveMethod].call(this.constructor, this, opts)
        }
      })
    }

    partitionsModels[key] = partitionModel
  })

  return partitionsModels
}

function getCollection (model) {
  const collection = model.db._collection(model.collectionName)

  if (!collection) {
    throw new Error(`Collection "${model.collectionName}" was not found (database: ${model.db._name()}).`)
  }

  return collection
}

function getCollectionName (model) {
  return inflect.underscore(inflect.pluralize(model.name))
}

function getCollectionEdgeName (model) {
  return inflect.underscore(model.name)
    .split('_')
    .map((x) => inflect.pluralize(x))
    .join('_')
}

function getCollectionType (model) {
  return model.collection.type()
}

function getDocumentName (model) {
  return inflect.camelize(inflect.singularize(model.name), false)
}

function getDocumentsName (model) {
  return inflect.underscore(inflect.pluralize(model.name))
}

function getEdgeRelations (model) {
  const jointure = model.join
  const fromModel = model.db._models(jointure.from)
  const toModel = model.db._models(jointure.to)

  if (!fromModel) {
    throw new Error(`Model "${model.name}" reference unknow model "${jointure.from}"`)
  }

  if (!toModel) {
    throw new Error(`Model "${model.name}" reference unknow model "${jointure.to}"`)
  }

  let fromRelName = fromModel.documentName
  let toRelName = toModel.documentName

  let fromModelName = fromModel.name
  let toModelName = toModel.name

  if (fromModel === toModel) {
    toRelName += '2'
    fromModelName += '.from'
    toModelName += '.to'
  }

  return {
    origin: fromModelName,
    target: toModelName,
    [fromRelName]: fromModelName,
    [toRelName]: toModelName
  }
}

function getFormatterForClient (model) {
  const hidden = [].concat(model.hidden || [])
  let visible = [].concat(model.visible || [])

  if (visible.length) {
    visible = visible.concat(_.difference(model.metaAttributes, hidden))
  }

  return (obj) => {
    let out = model.forServer(obj)

    if (hidden.length) {
      out = _.omit(out, hidden)
    }

    if (visible.length) {
      out = _.pick(out, visible)
    }

    model.serializeTimestamps(out)

    return out
  }
}

function getFormatterForServer (model) {
  const computed = [].concat(model.computed || [])
  const computing = {}

  computed.forEach((key) => {
    const desc = Object.getOwnPropertyDescriptor(model.prototype, key)

    if (desc && desc.get) {
      computing[key] = desc.get
      return
    }

    // if (desc && typeof desc.value === 'function') {
    //   computing[key] = desc.value
    //   return
    // }

    throw new Error(`Computing method "${key}" is missing (model: ${model.name})`)
  })

  return (obj) => {
    let out = Object.assign({}, obj)

    computed.forEach((key) => {
      _.set(out, key, computing[key].call(out))
    })

    return out
  }
}

function getMetaAttributes (model) {
  return [].concat(
    model.metaSpecials || [],
    model.metaTimestamps || []
  )
}

function getMetaSpecialAttributes (model) {
  return [].concat(SPECIAL_ATTRIBUTES)
}

function getMetaTimestampAttributes (model) {
  return [].concat(
    model.createTimestamp || [],
    model.updateTimestamp || [],
    Object.keys(model.partitionsModels)
      .map((key) => model.partitionsModels[key].partitionTimestamp || [])
  )
}

function getModelName (model) {
  return model.name + (model.partitionName || '')
}

function getModelQueryBuilder (model) {
  return new MQB(model)
}

function getModelTimestampAttributes (model) {
  return [].concat(
    model.metaTimestamps || [],
    model.timestamps || []
  )
}

function getRelationsPlans (model) {
  const relations = {}

  // Edge model
  if (model.typeEdge) {
    const edgeRelations = model.relations
    const jointure = model.join

    model.relationsKeys.forEach((key, index) => {
      let targetName = edgeRelations[key]
      let dotPos = targetName.indexOf('.')
      let isOrigin
      let isTarget

      if (~dotPos) {
        isOrigin = targetName.substring(dotPos + 1) === 'from'
        isTarget = targetName.substring(dotPos + 1) === 'to'
        targetName = targetName.substring(0, dotPos)
      }

      const target = model.db._models(targetName)
      const origin = model.db._models(isOrigin ? jointure.to : jointure.from)

      if (typeof isOrigin === 'undefined' || typeof isTarget === 'undefined') {
        isOrigin = target.name === jointure.from
        isTarget = target.name === jointure.to
      }

      relations[key] = {
        jointure,
        isOrigin,
        isTarget,
        origin,
        target,
        unary: true
      }
    })
  // Document model
  } else {
    model.relationsKeys.forEach((key) => {
      const pivotsSetters = []
      let joinPlans = model.relations[key]

      if (!Array.isArray(joinPlans) && typeof joinPlans !== 'string') {
        throw new Error(`Relation ${key} is invalid (model ${model.name})`)
      }

      if (typeof joinPlans === 'string') {
        joinPlans = joinPlans.split('~').map((x) => x.trim())
      }

      let prevModel = model
      let traverseCursor = []

      joinPlans = joinPlans.map((relModelName, index) => {
        const dotPos = relModelName.indexOf('.')
        let isOrigin
        let isTarget

        if (~dotPos) {
          const relDirection = relModelName.substring(dotPos + 1)
          relModelName = relModelName.substring(0, dotPos)

          if (['from', 'to'].indexOf(relDirection) === -1) {
            throw new Error(`Relation "${key}" unknown direction "${relDirection}" (model: ${prevModel.name})`)
          }

          isOrigin = relDirection === 'from'
          isTarget = relDirection === 'to'
        }

        const relModel = model.db._models(relModelName)

        if (!relModel) {
          throw new Error(`Relation "${key}" model "${relModelName}" is unknown (model: ${prevModel.name})`)
        }

        if (!relModel.typeEdge) {
          throw new Error(`Relation "${key}" model "${relModelName}" isn't an edge model (model: ${prevModel.name})`)
        }

        const jointure = relModel.join
        const originModel = model.db._models(jointure.from)
        const targetModel = model.db._models(jointure.to)

        if (typeof isOrigin !== 'undefined' || typeof isTarget !== 'undefined') {
          if (isOrigin && jointure.from !== prevModel.modelName) {
            throw new Error(`Relation "${key}" model "${relModelName}" origin (from) isn't "${prevModel.name}" (model: ${prevModel.name})`)
          }
          if (isTarget && jointure.to !== prevModel.modelName) {
            throw new Error(`Relation "${key}" model "${relModelName}" target (to) isn't "${prevModel.name}" (model: ${prevModel.name})`)
          }
        } else {
          isOrigin = originModel === prevModel
          isTarget = targetModel === prevModel
        }

        const target = isOrigin ? targetModel : originModel

        if (!isOrigin && !isTarget) {
          throw new Error(`Model "${prevModel.modelName}" isn't a part of edge model "${relModel.name}"`)
        }

        if (!originModel) {
          throw new Error(`Model "${prevModel.modelName}" reference unknow model "${jointure.from}"`)
        }

        if (!targetModel) {
          throw new Error(`Model "${prevModel.modelName}" reference unknow model "${jointure.to}"`)
        }

        traverseCursor.push(target.documentName)

        pivotsSetters.push(`edge${index}`)

        let setterRelName = relModel.name

        for (
          let i = 1;
          ~pivotsSetters.indexOf(setterRelName);
          setterRelName = `${relModel.name}${++i}`
        );

        pivotsSetters.push(setterRelName)

        const plan = {
          jointure,
          isOrigin,
          isTarget,
          direction: isOrigin ? 'OUTBOUND' : 'INBOUND',
          origin: prevModel,
          pivot: relModel,
          target,
          traverseCursor: [].concat(traverseCursor).join('_'),
          // unary: jointure.type === RELATION_ONE_TO_ONE || (jointure.type === RELATION_ONE_TO_MANY && prevModel === targetModel)
          unary: jointure.type === RELATION_ONE_TO_ONE || (jointure.type === RELATION_ONE_TO_MANY && isTarget)
        }

        prevModel = target

        return plan
      })

      relations[key] = {
        models: joinPlans.reduce((acc, {target}) => acc.concat(target), [model]),
        pivot: _.last(joinPlans).pivot,
        pivots: joinPlans.map(({pivot}) => pivot),
        pivotsSetters,
        plans: joinPlans,
        origin: model,
        target: prevModel,
        unary: joinPlans.reduce((acc, {unary}) => acc && unary, true),
      }
    })
  }

  return relations
}

function getRelationsKeys (model) {
  return _.isPlainObject(model.relations) ? Object.keys(model.relations) : []
}

function getSchema (model) {
  const keys = {}

  model.metaSpecials.forEach((prop) => {
    keys[prop] = joi.string()
  })

  model.metaTimestamps.forEach((prop) => {
    keys[prop] = joi.string().isoDate()
  })

  let schema = joi.object()
    .keys(keys)
    .unknown(model.allowUnknown)

  if (model.define) {
    schema = model.define(schema, joi)
  }

  return schema
}

function isDocumentModel (model) {
  return model.type === DOCUMENT_COLLECTION_TYPE
}

function isEdgeModel (model) {
  return model.type === EDGE_COLLECTION_TYPE
}

function lazyProperty (model, key, getter) {
  if (!model.hasOwnProperty(key)) {
    Object.defineProperty(model, key, {
      enumerable: false,
      configurable: false,
      value: getter(model),
      writable: false
    })
  }

  return model[key]
}

module.exports = Model
