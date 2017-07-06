const _ = require('lodash')
const AQB = require('aqb')
const MQB = require('./mqb')
const inflect = require('i')()
const joi = require('joi')

const {
  ArangoError,
  aql: AQL,
  errors,
  printObject
} = require('@arangodb')

const {
  EE,
  lazyProperty
} = require('./utils')

const __DEV__ = _.get(module, 'context.isDevelopment')

const DOCUMENT_COLLECTION_TYPE = 2
const EDGE_COLLECTION_TYPE = 3

const COLLECTION_TYPES = {
  [DOCUMENT_COLLECTION_TYPE]: 'document',
  [EDGE_COLLECTION_TYPE]: 'edge'
}

const CRUD_OPTIONS_KEYS = [
  'force',
  'safe',

  'keepNull',
  'mergeObjects',
  'overwrite',
  'returnNew',
  'returnOld',
  'silent',
  'waitForSync'
]

const INTERNAL_ATTRIBUTES = [
  '_key',
  '_id',
  '_rev',
]

const INTERNAL_EDGE_ATTRIBUTES = [
  '_from',
  '_to'
]

const INTERNAL_EXTENDED_ATTRIBUTES = [
  '_old'
]

const INTERNAL_ATTRIBUTES_AQB = AQB(INTERNAL_ATTRIBUTES)

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

const SAVE_REL_OPTS = [
  'attach',
  'detach',
  'sync'
]

const GEO_METHODS = [
  'near',
  'within',
  'withinRectangle'
]

const FULLTEXT_METHODS = [
  'byText'
]

const GLOBAL_EE = new EE()
const GLOBAL_HOOKS = {}

class Model {
  /** @overridable */
  static get Controller () {
    return lazyProperty(this, '_Controller', getModelController)
  }

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

  /** @final */
  static get bootstrapped () {
    return false
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
    throw new Error(`Model "${this.name}" isn't bootstrapped yet`)
  }

  /** @overridable */
  static get collectionName () {
    throw new Error(`Model "${this.name}" isn't bootstrapped yet`)
  }

  /** @final */
  static get db () {
    throw new Error(`Model "${this.name}" isn't bootstrapped yet`)
  }

  /** @overridable */
  static get design () {
    return null
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

  /** @final */
  static get controller () {
    throw new Error(`Model's controller "${this.name}" isn't bootstrapped yet (use static "bootstrapController(context)")`)
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

  /** @final */
  static get globalHooks () {
    return GLOBAL_HOOKS
  }

  /** @overridable */
  static get hidden () {
    return null
  }

  /** @final */
  static get hooksTypes () {
    return lazyProperty(this, '_hooksTypes', getHooksTypes)
  }

  /** @final */
  static get hooks () {
    return lazyProperty(this, '_hooks', () => ({}))
  }

  /** @final */
  static get indexes () {
    throw new Error(`Model "${this.name}" isn't bootstrapped yet`)
  }

  /** @final */
  static get indexesKeys () {
    return lazyProperty(this, '_indexesKeys', getModelIndexesKeys)
  }

  /** @overridable */
  static get join () {
    return null
  }

  /** @final */
  static get metaAttributes () {
    return lazyProperty(this, '_metaAttributes', getMetaAttributes)
  }

  /** @final */
  static get metaInternals () {
    return lazyProperty(this, '_metaInternals', getMetaInternalAttributes)
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
    throw new Error(`Model "${this.name}" isn't bootstrapped yet`)
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
  static get schema () {
    return lazyProperty(this, '_schema', getValidationSchema)
  }

  /** @final */
  static get sortBy () {
    return this.createTimestamp || '_key'
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

  static addGlobalHook (type, name, fn) {
    return addHook.call(this, this.globalHooks, null, type, name, fn)
  }

  static addHook (type, name, fn) {
    return addHook.call(this, this.hooks, this.hooksTypes, type, name, fn)
  }

  static all () {
    return this.mqbAll.apply(this, arguments)
      .fetch()
  }

  static any () {
    return this.mqbAny.apply(this, arguments)
      .fetch()
  }

  /** @overridable */
  static boot (db) {

  }

  static bootstrap (db, context, controllerOpts) {
    bootstrapModel(this, db)

    if (context) {
      this.bootstrapController(context, controllerOpts)
    }

    return this
  }

  static bootstrapController (context, opts) {
    const controller = this.Controller.bootstrap(context, opts)

    Object.defineProperty(this, 'controller', {
      configurable: false,
      enumerable: false,
      value: controller,
      writable: false
    })

    return controller
  }

  static byExample () {
    return this.mqbByExample.apply(this, arguments)
      .fetch()
  }

  static castDocumentSelector (selector) {
    if (Array.isArray(selector)) {
      return selector.map((x) => this.castDocumentSelector(x))
    }

    if (selector && typeof selector === 'object' && typeof selector._key === 'number') {
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

    if (data && relations) {
      Object.keys(relations).forEach((key) => {
        const relOpts = relations[key].opts
        if (data[key] && !relOpts.count && !relOpts.pair && !relOpts.pluck && (relOpts.cast ||( cast && relOpts.cast != false))) {
          const {target} = qb.model.relationsPlans[key]
          const inflateRelation = (values) => {
            let targetPartition = target

            if (values._id) {
              const valueCollName = values._id.split('/')[0]

              if (valueCollName !== target.collectionName) {
                const valuePartitionName = Object.keys(target.partitionsModels).find((key) => target.partitionsModels[key].collectionName === valueCollName)

                if (valuePartitionName && target.partitionsModels[valuePartitionName]) {
                  targetPartition = target.partitionsModels[valuePartitionName]
                }
              }
            }

            if (values._edge) {
              const relPlans = qb.model.relationsPlans[key]
              const relPivotsLength = relPlans.pivots.length
              const relPivotOpts = relOpts.edges && relOpts.edges[relPivotsLength - 1] && relOpts.edges[relPivotsLength - 1].opts

              if (!relPivotOpts || (relPivotOpts.cast != false && !relPivotOpts.count && !relPivotOpts.pair && !relPivotOpts.pluck)) {
                values._edge = new relPlans.pivot.partitionsModels[targetPartition.partition](values._edge)
              }
            }

            if (relOpts.relations) {
              values = this.castQueryResultRelations(values, relations[key])
            }

            return new targetPartition(values)
          }

          if (Array.isArray(data[key])) {
            data[key] = data[key]
              .filter((x) => x != null)
              .map((x) => inflateRelation(x))
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
    const doc = new this(data)
    const docId = doc._id || doc._key

    if (this.exists(docId)) {
      throw new Error(`Document "${docId}" already exists (model: ${this.modelName})`)
    }

    return doc._save(opts)
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

  static document () {
    return this.mqbDocument.apply(this, arguments)
      .fetch()
  }

  static documents (keys) {
    return this.document(_.castArray(keys))
  }

  static edges (doc, relName, opts = {}) {
    const pivotsUsed = []

    return _.uniq((relName ? _.castArray(relName) : this.relationsKeys)
      .reduce((acc, relName, index, arr) => {
        const {plans} = this.relationsPlans[relName]

        if (plans.length === 1 && pivotsUsed.indexOf(plans[0].pivot) === -1) {
          const {pivot} = plans[0]

          pivotsUsed.push(pivot)

          acc = acc.concat(pivot.edges(doc, opts))
        }

        return acc
      }, []))
  }

  static exists (selector) {
    if (Array.isArray(selector)) {
      return selector.map((x) => this.exists(x))
    }

    if (!selector || (typeof selector === 'object' && !selector._id && !selector._key)) {
      return false
    }

    selector = this.castDocumentSelector(selector)

    if (typeof selector === 'object' && selector._id === null) {
      selector = Object.assign({}, selector)
      delete selector._id
    }

    return !!selector ? this.collection.exists(selector._key ? String(selector._key) : selector._id || selector) : null
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

  static find (selector, opts) {
    return this.findOr(selector, null, opts)
  }

  static findBy (example, opts) {
    if (typeof example === 'string') {
      example = {[example]: opts}
      opts = arguments[2]
    }

    if (Array.isArray(example)) {
      example = _.chunk(example, 2).reduce((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {})
    }

    return this.findByOr(example, null, opts)
  }

  static findByOr (example, orValue, opts) {
    if (typeof example === 'string') {
      example = {[example]: orValue}
      orValue = opts
      opts = arguments[3]
    }

    if (Array.isArray(example)) {
      example = _.chunk(example, 2).reduce((acc, [key, value]) => {
        acc[key] = value
        return acc
      }, {})
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

  static findOr (selector, orValue, opts) {
    let docMeta
    let result

    docMeta = this.exists(selector)
    result = docMeta && this.document(docMeta, opts)

    if (!result) {
      const error = new ArangoError({
        errorNum: errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code,
        errorMessage: `${errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.message} "${selector}" (model: ${this.name})`
      })

      result = typeof orValue === 'function' ? orValue(error, selector) : orValue
    }

    return result
  }

  static findOrCreate (selector, doc, opts) {
    return this.findOr(selector, () => this.create(doc), opts)
  }

  static findOrFail (selector, error, opts) {
    return this.findOr(selector, (e) => {throw (error || e)}, opts)
  }

  static fill (doc, data, dataValue, opts = {}) {
    if (arguments.length > 2) {
      if (typeof data === 'string') {
        // data = {[data]: dataValue}
        data = _.set({}, _.toPath(data), dataValue)
      } else {
        opts = dataValue
        dataValue = undefined
      }
    }

    if (opts == false || (opts && opts.mutate == false)) {
      doc = new this(doc)
    }

    data = _.omit(data, this.metaInternals)

    this.deserializeTimestamps(data)

    // Object.assign(doc, data)
    if (opts.concatArrays) {
      _.mergeWith(doc, data, (objValue, srcValue) => {
        if (_.isArray(objValue)) {
          return objValue.concat(srcValue);
        }
      })
    } else {
      _.merge(doc, data)
    }

    return doc
  }

  static fillInternals (doc, data, dataValue, opts) {
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

    data = _.pick(data, this.metaInternals)

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
    let out = Object.assign({}, data)

    if (opts.newDocument) {
      if (out._key === null) {
        delete out._key
      }
    } else {
      const rev = (opts.meta || data)._rev

      Object.assign(out, opts.meta, {_old: rev})
    }

    if (this.relationsKeys.length) {
      out = _.omit(out, this.relationsKeys)
    }

    if (out._edge) {
      out = _.omit(out, '_edge')
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

  static generateKey (doc) {
    return null
  }

  static ids () {
    return this.pluck.apply(this, ['_id'].concat(_.flattenDeep(arguments)))
  }

  static inEdges (doc, relName, opts) {
    if (typeof relName === 'object' && !Array.isArray(relName)) {
      opts = relName
      relName = undefined
    }

    opts = Object.assign({}, opts, {inEdges: true, outEdges: false})

    return this.edges(doc, relName, opts)
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

  static moveInto (partitionModel, doc, opts = {}) {
    if (Array.isArray(doc)) {
      return doc.map((x) => this.moveInto(partitionModel, x, opts))
    }

    if (typeof partitionModel === 'string') {
      if (!this.partitionsModels[partitionModel]) {
        throw new Error(`Partition "${partitionModel}" doesn't exists (model ${this.name})`)
      }

      partitionModel = this.partitionsModels[partitionModel]

    }

    const model = this

    if (typeof doc === 'number' || !doc._modelInstance) {
      doc = model.document(doc)
    }

    const id = doc._key || doc._id

    if (!id) {
      throw new Error(`Cannot move document without _key or _id (from ${model.partition} into ${partitionKey}`)
    }

    if (partitionModel.partition === model.partition) {
      return doc
    }

    if (opts.mutate == false) {
      doc = new partitionModel(doc)
    }

    if (model.recoverTimestamp && _.has(doc, model.recoverTimestamp)) {
      _.set(doc, model.recoverTimestamp, null)
    }

    if (model.partitionTimestamp && _.has(doc, model.partitionTimestamp)) {
      _.set(doc, model.partitionTimestamp, null)
    }

    const now = Date.now()

    if (partitionModel.partitionTimestamp) {
      _.set(doc, partitionModel.partitionTimestamp, new Date(now))
    }

    if (model.updateTimestamp) {
      _.set(doc, model.updateTimestamp, new Date(now))
    }

    runHook(doc, 'beforeMoveInto', [doc, model, partitionModel])
    runHook(doc, partitionModel.partitionMoveBeforeEvent, [doc, model, partitionModel])

    let partitionInstance
    let meta

    partitionInstance = partitionModel.create(doc, opts)

    meta = model.collection.remove(id, opts)

    Object.keys(model.partitionsModels).forEach((key) => {
      ;[
        ['_from', model.partitionsModels[key].outEdges(doc)],
        ['_to', model.partitionsModels[key].inEdges(doc)]
      ].forEach(([edgeKey, edges]) => {
        edges.forEach((edge) => {
          edge._fillInternals(edgeKey, partitionInstance._id)

          if (key === model.partition) {
            edge._moveInto(partitionModel.partition, opts)
          } else {
            edge._save(opts)
          }
        })
      })
    })

    if (opts.mutate == false) {
      doc = partitionInstance
    } else {
      model.fill(doc, partitionInstance)
      model.fillInternals(doc, partitionInstance)

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

    // if (meta.new) {
    //   Object.defineProperty(doc, 'new', {
    //     configurable: true,
    //     enumerable: false,
    //     value: meta.new,
    //     writable: false
    //   })
    // }

    runHook(doc, 'afterMoveInto', [doc, model, partitionModel])
    runHook(doc, partitionModel.partitionMoveAfterEvent, [doc, model, partitionModel])

    return doc
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

  static mqbDocument (selector, opts) {
    const query = this.mqb(opts, [
      'last'
    ])

    return query
      .document(selector)
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
    if (typeof perPage !== 'number' && (typeof perPage !== 'string' || isNaN(perPage))) {
      args.unshift(perPage)
      perPage = undefined
    }

    if (typeof page !== 'number' && (typeof page !== 'string' || isNaN(page))) {
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

  static outEdges (doc, relName, opts) {
    if (typeof relName === 'object' && !Array.isArray(relName)) {
      opts = relName
      relName = undefined
    }

    opts = Object.assign({}, opts, {inEdges: false, outEdges: true})

    return this.edges(doc, relName, opts)
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

    runHook(this, 'beforeQuery', [queryString])

    const result = this.db._query.apply(this.db, args)

    runHook(this, 'afterQuery', [result, queryString])

    return result
  }

  static range () {
    return this.mqbRange.apply(this, arguments)
      .fetch()
  }

  static remove (doc, opts = {}) {
    if (opts.safe != false && !opts.force && this.partitionTrashed && this.partition !== this.partitionTrashed) {
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

    runHook(doc, 'beforeRemove', [doc])

    let meta

    meta = this.collection.remove(id, opts)

    Object.keys(this.partitionsModels).forEach((key) => {
      ;[
        ['_from', this.partitionsModels[key].outEdges(doc)],
        ['_to', this.partitionsModels[key].inEdges(doc)]
      ].forEach(([edgeKey, edges]) => {
        edges.forEach((edge) => {
          edge._remove(Object.assign({}, opts, {force: true}))
        })
      })
    })

    if (this.partitionTrashed && !doc['_' + this.partitionTrashed]) {
      Object.defineProperty(doc, '_' + this.partitionTrashed, {
        configurable: true,
        enumerable: false,
        value: true,
        writable: false
      })
    }

    // if (meta.old) {
    //   Object.defineProperty(doc, 'old', {
    //     configurable: true,
    //     enumerable: false,
    //     value: meta.old,
    //     writable: false
    //   })
    // }

    runHook(doc, 'afterRemove', [doc])

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

  static removeGlobalHook (type, name) {
    return removeHook.call(this, this.globalHooks, null, type, name)
  }

  static removeHook (type, name) {
    return removeHook.call(this, this.hooks, this.hooksTypes, type, name)
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

    if (!doc._key) {
      this.fillInternals(doc, '_key', this.generateKey(doc))
    }

    if (this.createTimestamp && !_.get(doc, this.createTimestamp)) {
      _.set(doc, this.createTimestamp, new Date())
    }

    runHook(doc, 'beforeCreate', [doc])
    runHook(doc, 'beforeSave', [doc])

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

    this.fillInternals(doc, meta)

    // if (meta.new) {
    //   Object.defineProperty(doc, 'new', {
    //     configurable: true,
    //     enumerable: false,
    //     value: meta.new,
    //     writable: false
    //   })
    // }

    if (opts.withRelations) {
      opts = Object.assign({}, opts, {
        with: this.relationsKeys.filter((relName) => doc[relName])
      })
    }

    if (opts.with) {
      doc = _.castArray(opts.with).reduce((acc, relName) => {
        return this.saveRelation(relName, acc, acc[relName], opts)
      }, doc)
    }

    runHook(doc, 'afterCreate', [doc])
    runHook(doc, 'afterSave', [doc])

    return doc
  }

  static saveRelation (relName, doc, relDocs, opts = {}) {
    if (this.typeEdge) {
      throw new Error(`Saving relation through an edge document isn't supported yet (mode: ${this.name})`)
    }

    const docMeta = this.exists(doc)

    if (!docMeta) {
      throw new Error(`Can't save relation "${relName}": document not found (model: ${this.name})`)
    }

    const relPlans = this.relationsPlans[relName]

    if (!relPlans) {
      throw new Error(`Can't save relation "${relName}": relation doesn't exists (model: ${this.name})`)
    }

    if (relPlans.plans.length > 1) {
      throw new Error(`Can't save relation "${relName}": multiple edges (model: ${this.name})`)
    }

    if (typeof doc !== 'object') {
      doc = doc.find(doc)
    } else if (!doc._modelInstance || opts.mutate == false) {
      doc = new this(doc)
    }

    const {pivot, target, unary} = relPlans
    const {isOrigin, isTarget, jointure} = relPlans.plans[0]

    relDocs = _.castArray(relDocs)

    if (unary && !opts.detach && !relDocs.length) {
      throw new Error(`Can't save relation "${relName}": null value (model: ${this.name})`)
    }

    const afterHooksRunners = []

    relDocs = relDocs.map((relDoc) => {
      let relDocMeta
      let relEdge
      let relEdgeExample

      if (typeof relDoc !== 'object') {
        if (opts.detach && unary && !relDoc) {
          relDoc = getRelationData(this, relName, doc)
        } else {
          const docId = relDoc

          relDoc = target.find(docId)

          // if (!relDoc) {
          //   throw new Error(`Can't save relation "${relName}": document "${docId}" not found (model: ${this.name})`)
          // }
          if (opts.attach && !relDoc) {
            throw new Error(`Can't save relation "${relName}": document "${docId}" not found (model: ${this.name})`)
          } else {
            relDoc = new target({
              [~docId.indexOf('/') ? '_id' : '_key']: docId
            })
          }
        }
      } else if (!relDoc._modelInstance || opts.mutate == false) {
        relDoc = new target(relDoc)
      }

      relDocMeta = target.exists(relDoc)

      if (opts.attach && !relDocMeta) {
        throw new Error(`Can't save relation "${relName}": related document doesn't exists (model: ${this.name})`)
      }

      if (unary) {
        relEdgeExample = [
          isOrigin ? '_from' : '_to',
          doc._id
        ]
      } else if (!unary && relDocMeta) {
        if (jointure.type === 'manyToMany') {
          relEdgeExample = [
            isOrigin ? '_from' : '_to',
            doc._id,
            isOrigin ? '_to' : '_from',
            relDocMeta._id
          ]
        } else {
          relEdgeExample = [
            isOrigin ? '_to' : '_from',
            relDocMeta._id
          ]
        }
      }

      if (relEdgeExample) {
        relEdge = pivot.findBy(relEdgeExample)
      }

      if (!relEdge) {
        relEdge = new pivot()
      }

      if (relDoc._edge) {
        relEdge
          ._fill(relDoc._edge)
          ._fillInternals(relDoc._edge)
      }

      return [relDoc, relDocMeta, relEdge]
    }).map(([relDoc, relDocMeta, relEdge], index) => {
      runHook(doc, opts.detach ? 'beforeDetachRelation' : 'beforeAttachRelation', [relDoc, doc])
      runHook(doc, 'beforeSaveRelation', [relDoc, doc])

      afterHooksRunners.push(() => {
        runHook(doc, opts.detach ? 'afterDetachRelation' : 'afterAttachRelation', [relDoc, doc])
        runHook(doc, 'afterSaveRelation', [relDoc, doc])
      })

      if (!index && opts.sync) {
        pivot.mqb
          .filter(isOrigin ? '_from': '_to', AQB(doc._id))
          .iterate((edge) => edge._remove({force: true}))
        
        doc[relName] = []
      }

      if (opts.detach && !opts.sync && !opts.attach) {
        if (relEdge._exists()) {
          relEdge._remove({force: true})
        }

        if (doc[relName] && relDocMeta) {
          if (unary) {
            doc[relName] = null
          } else if (Array.isArray(doc[relName])) {
            doc[relName] = doc[relName].filter(({_id}) => {
              return _id !== relDocMeta._id
            })
          }
        }

        return
      }

      relEdge._fillInternals(isOrigin ? '_from' : '_to', doc._id)

      // if (!opts.attach) {
        relDocMeta = _.pick(relDoc._save(), target.metaInternals)
      // }

      relEdge._fillInternals(isOrigin ? '_to' : '_from', relDocMeta._id)

      relEdge._save()

      if (opts.withEdges != false) {
        if (opts.mutate == false || !relDoc._edge || !relDoc._edge._modelInstance) {
          relDoc._edge = relEdge
        } else {
          relDoc._edge
            ._fill(relEdge)
            ._fillInternals(relEdge)
        }
      }

      return relDoc
    })

    if (!opts.detach) {
      if (unary) {
        doc[relName] = relDocs[0]
      } else if (Array.isArray(doc[relName])) {
        doc[relName] = doc[relName]
          .filter(({_id}) => !relDocs.find((relDoc) => _id === relDoc._id))
          .concat(relDocs)
      } else {
        doc[relName] = relDocs
      }
    }

    afterHooksRunners.forEach((runAfterHook) => runAfterHook())

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

  static setup (db, opts) {
    if (_.isPlainObject(db)) {
      opts = db
      db = undefined
    }

    if (!db) {
      db = this.db
    }

    runHook(this, 'beforeSetup', [this, db])

    const partitionsPlans = getModelPartitionsPlans(this)

    Object.keys(partitionsPlans).forEach((partitionKey) => {
      const {design} = partitionsPlans[partitionKey]
      const creationMethod = `_create${design.type === EDGE_COLLECTION_TYPE ? 'Edge' : 'Document'}Collection`

      console.debug(`Ensure ${COLLECTION_TYPES[design.type]} collection "${design.name}" exists`)

      if (!db._collection(design.name)) {
        console.debug(`Create collection "${design.name}".`)

        db[creationMethod].call(db, design.name)
      }

      const collection = db._collection(design.name)

      Object.keys(design.indexes).forEach((key) => {
        const index = design.indexes[key]

        console.debug(`Ensure index "${key}" exists in collection "${design.name}": ${JSON.stringify(index)}`)

        collection.ensureIndex(index)
      })
    })

    runHook(this, 'afterSetup', [this, db])

    return this
  }

  static teardown (db, opts) {
    if (_.isPlainObject(db)) {
      opts = db
      db = undefined
    }

    if (!db) {
      db = this.db
    }

    runHook(this, 'beforeTeardown', [this, db])

    const {force, onlyInDevMode} = opts || {}

    if (force || (onlyInDevMode != false && __DEV__)) {
      const partitionsPlans = getModelPartitionsPlans(this)

      Object.keys(partitionsPlans).forEach((partitionKey) => {
        const {design} = partitionsPlans[partitionKey]

        console.debug(`Ensure ${COLLECTION_TYPES[design.type]} collection "${design.name}" doesn't exists`)

        if (db._collection(design.name)) {
          console.debug(`Drop collection "${design.name}"`)

          db._drop(design.name)
        }
      })
    }

    runHook(this, 'afterTeardown', [this, db])

    return this
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

    this.fillInternals(doc, meta)

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

    runHook(doc, opts.replace ? 'beforeReplace' : 'beforeUpdate', [doc])
    runHook(doc, 'beforeSave', [doc])

    data = this.forDb(doc)

    if (opts.replace) {
      meta = this.collection.replace(id, data, opts)
    } else {
      meta = this.collection.update(id, data, opts)
    }

    // this.fill(doc, data)
    this.fillInternals(doc, meta)

    // if (meta.new) {
    //   Object.defineProperty(doc, 'new', {
    //     configurable: true,
    //     enumerable: false,
    //     value: meta.new,
    //     writable: false
    //   })
    // }

    // if (meta.old) {
    //   Object.defineProperty(doc, 'old', {
    //     configurable: true,
    //     enumerable: false,
    //     value: meta.old,
    //     writable: false
    //   })
    // }

    if (opts.withRelations) {
      opts = Object.assign({}, opts, {
        with: this.relationsKeys.filter((relName) => doc[relName])
      })
    }

    if (opts.with) {
      doc = _.castArray(opts.with).reduce((acc, relName) => {
        return this.saveRelation(relName, acc, acc[relName], opts)
      }, doc)
    }

    runHook(doc, opts.replace ? 'afterReplace' : 'afterUpdate', [doc])
    runHook(doc, 'afterSave', [doc])

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
    context.output += `[Model "${this.modelName}" (${this.bootstrapped ? ['collection:', this.collectionName].join(' ') : 'not bootstrapped'})]`
  }

  constructor (data) {
    this.constructor.fillInternals(this, {
      _id: null,
      _key: null,
      _rev: null,
      _from: null,
      _to: null
    }, true)

    if (this.constructor.defaultDocument) {
      Object.assign(this, this.constructor.defaultDocument)
    }

    if (data) {
      this.constructor.fillInternals(this, data)
      this.constructor.fill(this, data)

      if (data._listeners) {
        Object.assign(this._listeners, data._listeners)
      }
    }
  }

  get _collection () {
    return this.constructor.collection
  }

  get _model () {
    return this.constructor
  }

  get _modelInstance () {
    return true
  }

  _edges (relName) {
    return this.constructor.edges(this, relName)
  }

  _exists () {
    return this.constructor.exists(this)
  }

  _fill (...args) {
    return this.constructor.fill.apply(this.constructor, [this].concat(args))
  }

  _fillInternals (...args) {
    return this.constructor.fillInternals.apply(this.constructor, [this].concat(args))
  }

  _inEdges (relName) {
    return this.constructor.inEdges(this, relName)
  }

  _moveInto (partitionModel, opts) {
    return this.constructor.moveInto(partitionModel, this, opts)
  }

  _outEdges (relName) {
    return this.constructor.outEdges(this, relName)
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

  // toDataObject (opts) {
  //   if (!opts) {
  //     const newDocument = !(this._key || this._id)
  //     const meta = !newDocument ? _.pick(this, this.constructor.metaInternals) : undefined

  //     opts = {
  //       newDocument,
  //       meta
  //     }
  //   }

  //   return this.constructor.forDb(this, opts)
  // }

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
  static get relations () {
    return lazyProperty(this, '_relations', getEdgeRelations)
  }

  static edges (id, opts = {}) {
    if (typeof id === 'object') {
      id = id._id
    }

    let result

    if (opts.inEdges) {
      result = this.collection.inEdges(id)
    } else if (opts.outEdges) {
      result = this.collection.outEdges(id)
    } else {
      result = this.collection.edges(id)
    }

    if (opts.cast != false) {
      result = this.castQueryResult(result)
    }

    return result
  }

  static inEdges (id, opts) {
    opts = Object.assign({}, opts, {inEdges: true, outEdges: false})

    return this.edges(id, opts)
  }

  static outEdges (id, opts) {
    opts = Object.assign({}, opts, {inEdges: true, outEdges: false})

    return this.edges(id, opts)
  }
}

function addHook (hooks, hooksTypes, type, name, fn) {
  if (hooksTypes && hooksTypes.indexOf(type) === -1) {
    throw new Error(`Add hook failed: unknow type "${type}"`)
  }

  if (typeof name === 'function') {
    fn = name
    name = fn.name
  }

  if (!name || typeof name !== 'string') {
    throw new Error(`Add hook failed: missing name`)
  }

  if (typeof fn !== 'function') {
    throw new Error(`Add hook failed: missing function`)
  }

  if (!hooks[type]) {
    hooks[type] = {}
  }

  hooks[type][name] = fn

  return this
}

function bootstrapModel (model, db) {
  if (model.bootstrapped) {
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

  model.boot(db)

  runHook(model, 'beforeBootstrap', [model])

  const design = getModelSchema(model)
  const collection = db._collection(design.name)

  if (!collection) {
    throw new ArangoError({
      errorNum: errors.ERROR_ARANGO_COLLECTION_NOT_FOUND.code,
      errorMessage: `${errors.ERROR_ARANGO_COLLECTION_NOT_FOUND.message} "${design.name}" (model: ${model.name})`
    })
  }

  Object.defineProperties(model, {
    'bootstrapped': {
      configurable: true,
      enumerable: false,
      value: true,
      writable: false
    },
    'collection': {
      configurable: true,
      enumerable: false,
      value: collection,
      writable: false
    },
    'collectionName': {
      configurable: true,
      enumerable: false,
      value: design.name,
      writable: false
    },
    'db': {
      configurable: true,
      enumerable: false,
      value: db,
      writable: true
    },
    'design': {
      configurable: true,
      enumerable: false,
      value: design,
      writable: false
    }
  })

  bootstrapModelIndexes(model)
  bootstrapModelRelations(model)
  bootstrapModelPartitions(model)

  Object.defineProperty(db._models, model.name, {
    configurable: true,
    enumerable: false,
    value: model,
    writable: true
  })

  runHook(model, 'afterBootstrap', [model])

  return model
}

function bootstrapModelIndexes (model) {
  const colIndexes = model.collection.getIndexes()
  const indexes = {}

  Object.keys(model.design.indexes).forEach((indexKey) => {
    const index = model.design.indexes[indexKey]
    const indexFound = colIndexes.find((colIndex) => {
      if (colIndex.type !== index.type && (index.type !== 'geo' || colIndex.type !== 'geo2')) {
        return false
      }

      if (_.difference(index.fields, colIndex.fields).length) {
        return false
      }

      return Object.keys(index)
        .filter((key) => key !== 'fields' && key !== 'type')
        .reduce((acc, key) => acc && index[key] === colIndex[key], true)
    })

    if (!indexFound) {
      throw new Error(`Index type ${index.type} named "${indexKey}" doesn't exists ${JSON.stringify(index)} (model: ${model.name})`)
    }

    indexes[indexKey] = indexFound

    if (~['fulltext', 'geo'].indexOf(index.type)) {
      if (!model[index.type]) {
        Object.defineProperty(model, index.type, {
          value: (indexName) => {
            if (!model[index.type][indexName]) {
              throw new Error(`Index ${index.type} named "${indexName}" doesn't exists (model: ${model.name}) `)
            }

            return model[index.type][indexName]
          }
        })
      }

      model[index.type][indexKey] = (
        index.type === 'geo'
          ? GEO_METHODS
          : FULLTEXT_METHODS
      ).reduce((acc, indexMethod) => {
        const mqbMethod = `mqb${_.upperFirst(indexMethod)}`
        const getQb = (args) => {
          const opts = Object.assign({},
            typeof _.last(args) === 'object' && args.pop(),
            {[indexMethod]: [indexKey].concat(args)}
          )

          return model.mqb.configure(opts)
        }

        acc[mqbMethod] = (...args) => {
          return getQb(args)
        }

        acc[indexMethod] = (...args) => {
          return getQb(args).fetch()
        }

        if (!model.hasOwnProperty(mqbMethod)) {
          Object.defineProperty(model, mqbMethod, {
            value: acc[mqbMethod]
          })
        }

        if (!model.hasOwnProperty(indexMethod)) {
          Object.defineProperty(model, indexMethod, {
            value: acc[indexMethod]
          })
        }

        return acc
      }, {})
    }
  })

  Object.defineProperty(model, 'indexes', {
    configurable: true,
    enumerable: false,
    value: indexes,
    writable: false
  })

  return model
}

function bootstrapModelPartitions (model) {
  const partitionsModels = createPartitionsModels(model)

  Object.defineProperty(model, 'partitionsModels', {
    value: partitionsModels
  })

  model._hooksTypes.length = 0
  model._hooksTypes.push.apply(model._hooksTypes, getHooksTypes(model))

  Object.keys(partitionsModels).forEach((key) => {
    if (key !== 'main') {
      const partitionModel = partitionsModels[key]

      partitionModel.boot(model.db)

      Object.defineProperty(model.db._models, partitionModel.modelName, {
        configurable: true,
        enumerable: false,
        value: partitionModel,
        writable: false
      })
    }
  })

  return model
}

function bootstrapModelRelations (model) {
  if ((model.typeEdge || model.join) && !EdgeModel.isInheritedModel(model)) {
    throw new Error(`Model "${model.name}" doesn't extend EdgeModel class`)
  }

  if (!model.typeEdge && EdgeModel.isInheritedModel(model)) {
    throw new Error(`Collection "${design.name} isn't an edge collection (model: ${model.name})"`)
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

  Object.defineProperty(model.prototype, '_rel', {
    get () {
      return model.relationsKeys.reduce((acc, relName) => {
        const {unary} = this.constructor.relationsPlans[relName]

        acc[relName] = SAVE_REL_OPTS.reduce((api, optName) => {
          api[optName] = (relDocs, opts) => {
            opts = Object.assign({}, opts, {[optName]: true})

            return api.save(relDocs, opts)
          }

          return api
        }, {
          get: (opts) => {
            return getRelationData(model, relName, this, opts)
          },
          load: (opts) => {
            return getAndLoadRelationData(model, relName, this, opts)
          },
          save: (relDocs, opts) => {
            return this.constructor.saveRelation(relName, this, relDocs, opts)
          },
        })

        return acc
      }, SAVE_REL_OPTS.reduce((acc, optName) => {
        acc[optName] = (relDocs, opts) => {
          opts = Object.assign({}, opts, {[optName]: true})

          return acc.save(relDocs, opts)
        }

        return acc
      }, {
        get: (...args) => {
          const relDocsOpts = castGetRelationArguments(args)

          return Object.keys(relDocsOpts).reduce((acc, key) => {
            acc[key] = getRelationData(model, key, this, relDocsOpts[key])

            return acc
          }, {})
        },
        load: (...args) => {
          const relDocsOpts = castGetRelationArguments(args)

          return Object.keys(relDocsOpts).reduce((doc, key) => {
            return getAndLoadRelationData(model, key, doc, relDocsOpts[key])
          }, this)
        },
        save: (relDocs, opts) => {
          return Object.keys(relDocs).reduce((doc, key) => {
            return doc.constructor.saveRelation(key, doc, relDocs[key], opts)
          }, this)
        }
      }))
    }
  })

  return model
}

function castGetRelationArguments (args) {
  let relDocsOpts

  if (args.length === 1) {
    relDocsOpts = args[0]
  } else if (args.length === 2 && _.isPlainObject(args[0]) && _.isPlainObject(args[0])) {
    relDocsOpts = Object.keys(args[0]).reduce((acc, key) => {
      acc[key] = Object.assign({}, args[0][key], args[1])

      return acc
    }, {})
  } else {
    relDocsOpts = args
  }

  if (typeof relDocsOpts === 'string') {
    relDocsOpts = _.castArray(relDocsOpts)
  }

  if (Array.isArray(relDocsOpts)) {
    const relNames = _.flattenDeep(relDocsOpts)
    const relOpts = relNames.length > 1 && typeof _.last(relNames) === 'object' ? relNames.pop() : true

    relDocsOpts = relNames.reduce((acc, key) => {
      acc[key] = relOpts

      return acc
    }, {})
  }

  return relDocsOpts
}

function createPartitionsModels (model) {
  const partitionsModels = {}
  const partitionsPlans = getModelPartitionsPlans(model)

  Object.keys(partitionsPlans).forEach((key) => {
    const plan = partitionsPlans[key]
    const collection = model.db._collection(plan.collectionName)

    if (!collection) {
      throw new ArangoError({
        errorNum: errors.ERROR_ARANGO_COLLECTION_NOT_FOUND.code,
        errorMessage: `partition ${errors.ERROR_ARANGO_COLLECTION_NOT_FOUND.message} "${plan.collectionName}" (model: ${model.name})`
      })
    }

    const partitionModel = key === 'main' ? model : class PartitionModel extends model {
      static get collection () {
        return collection
      }

      static get collectionName () {
        return plan.collectionName
      }

      static get db () {
        return model.db
      }

      static get design () {
        return plan.design
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

      static get partitionMoveAfterEvent () {
        return plan.moveAfterEvent
      }

      static get partitionMoveBeforeEvent () {
        return plan.moveBeforeEvent
      }

      static get partitionMoveMethod () {
        return plan.moveMethod
      }

      static get partitionName () {
        return plan.name
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
      [`_${key}`]: {
        get: function () {
          return this.partition === key
        }
      }
    })

    Object.defineProperty(model.prototype, `_${key}`, {
      get: function () {
        return this.partition === key
      }
    })

    if (key === 'main') {
      Object.defineProperties(model, {
        'partition': {
          value: key
        },
        'partitionMoveAfterEvent': {
          value: plan.moveAfterEvent
        },
        'partitionMoveBeforeEvent': {
          value: plan.moveBeforeEvent
        },
        'partitionMoveMethod': {
          value: plan.moveMethod
        },
        'partitionName': {
          value: plan.name
        },
        'partitionTimestamp': {
          value: plan.timestampKey
        }
      })
    } else {
      Object.defineProperty(partitionModel, `_${key}`, {
        value: true
      })

      Object.defineProperty(partitionModel.prototype, `_${key}`, {
        value: true
      })
    }

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
        [`clean${plan.name}`]: {
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

function getCollectionType (model) {
  return model.collection.type()
}

function getDocumentName (model) {
  return inflect.camelize(inflect.singularize(model.name), false)
}

function getDocumentsName (model) {
  return inflect.camelize(inflect.pluralize(model.name), false)
}

function getEdgeRelations (model) {
  const jointure = model.join

  // const fromModel = model.db._models(jointure.from)
  // const toModel = model.db._models(jointure.to)

  // if (!fromModel) {
  //   throw new Error(`Model "${model.name}" reference unknow model "${jointure.from}"`)
  // }

  // if (!toModel) {
  //   throw new Error(`Model "${model.name}" reference unknow model "${jointure.to}"`)
  // }

  // let fromRelName = fromModel.documentName
  // let toRelName = toModel.documentName

  // let fromModelName = fromModel.name
  // let toModelName = toModel.name
  let fromModelName = jointure.from
  let toModelName = jointure.to

  // if (fromModel === toModel) {
  //   toRelName += '2'
  //   fromModelName += '.from'
  //   toModelName += '.to'
  // }

  return {
    origin: fromModelName,
    target: toModelName,
    // [fromRelName]: fromModelName,
    // [toRelName]: toModelName
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
  return (obj) => {
    let out = Object.assign({}, obj)

    return out
  }
}

function getHooksTypes (model) {
  return [].concat(
    'attachRelation',
    'bootstrap',
    'create',
    'detachRelation',
    'moveInto',
    'query',
    'remove',
    'replace',
    'save',
    'saveRelation',
    'setup',
    'teardown',
    'update',
    !model.bootstrapped ? [] : Object.keys(model.partitionsModels).map((key) => {
      return model.partitionsModels[key].partitionMoveMethod
    })
  )
  .map((methodName) => _.upperFirst(methodName))
  .reduce((acc, methodName) => {
    return acc.concat(
      `before${methodName}`,
      `after${methodName}`
    )
  }, [])
}

function getMetaAttributes (model) {
  return [].concat(
    model.metaInternals || [],
    model.metaTimestamps || []
  )
}

function getMetaInternalAttributes (model) {
  return [].concat(
    INTERNAL_ATTRIBUTES,
    INTERNAL_EXTENDED_ATTRIBUTES,
    model.typeEdge ? INTERNAL_EDGE_ATTRIBUTES : []
  )
}

function getMetaTimestampAttributes (model) {
  return [].concat(
    model.createTimestamp || [],
    model.updateTimestamp || [],
    Object.keys(model.partitionsModels)
      .map((key) => model.partitionsModels[key].partitionTimestamp || [])
  )
}

function getModelController (model) {
  const controllerBaseUri = `/${model.documentsName}`
  const controllerName = `${_.upperFirst(model.documentsName)}Controller`

  return class extends require('./controller').Model {
    static get baseUri () {
      return controllerBaseUri
    }

    static get model () {
      return model
    }

    static get name () {
      return controllerName
    }
  }
}

function getModelIndexesKeys (model) {
  return Object.keys(model.indexes).reduce((acc, key) => {
    let {type} = model.indexes[key]

    if (type === 'geo2') {
      type = 'geo'
    }

    acc[type] = [].concat(acc[type] || [], key)

    return acc
  }, {})
}

function getModelName (model) {
  return model.name + (model.partition && model.partition !== 'main' ? model.partitionName : '')
}

function getModelPartitionsPlans (model) {
  const partitionsPlans = {}
  const design = getModelSchema(model)

  partitionsPlans.main = {
    collectionName: design.name,
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
    const plan = Object.assign({name: null, collectionName: null}, partitionsPlans[key])

    plan.name = partitionName

    if (key === 'main') {
      plan.collectionName = design.name
    } else if (!plan.collectionName) {
      plan.collectionName = `${design.name}_${key}`
    }

    plan.design = Object.assign({}, design, {name: plan.collectionName})

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

    plan.moveBeforeEvent = `before${_.upperFirst(plan.moveMethod)}`
    plan.moveAfterEvent = `after${_.upperFirst(plan.moveMethod)}`

    partitionsPlans[key] = plan
  })

  return partitionsPlans
}

function getModelQueryBuilder (model) {
  return new MQB(model)
}

function getModelSchema (model) {
  const design = Object.assign(
    {
      name: null,
      type: null,
      indexes: null
    },
    model.design
  )

  design.type = EdgeModel.isInheritedModel(model) ? EDGE_COLLECTION_TYPE : DOCUMENT_COLLECTION_TYPE

  if (!design.name) {
    if (design.type === EDGE_COLLECTION_TYPE) {
      design.name = inflect.underscore(model.name)
        .split('_')
        .map((x) => inflect.pluralize(x))
        .join('_')
    } else {
      design.name = inflect.underscore(inflect.pluralize(model.name))
    }
  }

  design.indexes = _.cloneDeep(design.indexes || {})

  Object.keys(design.indexes).forEach((key) => {
    if (!Array.isArray(design.indexes[key].fields)) {
      design.indexes[key].fields = _.castArray(design.indexes[key].fields)
    }
  })

  return design
}

function getModelTimestampAttributes (model) {
  return [].concat(
    model.metaTimestamps || [],
    model.timestamps || []
  )
}

function getAndLoadRelationData (model, relName, doc, opts) {
  const relDocs = getRelationData(model, relName, doc, opts)
  const {unary} = model.relationsPlans[relName]

  if (!unary && Array.isArray(doc[relName])) {
    doc[relName] = doc[relName]
      .filter(({_id}) => !relDocs.find((relDoc) => _id === relDoc._id))
      .concat(relDocs)
  } else {
    doc[relName] = relDocs
  }

  return doc
}

function getRelationData (model, relName, doc, opts) {
  const {unary} = model.relationsPlans[relName]
  const result = model.mqb
    .configure({[relName]: opts})
    .filter('_id', AQB(doc._id))
    .first()
    .keep(relName)
    .fetch()
  
  if (result) {
    return result[relName]
  }
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
        pivot: model,
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

function getValidationSchema (model) {
  const keys = {}

  model.metaInternals.forEach((prop) => {
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

function removeHook (hooks, hooksTypes, type, name) {
  if (hooksTypes && hooksTypes.indexOf(type) === -1) {
    throw new Error(`Remove hook failed: unknow type "${type}"`)
  }

  if (typeof name === 'function') {
    name = name.name
  }

  if (!name || typeof name !== 'string') {
    throw new Error(`Remove hook failed: missing name`)
  }

  if (hooks[type] && hooks[type][name]) {
    delete hooks[type][name]
  }

  return this
}

function runHook (model, type, args) {
  if (arguments.length < 3) {
    args = []
  }

  if (!Array.isArray(args)) {
    args = [args]
  }

  let doc

  if (model._modelInstance) {
    doc = model
    model = doc.constructor
  }

  if (model.hooksTypes.indexOf(type) === -1) {
    throw new Error(`Run hook failed: unknow type "${type}"`)
  }

  const globalHooks = model.globalHooks[type]
  const hooks = model.hooks[type]

  if (globalHooks) {
    Object.getOwnPropertyNames(globalHooks).forEach((key) => {
      const fn = globalHooks[key]

      fn.apply(null, [model].concat(args))
    })
  }

  if (hooks) {
    Object.getOwnPropertyNames(hooks).forEach((key) => {
      const fn = hooks[key]

      fn.apply(null, args)
    })
  }

  model.emitGlobal.apply(model, [type, model].concat(args))

  model.emit.apply(model, [type].concat(args))

  if (doc) {
    doc._emit.apply(doc, [type].concat(args))
  }

  return model
}

Object.getOwnPropertyNames(EE.prototype).forEach((key) => {
  if (~['constructor', 'length', 'name', 'prototype'].indexOf(key)) {
    return
  }

  const desc = Object.getOwnPropertyDescriptor(EE.prototype, key)

  if (typeof GLOBAL_EE[key] === 'function') {
    GLOBAL_EE[key] = function (...args) {
      EE.prototype[key].apply(GLOBAL_EE, args)
      return this
    }
  }

  Object.defineProperty(Model, key, desc)
  Object.defineProperty(Model, key.concat('Global'), {get: () => GLOBAL_EE[key]})
  Object.defineProperty(Model.prototype, '_'.concat(key), desc)
})

module.exports = Model
