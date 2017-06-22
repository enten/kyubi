const _ = require('lodash')
const AQB = require('aqb')
const {ArangoError, ArangoQueryCursor, errors} = require('@arangodb')
const {ForExpression} = require('aqb/types')

const DEFAULT = {
  FILTER_COMPARATOR: 'eq',
  FILTER_OPERATOR: 'and',
  LIMIT_PER_PAGE: 20,
  SORT_ATTRIBUTE: '_key',
  SORT_ORDER: 'ASC'
}

const FILTER_COMPARATORS = {
  '==': 'eq',
  'EQ': 'eq',
  'eq': 'eq',
  '>': 'gt',
  'GT': 'gt',
  'gt': 'gt',
  '>=': 'gte',
  'GTE': 'gte',
  'gte': 'gte',
  '<': 'lt',
  'LT': 'lt',
  'lt': 'lt',
  '<=': 'lte',
  'LTE': 'lte',
  'lte': 'lte',
  '!=': 'neq',
  'NEQ': 'neq',
  'neq': 'neq',
  'IN': 'in',
  'in': 'in',
  'NOT IN': 'not in',
  'not in': 'not in',
  // 'LIKE': 'like',
  // 'like': 'like',
  // '=~': '=~',
  // 'MATCH': '=~',
  // 'match': '=~',
  // '!~': '!~',
  // 'NOT MATCH': '!~',
  // 'not match': '!~'
}

const FILTER_COMPARATORS_INVERSED = {
  '==': 'neq',
  'EQ': 'neq',
  'eq': 'neq',
  '>': 'lte',
  'GT': 'lte',
  'gt': 'lte',
  '>=': 'lt',
  'GTE': 'lt',
  'gte': 'lt',
  '<': 'gte',
  'LT': 'gte',
  'lt': 'gte',
  '<=': 'gt',
  'LTE': 'gt',
  'lte': 'gt',
  '!=': 'eq',
  'NEQ': 'eq',
  'neq': 'eq',
  'IN': 'not in',
  'in': 'not in',
  'NOT IN': 'in',
  'not in': 'in',
  // 'LIKE': 'not like',
  // 'like': 'not like',
  // '=~': '!~',
  // 'MATCH': '!~',
  // 'match': '!~',
  // '!~': '=~',
  // 'NOT MATCH': '=~',
  // 'not match': '=~'
}

const HAS_FILTER_COMPARATORS_KEYS = [
  '==',
  'EQ',
  'eq',
  '>',
  'GT',
  'gt',
  '>=',
  'GTE',
  'gte',
  '<',
  'LT',
  'lt',
  '<=',
  'LTE',
  'lte',
  '!=',
  'NEQ',
  'neq'
]

const HAS_FILTER_COMPARATORS = _.pick(FILTER_COMPARATORS, HAS_FILTER_COMPARATORS_KEYS)

const HAS_FILTER_COMPARATORS_INVERSED = _.pick(FILTER_COMPARATORS_INVERSED, HAS_FILTER_COMPARATORS_KEYS)

const FILTER_OPERATORS = {
  '&&': 'and',
  'AND': 'and',
  'and': 'and',
  '||': 'or',
  'OR': 'or',
  'or': 'or'
}

const FILTER_OPERATORS_INVERSED = {
  '&&': 'or',
  'AND': 'or',
  'and': 'or',
  '||': 'and',
  'OR': 'and',
  'or': 'and'
}

const SORT_DIRECTIONS = [
  'ASC',
  'DESC'
]

const SORT_DIRECTIONS_INVERSED = {
  ASC: 'DESC',
  DESC: 'ASC'
}

const API_OPTIONS = {
  cast: true,
  count: false,
  distinct: false,
  document: null,
  edges: null,
  example: null,
  for: null,
  first: false,
  filter: null,
  has: null,
  hasNot: null,
  in: null,
  inverse: false,
  keep: null,
  limit: null,
  last: false,
  notFilter: null,
  pair: null,
  pluck: null,
  relations: null,
  return: null,
  sort: null,
  sortRand: false,
  trashed: false,
  with: null,
  withCount: null,
  withEdges: null
}

const API_MIXINS = {
  a: AQB,
  aqb: AQB,
  configure (opts, excluded) {
    if (opts) {
      if (typeof opts === 'string') {
        return this.for(opts)
      }

      if (typeof opts === 'function') {
        return opts(this, this.model, this.model.db._models)
      }

      excluded = [].concat(excluded || [])

      let api = this
      const setterKeys = getApiSetterKeys(api)

      Object.keys(opts).forEach((key) => {
        if (~setterKeys.indexOf(key) && excluded.indexOf(key) === -1) {
          api = api[key].apply(api, _.castArray(opts[key]))
        }
      })

      return api
    }

    return this
  },
  fetch () {
    return this.run()
  },
  fork (model, newOpts) {
    return forkApi(model, this, newOpts)
  },
  isOptionsObject (obj) {
    if (!_.isPlainObject(obj)) {
      return false
    }

    const objKeys = Object.keys(obj)
    const setterKeys = getApiSetterKeys(this)

    if (_.without.apply(null, [objKeys].concat(setterKeys)).length) {
      return false
    }

    return true
  },
  iterate (iterator) {
    const cursor = this.fetch()
    const result = []

    for (
      let index = 0;
      cursor.hasNext();
      result.push(iterator(cursor.next(), index++, cursor))
    );

    cursor.dispose()

    return result
  },
  run () {
    const {count, document, first, last, pair, pluck} = this.opts
    let cursor = new ModelQueryCursor(this)

    if (count || first || last || pair) {
      return cursor.hasNext() ? cursor.next() : null
    }

    return cursor
  },
  toAQB () {
    if (!this._query) {
      Object.defineProperty(this, '_query', {
        configurable: false,
        enumerable: false,
        value: inflateQuery(this),
        writable: false
      })
    }

    return this._query
  },
  toAQL () {
    return this.toAQB().toAQL()
  },
  _PRINT (context) {
    context.output += `ModelQueryBuilder (${this.model.modelName})`
    context.output += ' '
    printObject(this.opts, context)
  }
}

const API_SETTERS = {
  cast (...args) {
    return setBitValue(this, 'cast', args)
  },
  count (...args) {
    return setBitValue(this, 'count', args)
  },
  distinct (...args) {
    return setBitValue(this, 'distinct', args)
  },
  document (...args) {
    let api = setApiValue(this, 'document', args.length > 1 ? args : args[0])

    if (api.opts.document) {
      api = setApiValue(api, 'first', !Array.isArray(api.opts.document))
    }

    return api
  },
  example (...args) {
    return setCumulableNaryValues(this, 'example', _.flattenDeep(args))
  },
  filter (...args) {
    return setCumulableNaryArgs(this, 'filter', args)
  },
  filters (...args) {
    return setCumulableNaryArgsList(this, 'filter', args)
  },
  first (...args) {
    let api = setBitValue(this, 'first', args)

    api = setApiValue(api, 'last', false)

    return api
  },
  for (...args) {
    if (args.length) {
      return setApiValue(this, 'for', args[0] || null)
    }

    return this
  },
  has (...args) {
    return setCumulableNaryArgs(this, 'has', args)
  },
  hasNot (...args) {
    return setCumulableNaryArgs(this, 'hasNot', args)
  },
  in (...args) {
    if (args.length) {
      return setApiValue(this, 'in', args[0] || null)
    }

    return this
  },
  inverse (...args) {
    return setBitValue(this, 'inverse', args)
  },
  keep (...args) {
    if (args.length) {
      let api = setCumulableNaryValues(this, 'keep', _.flattenDeep(args))

      api = setApiValue(api, 'pair', null)
      api = setApiValue(api, 'pluck', null)

      return api
    }

    return this
  },
  limit (...args) {
    if (!isEmptyArgs(args)) {
      let limit = null

      if (!isFalsyArgs(args)) {
        limit = _.flattenDeep(args).slice(0, 2)
      }

      let api = setApiValue(this, 'limit', limit)

      api = setApiValue(api, 'first', false)
      api = setApiValue(api, 'last', false)

      return api
    }

    return this
  },
  last (...args) {
    let api = setBitValue(this, 'last', args)

    api = setApiValue(api, 'first', false)

    return api
  },
  notFilter (...args) {
    return setCumulableNaryArgs(this, 'notFilter', args)
  },
  notFilters (...args) {
    return setCumulableNaryArgsList(this, 'notFilter', args)
  },
  page (...args) {
    if (!isEmptyArgs(args)) {
      let limit = null

      if (!isFalsyArgs(args)) {
        let [page, perPage] = _.flattenDeep(args)

        page = (page || 1) - 1
        perPage = perPage || this.model.pageSize || DEFAULT.LIMIT_PER_PAGE

        limit = [page * perPage, perPage]
      }

      return this.limit(limit)
    }

    return this
  },
  pair (...args) {
    if (!isEmptyArgs(args)) {
      let pair = null

      if (!isFalsyArgs(args)) {
        pair = _.flattenDeep(args).slice(0, 2)
      }

      if (pair.length === 1) {
        pair[1] = pair[0]
      }

      let api = setApiValue(this, 'pair', pair)

      api = setApiValue(api, 'keep', null)
      api = setApiValue(api, 'pluck', null)

      return api
    }

    return this
  },
  pick (...args) {
    if (!isEmptyArgs(args)) {
      args = _.flattenDeep(args)

      let api = this.limit(args[0])

      if (api.opts.limit) {
        api = setApiValue(api, 'inverse', !!args[1])
      }

      return api
    }

    return this
  },
  pickInverse (...args) {
    return this.pick(args[0], true)
  },
  pluck (...args) {
    if (args.length) {
      let api = setApiValue(this, 'pluck', args[0])

      api = setApiValue(api, 'cast', false)
      api = setApiValue(api, 'keep', null)
      api = setApiValue(api, 'pair', null)

      return api
    }

    return this
  },
  return (...args) {
    if (args.length) {
      return setApiValue(this, 'return', args[0])
    }

    return this
  },
  sort (...args) {
    let api = setCumulableNaryArgs(this, 'sort', args)

    if (api.opts.sort && api.opts.sortRand) {
      api = setApiValue(api, 'sortRand', false)
    }

    return api
  },
  sortRand (...args) {
    return setBitValue(this, 'sortRand', args)
  },
  trashed (...args) {
    return setBitValue(this, 'trashed', args)
  },
  with (...args) {
    return setCumulableNaryArgs(this, 'with', args)
  },
  withCount (...args) {
    return setBitValue(this, 'withCount', args)
  },
  withEdges (...args) {
    return setBitValue(this, 'withEdges', args)
  }
}

const API_SETTERS_KEYS = Object.keys(API_SETTERS)

const API_FULLTEXT_METHODS = {
  byText: 'FULLTEXT'
}

const API_GEO_METHODS = {
  near: 'NEAR',
  within: 'WITHIN',
  withinRectangle: 'WITHIN_RECTANGLE'
}

const API_INDEXES_SETTERS = [
  ['fulltext', API_FULLTEXT_METHODS],
  ['geo', API_GEO_METHODS]
].reduce((acc, [indexType, methods]) => {
  acc[indexType] = Object.keys(methods).reduce((api, key) => {
    api[key] = function (...args) {
      let indexKey

      if (~this.model.indexesKeys[indexType].indexOf(args[0])) {
        indexKey = args.shift()
      } else {
        indexKey = this.model.indexesKeys[indexType][0]
      }

      return setApiValue(this, 'indexFilter', isFalsyArgs(args) ? null : {
        key: indexKey,
        type: indexType,
        method: methods[key],
        args
      })
    }

    return api
  }, {})

  return acc
}, {})

const API_INDEXES_SETTERS_KEYS = Object.keys(API_INDEXES_SETTERS).reduce((acc, key) => {
  acc[key] = Object.keys(API_INDEXES_SETTERS[key])

  return acc
}, {})

const API_PROTO = Object.assign({}, API_MIXINS, API_SETTERS)

function ForExpression2 (prev, varname, expr) {
  this._prev = null
  this._varname = AQB.expr(Array.isArray(varname) ? varname.join(', ') : varname)
  this._expr = AQB.expr(expr)
}
ForExpression2.prototype = Object.create(ForExpression.prototype)
ForExpression2.prototype.constructor = ForExpression2

class ModelQueryCursor extends ArangoQueryCursor {
  constructor (qb) {
    const {_database, data} = qb.model.query(qb)

    super(_database, data)

    Object.keys(qb.model.partitionsModels).forEach((key) => {
      const {partitionMoveMethod} = qb.model.partitionsModels[key]

      Object.defineProperty(this, partitionMoveMethod, {
        value: (opts) => {
          return this.moveInto(key, opts)
        }
      })
    })

    this.qb = qb
    this.transformers = []
  }

  count () {
    return this._count
  }

  fill (...args) {
    this.transformers.push((doc) => this.qb.model.fill.apply(this.qb.model, [doc].concat(args)))

    return this
  }

  fillInternals (...args) {
    this.transformers.push((doc) => this.qb.model.fillInternals.apply(this.qb.model, [doc].concat(args)))

    return this
  }

  first (cast) {
    if (!this.hasOwnProperty('_first') && this.hasNext()) {
      this.next(cast)
    }

    this.dispose()

    return this._first || null
  }

  forEach (cast, fn) {
    if (typeof cast === 'function') {
      fn = cast
      cast = undefined
    }

    for (
      let i = 0;
      this.hasNext();
      fn(this.next(cast), i++, this)
    );

    this.dispose()
  }

  iterate (cast, fn) {
    return this.map(cast, fn)
  }

  last (cast) {
    for (
      ;
      this.hasNext();
      this.next(cast)
    );

    this.dispose()

    return this._last || null
  }

  map (cast, fn) {
    if (typeof cast === 'function') {
      fn = cast
      cast = undefined
    }

    const result = []

    for (
      let i = 0;
      this.hasNext();
      result.push(fn(this.next(cast), i++, this))
    );

    this.dispose()

    return result
  }

  moveInto (partitionModel, opts) {
    return this.map((doc) => {
      return this.qb.model.moveInto(partitionModel, doc, opts)
    })
  }

  next (cast) {
    let doc = super.next()

    if (cast != null ? cast != false : (this.qb && this.qb.opts.cast != false)) {
      doc = this.qb.model.castQueryResult(doc, this.qb)
    }

    if (this.qb.opts.document) {
      if (!doc) {
        throw new ArangoError({
          errorNum: errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.code,
          errorMessage: `${errors.ERROR_ARANGO_DOCUMENT_NOT_FOUND.message}: ${JSON.stringify(this.qb.opts.document)}`
        })
      }

      if (doc._rev && typeof this.qb.opts.document._rev === 'string' && doc._rev !== this.qb.opts.document._rev) {
        throw new ArangoError({
          errorNum: errors.ERROR_HTTP_PRECONDITION_FAILED.code,
          errorMessage: `${errors.ERROR_HTTP_PRECONDITION_FAILED.message}: bad revision "${doc._rev}" (expect "${this.qb.opts.document._rev}")`
        })
      }
    }

    doc = this.transformers.reduce((acc, transform) => transform(acc), doc)

    if (!this.hasOwnProperty('_first')) {
      this._first = doc
    }

    if (doc && !this.hasNext() && !this.hasOwnProperty('_last')) {
      this._last = doc
    }

    return doc
  }

  pair (...args) {
    args = _.flattenDeep(args)

    let [left, right] = args

    if (args.length < 2) {
      right = left
    }

    return this.reduce((acc, doc) => {
      acc[doc[left]] = doc[right]

      return acc
    }, {})
  }

  pick (cast, count) {
    if (typeof cast === 'number') {
      count = cast
      cast = undefined
    }

    const result = []

    for (
      let i = 0;
      this.hasNext() && i++ < count;
      result.push(this.next(cast))
    );

    this.dispose()

    return result
  }

  pickInverse (cast, count) {
    if (typeof cast === 'number') {
      count = cast
      cast = undefined
    }

    const result = []

    while (this.hasNext()) {
      for (; result.length >= count; result.shift());

      result.push(this.next(cast))
    }

    this.dispose()

    return result.reverse()
  }

  pluck (key) {
    return this.map((doc) => doc[key])
  }

  reduce (cast, fn, acc) {
    if (typeof cast === 'function') {
      acc = fn
      fn = cast
      cast = undefined
    }

    if (!this.hasNext()) {
      return acc
    }

    if (arguments.length < 2) {
      acc = this.next(cast)
    }

    for (
      let i = 0;
      this.hasNext();
      (acc = fn(acc, this.next(cast), i++, this))
    );

    this.dispose()

    return acc
  }

  _PRINT (context) {
    context.output += this.toString()
  }
}

;[
  'remove',
  'replace',
  'update'
].forEach((methodName) => {
  ModelQueryCursor.prototype[methodName] = function (opts) {
    return this.map((doc) => {
      return this.qb.model[methodName].call(this.qb.model, doc, opts)
    })
  }
})

function MQB (model, opts, excluded) {
  let api = createApi(Object.assign({}, API_PROTO, {
    model,
    opts: API_OPTIONS
  }))

  if (model.queryScopes) {
    Object.keys(model.queryScopes).forEach((key) => {
      api[key] = function (...args) {
        return model.queryScopes[key].apply(this, [].concat(this, args))
      }
    })
  }

  if (model.fulltext) {
    Object.assign(api, API_INDEXES_SETTERS.fulltext)
  }

  if (model.geo) {
    Object.assign(api, API_INDEXES_SETTERS.geo)
  }

  model.relationsKeys.forEach((key) => {
    api[key] = function (value) {
      const relations = Object.assign({}, this.opts.relations)
      const {pivots, pivotsSetters, target} = model.relationsPlans[key]
      const pivotsSettersLength = pivotsSetters && pivotsSetters.length
      const validPivots = pivots && pivots.map((x, i) => i + ' - ' + x.name).join(', ')
      const qb = target.mqb

      if (value) {
        qb.configure = function () {
          if (!model.typeEdge) {
            this.edge = function (pivotIndex, pivotValue) {
              if (typeof pivotIndex !== 'number' && typeof pivotIndex !== 'string') {
                pivotValue = pivotIndex
                pivotIndex = 0
              }

              if (typeof pivotIndex === 'string') {
                if (!isNaN(Number(pivotIndex))) {
                  pivotIndex = Number(pivotIndex)
                } else {
                  const pivotName = pivotIndex
                  pivotIndex = pivots.findIndex((x) => x.name === pivotName)

                  if (pivotIndex === -1) {
                    throw new Error(`Invalid edge name "${pivotName}" (valid values: ${validPivots})`)
                  }
                }
              }

              if (typeof pivotIndex !== 'number' || pivotIndex >= pivots.length) {
                throw new Error(`Invalid edge index "${pivotIndex}" (valid values: ${validPivots})`)
              }

              const edges = Object.assign({}, this.opts.edges)
              const pivot = pivots[pivotIndex]

              if (pivotValue == false) {
                delete edges[pivotIndex]
              } else {
                if (!edges[pivotIndex]) {
                  edges[pivotIndex] = pivot.mqb
                }

                if (~['object', 'function'].indexOf(typeof pivotValue)) {
                  edges[pivotIndex] = edges[pivotIndex].configure(pivotValue)
                }
              }

              return setApiValue(this, 'edges', edges)
            }

            this.edges = function (pivotsValues) {
              return Object.keys(pivotsValues)
                .reduce((acc, key) => acc.edge(key, pivotsValues[key]), this)
            }

            for (let i = 0; i < pivotsSettersLength; i += 2) {
              const pivotSetter = function (pivotValue) {
                return this.edge(i / 2, pivotValue)
              }

              this[pivotsSetters[i]] = pivotSetter
              this[pivotsSetters[i + 1]] = pivotSetter

              if (i + 2 >= pivotsSettersLength) {
                this.pivot = pivotSetter
              }
            }
          }

          let newApi = API_MIXINS.configure.apply(this, arguments)

          ;[
            this,
            newApi
          ].forEach((builder) => {
            delete builder.has
            delete builder.hasNot

            if (!model.typeEdge) {
              delete builder.pivot

              pivotsSetters.forEach((setterName) => {
                delete builder[setterName]
              })

              delete builder.edges
              delete builder.edge
            }
          })

          return newApi
        }
      }

      if (value == false) {
        delete relations[key]
      } else {
        if (!relations[key]) {
          relations[key] = qb
        }

        if (~['object', 'function'].indexOf(typeof value)) {
          relations[key] = relations[key].configure(value)
        }
      }

      return setApiValue(this, 'relations', relations)
    }
  })

  if (opts) {
    api = api.configure(opts, excluded)
  }

  return api
}

function computeProperty (compute, docName) {
  let result

  if (typeof compute === 'function') {
    compute = compute({
      attr: (attrKey) => `${docName}.${attrKey}`
    })
  }

  if (compute) {
    result = isAQBObject(compute) ? compute : AQB.expr(compute)
  }

  return result
}

function createApi (parentApi, newOpts) {
  const api = function (opts, excluded) {
    return api.configure(opts, excluded)
  }

  Object.assign(api, parentApi)

  Object.defineProperties(api, {
    model: {
      configurable: true,
      enumerable: false,
      value: parentApi.model,
      writable: false
    },
    opts: {
      configurable: false,
      enumerable: false,
      value: Object.assign({}, parentApi.opts, newOpts),
      writable: false
    }
  })

  return api
}

function forkApi (model, parentApi, newOpts) {
  const api = createApi(parentApi, newOpts)

  Object.defineProperty(api, 'model', {
    configurable: true,
    enumerable: false,
    value: model || parentApi.model,
    writable: false
  })

  return api
}

function getApiSetterKeys (api) {
  let setterKeys = [].concat(API_SETTERS_KEYS)

  if (api.model.queryScopes) {
    setterKeys = setterKeys.concat(Object.keys(api.model.queryScopes))
  }

  if (api.model.fulltext) {
    setterKeys = setterKeys.concat(API_INDEXES_SETTERS_KEYS.fulltext)
  }

  if (api.model.geo) {
    setterKeys = setterKeys.concat(API_INDEXES_SETTERS_KEYS.geo)
  }

  if (api.model.relations) {
    setterKeys = setterKeys.concat(Object.keys(api.model.relations))
  }

  if (!api.model.typeEdge) {
    ;[
      'edge',
      'edges',
      'pivot'
    ].forEach((key) => {
      if (typeof api[key] === 'function') {
        setterKeys = setterKeys.concat(key)
      }
    })

    const {relationsPlans} = api.model

    Object.keys(relationsPlans).forEach((key)=> {
      relationsPlans[key].pivotsSetters.forEach((setterName) => {
        if (setterKeys.indexOf(setterName) === -1 && typeof api[setterName] === 'function') {
          setterKeys = setterKeys.concat(setterName)
        }
      })
    })
  }

  return setterKeys
}

function inflateQuery (api) {
  if (api.opts.trashed) {
    if (!api.model.trashed) {
      throw new Error(`Static getter "collectionTrashedName" is missing (model: ${api.model.name})`)
    }

    api = api.fork(api.model.trashed, {trashed: false})
  }

  const {model, opts} = api
  const docName = Array.isArray(opts.for) ? opts.for[0] : typeof opts.for === 'string' ? opts.for : model.documentName
  let query

  // FOR

  if (opts.document) {
    const docId = Array.isArray(opts.document)
      ? opts.document.map((x) => typeof x === 'object' ? x._id ||x._key : x)
      : typeof opts.document === 'object' ? opts.document._id || opts.document._key : opts.document

    opts.in = AQB.expr(`(${!Array.isArray(opts.document) ? 'RETURN ' : ''}DOCUMENT(${opts.in || model.collectionName}, ${AQB(docId).toAQL()}))`)
  } else if (opts.indexFilter) {
    let indexFilter

    if (opts.indexFilter.type === 'geo') {
      indexFilter = (coll) => `${opts.indexFilter.method}(${[coll].concat(opts.indexFilter.args.map((x) => AQB(x).toAQL())).join(', ')})`
    } else {
      const index = model.indexes[opts.indexFilter.key]

      indexFilter = (coll) => `${opts.indexFilter.method}(${[].concat(coll, [].concat(index.fields[0], opts.indexFilter.args).map((x) => AQB(x).toAQL())).join(', ')})`
    }
    
    opts.in = AQB.expr(indexFilter(opts.in || model.collectionName))
  }

  query = new ForExpression2(null, opts.for || docName, opts.in || model.collectionName)

  // FILTER

  const filters = inflateQueryFilters(api, docName)

  if (filters) {
    query = filters.reduce((acc, filter) => {
      return acc.filter(filter(api, api.model, api.model.db._models))
    }, query)
  }

  // COLLECT WITH COUNT INTO and RETURN

  if (opts.count) {
    const resultVarName = `${typeof opts.for === 'string' ? opts.for : Array.isArray(opts.for) ? opts.for[0] : opts.for || model.documentsName}_count`

    query = query
      .collectWithCountInto(resultVarName)
      .return(resultVarName)
  } else {
    let merged = {}

    // Computed properties

    if (model.computed) {
      Object.keys(model.computed).forEach((key) => {
        if (
          (opts.pluck === key) ||
          (opts.pair && ~_.flattenDeep(_.castArray(opts.pair)).indexOf(key)) ||
          (opts.sort && ~_.flattenDeep(_.castArray(opts.sort)).indexOf(key)) ||
          (!opts.sort && ~_.castArray(model.sortBy).indexOf(key)) ||
          (!opts.keep || ~opts.keep.indexOf(key))
        ) {
          const computedKey = `${docName}_${key}`
          const computedValue = computeProperty(model.computed[key], docName)

          if (computedValue) {
            query = query.let(computedKey, AQB.expr(`(${computedValue.toAQL()})`))

            if (!opts.pair && !opts.pluck && (!opts.keep || ~opts.keep.indexOf(key))) {
              merged[key] = computedKey
            }
          }
        }
      })
    }

    // Populate relations

    if (opts.with) {
      _.castArray(
        Array.isArray(opts.with) && opts.with.length === 1
          ? opts.with[0]
          : opts.with
      )
      .map((value) => Array.isArray(value) ? value.join('.') : value)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .forEach((value) => {
        value.split('.').reduce((acc, key, index, arr) => {
          acc = setApiValue(acc, 'relations', Object.assign({}, acc.relations, {
            [key]: forkApi(null, acc.model.relationsPlans[key].target.mqb)
          }))

          _.set(
            api,
            arr
              .slice(0, index)
              .concat(key)
              .reduce((path, x) => path.concat('opts', 'relations', x), []),
            acc.opts.relations[key]
          )

          return acc.opts.relations[key]
        }, api)
      })

      api.opts.with = null
    }

    const hasRelations = _.flattenDeep([].concat(opts.has, opts.hasNot))
      .filter((x) => model.relationsPlans.hasOwnProperty(x))

    if (hasRelations.length && !opts.relations) {
      opts.relations = {}
    }

    hasRelations.forEach((key) => {
      if (!opts.relations[key]) {
        opts.relations[key] = model.relationsPlans[key].target.mqb.return(false)
      }
    })

    if (opts.relations) {
      Object.keys(opts.relations).forEach((key) => {
        const rel = model.relationsPlans[key]
        const relResultVarName = `${docName}_${key}`
        let hidden
        let relQb
        let relAqb

        const inheritQbOptions = (qb) => {
          if (qb.opts.cast != null || opts.cast != null) {
            qb = qb.cast(qb.opts.cast != null ? qb.opts.cast : opts.cast)
          }

          if (qb.opts.withCount != null || opts.withCount != null) {
            qb = qb.withCount(qb.opts.withCount != null ? qb.opts.withCount : opts.withCount)
          }

          if (qb.opts.withEdges != null || opts.withEdges != null) {
            qb = qb.withEdges(qb.opts.withEdges != null ? qb.opts.withEdges : opts.withEdges)
          }

          return qb
        }

        if (model.typeEdge) {
          const docRef = `${docName}_${key}`
          let qb = opts.relations[key]

          if (qb.opts.return == false) {
            hidden = true
            qb = qb.return(docRef)
          }

          relQb = inheritQbOptions(qb
            .for(docRef)
            .filter('_id', '==', `${docName}.${rel.isOrigin ? '_from' : '_to'}`)
            .first(true))

          relAqb = relQb.toAQB()
        } else {
          let prevDocRef = docName

          relAqb = rel.plans.map((plan, index) => {
            const prevPlan = rel.plans[index - 1]
            const nextPlan = rel.plans[index + 1]
            const {direction, pivot, target, traverseCursor, unary} = plan
            const docRef = `${docName}_${key}__${traverseCursor}`
            const docRefEdge = `${docRef}_edge`
            let qb = nextPlan ? target.mqb : opts.relations[key]
            let qbEdge = _.get(opts.relations[key], ['opts', 'edges', index])

            qb = inheritQbOptions(qb)
              .for(docRef)
              .in(AQB.expr(`${direction} ${prevDocRef}._id ${pivot.collectionName}`))
              .first(unary)
              .distinct(!index && rel.plans.length && nextPlan)

            if (!nextPlan/* && qbEdge*/) {
              qb = qb.for([docRef, docRefEdge])
            }

            if (!nextPlan) {
              relQb = qb
            }
            
            if (!nextPlan && !qb.opts.count && !qb.opts.pair && !qb.opts.pluck) {
              const returnedRel = parseOptionReturn(qb.opts, docRef, model.computed)
              let returnedEdge = AQB.expr(docRefEdge)

              if (qbEdge) {
                if (qbEdge.opts.count) {
                  returnedEdge = AQB.expr(`${docRef} ? 1 : 0`)
                } else {
                  returnedEdge = parseOptionReturn(qbEdge.opts, docRefEdge, model.computed)
                }
              }

              if (qb.opts.return === false) {
                hidden = true
              }

              if (qb.opts.withEdges) {
                qb = qb.return(AQB.expr(`MERGE(${returnedRel.toAQL()}, {_edge: ${returnedEdge.toAQL()}})`))
              } else {
                qb = qb.return(returnedRel)
              }
              // if (returnedEdge) {
              //   qb = qb.return(AQB.expr(`MERGE(${returnedRel.toAQL()}, {_edge: ${returnedEdge.toAQL()}})`))
              // } else if (relQb.opts.withEdges != null ? relQb.opts.withEdges != false : opts.withEdges) {
              //   qb = qb.return(returnedRel)
              // } else {
              //   qb = qb.return(AQB.expr(`UNSET(${returnedRel.toAQL()}, '_edge')`))
              // }
            }

            // Merge edges filters and sorts

            if (qbEdge) {
              const qbEdgeFilters = inflateQueryFilters(qbEdge, docRefEdge)
              const qbEdgeSorts = inflateQuerySorts(qbEdge, docRefEdge, false)

              if (qbEdgeFilters) {
                qb = qbEdgeFilters.reduce((acc, filter) => acc.filter(filter), qb)
              }

              if (qbEdgeSorts) {
                qb = qb.sort(qbEdgeSorts)
              }
            }

            prevDocRef = docRef

            return {plan, qb}
          })
          .reverse()
          .reduce((acc, {plan, qb}, index, arr) => {
            if (!acc) {
              if (qb.opts.count || qb.opts.pair) {
                return AQB.expr(`FIRST(${qb.toAQL()})`)
              }

              return qb.toAQB()
            }

            return qb
              .return(AQB.expr(`${plan.unary ? 'FIRST' : ''}(${acc.toAQL()})`))
              .toAQB()
          }, null)

          if (rel.plans.length > 1) {
            relAqb = AQB.expr(`FLATTEN(${relAqb.toAQL()}, ${rel.plans.length - 1})`)
          }
        }

        if (rel.unary || (rel.plans.length > 1 && (relQb.opts.pair || relQb.opts.count))) {
          relAqb = AQB.expr(`FIRST(${relAqb.toAQL()})`)
        }

        query = query.let(relResultVarName, relAqb)

        if (!hidden) {
          merged[key] = relResultVarName
        }

        if (relQb.opts.withCount) {
          merged[`${key}Count`] = AQB.expr(rel.unary ? `${relResultVarName} ? 1 : 0` : `LENGTH(${relResultVarName})`)
        }
      })

      // Apply "has/hasNot" filters
      ;[].concat(
        opts.has ? parseOptionHas(opts.has, docName, model, false) : [],
        opts.hasNot ? parseOptionHas(opts.hasNot, docName, model, true) : []
      ).forEach((hasFilter) => {
        query = query.filter(hasFilter)
      })
    }

    // SORT

    const sorts = inflateQuerySorts(api, docName, true)

    if (sorts) {
      query = isAQBObject(sorts) ? query.sort(sorts) : query.sort.apply(query, sorts)
    }

    // LIMIT

    if (opts.first || opts.last) {
      query = query.limit(1)
    } else if (opts.limit) {
      query = query.limit(opts.limit[0], opts.limit[1])
    }

    // RETURN

    if (opts.return != false) {
      let returned = parseOptionReturn(opts, docName, model.computed, merged)

      if (opts.distinct) {
        query = query.returnDistinct(returned)
      } else {
        query = query.return(returned)
      }

      if (opts.pair) {
        query = AQB.return(AQB.MERGE(query))
      }
    }
  }

  return query
}

function inflateQueryFilters (api, docName) {
  const {model, opts} = api
  let filters

  if (opts.example) {
    const example = parseOptionExample(opts.example)
    const exampleFilter = AQB.MATCHES(docName, AQB(example))

    filters = [].concat(filters || [], () => exampleFilter)
  }

  if (opts.filter) {
    filters = [].concat(filters || [], parseOptionFilter(opts.filter, docName, model.computed))
  }

  if (opts.notFilter) {
    filters = [].concat(filters || [], parseOptionFilter(opts.notFilter, docName, model.computed, true))
  }

  return filters
}

function inflateQuerySorts (api, docName, withDefault) {
  const {model, opts} = api
  const sortInversed = opts.inverse ? !opts.last : opts.last ? !opts.inverse : false

  if (opts.sortRand) {
    return AQB.RAND()
  }

  let sort = parseOptionSort(opts.sort, docName, model.computed)

  if (!sort.length && withDefault != false) {
    sort = parseOptionSort(model.sortBy || DEFAULT.SORT_ATTRIBUTE, docName, model.computed)

    sort = sort.map(([sortAttr, sortDirection]) => {
      return [AQB.expr(sortAttr), sortDirection]
    })
  }

  if (sortInversed) {
    sort = sort.map(([sortAttr, sortDirection]) => {
      return [sortAttr, SORT_DIRECTIONS_INVERSED[sortDirection]]
    })
  }

  if (sort.length) {
    return _.flatten(sort.map(([attr, direction]) => [
      isAQBObject(attr) ? attr : AQB.expr(attr),
      direction
    ]))
  }
}

function isAQBComparatorName (obj) {
  return typeof obj === 'string' && !!FILTER_COMPARATORS[obj]
}

function isAQBHasComparatorName (obj) {
  return typeof obj === 'string' && !!HAS_FILTER_COMPARATORS[obj]
}

function isAQBOperatorName (obj) {
  return typeof obj === 'string' && !!FILTER_OPERATORS[obj]
}

function isAQBObject (obj) {
  return !!obj && typeof obj.toAQL === 'function'
}

function isEmptyArgs (args) {
  if (Array.isArray(args)) {
    if (args.length === 1) {
      return isEmptyArgs(args[0])
    }

    return !args.reduce((acc, x) => acc.concat(x), []).length
  }

  return args == null
}

function isFalsyArgs (args) {
  if (Array.isArray(args)) {
    if (args.length === 1) {
      return isFalsyArgs(args[0])
    }

    return false
  }

  return args == false
}

function isFalsyBit (args) {
  return args.length && (args[0] == null || args[0] == false)
}

function parseOptionExample (example) {
  const exampleFilters = {}

  _.flattenDeep(_.castArray(example)).forEach((example) => {
    if (example && typeof example === 'object') {
      Object.assign(exampleFilters, example)
    }
  })

  if (typeof exampleFilters._key === 'number') {
    exampleFilters._key = String(exampleFilters)
  }

  return exampleFilters
}

function parseOptionFilter (args, docName, computed, isNot) {
  if (typeof computed === 'boolean') {
    isNot = computed
    computed = undefined
  }

  const filters = []

  if (!Array.isArray(args)) {
    return filters
  }

  args.forEach((raw) => {
    let fn

    if (raw.length === 1 && typeof raw[0] !== 'string' && !Array.isArray(raw[0])) {
      if (typeof raw[0] === 'function') {
        fn = raw[0]
      // } else if (typeof raw[0] === 'string') {
      //   fn = () => AQB.expr(raw[0])
      } else if (isAQBObject(raw[0])) {
        fn = () => raw[0]
      }
    } else if (raw.length) {
      const filter = parseOptionFilterRaw(raw, docName, computed, isNot)

      if (filter) {
        fn = () => filter
      }
    }

    if (fn) {
      filters.push(fn)
    }
  })

  return filters
}

function parseOptionFilterRaw (raw, docName, computed, isNot) {
  if (typeof computed === 'boolean') {
    isNot = computed
    computed = undefined
  }

  raw = [].concat(raw)

  let filter
  let operator

  do {
    let comparison, comparator, left, right, nextOperator

    left = raw.shift()

    if (Array.isArray(left)) {
      comparison = parseOptionFilterRaw(left, docName, computed, isNot)
    } else {
      if (isAQBComparatorName(raw[0])) {
        comparator = raw.shift()
      }

      if (comparator || (raw.length && !isAQBOperatorName(raw[0]))) {
        right = raw.shift()
      } else {
        right = true
      }
    }

    if (isAQBOperatorName(raw[0])) {
      nextOperator = raw.shift()
    }

    comparator = FILTER_COMPARATORS[comparator] || DEFAULT.FILTER_COMPARATOR
    operator = operator || DEFAULT.FILTER_OPERATOR
    nextOperator = FILTER_OPERATORS[nextOperator]

    if (left === '_key' && typeof right === 'number') {
      right = String(right)
    }

    if (docName && typeof left === 'string') {
      if (computed && computed[left]) {
        left = `${docName}_${left}`
      } else if (!left.startsWith(docName)) {
        left = [docName, left].join('.')
      }
    }

    if (isNot) {
      comparator = FILTER_COMPARATORS_INVERSED[comparator]
      // operator = FILTER_OPERATORS_INVERSED[operator]
      // nextOperator = FILTER_OPERATORS_INVERSED[nextOperator]
    }

    if (!comparison) {
      comparison = AQB[comparator].call(AQB, left, right)
    }

   if (!filter) {
     filter = comparison
   } else {
     filter = filter[operator].call(filter, comparison)
   }

    operator = nextOperator
  } while (raw.length);

  return filter
}

function parseOptionHas (args, docName, model, isNot) {
  const filters = []

  args.forEach((raw) => {
    let fn

    const filter = parseOptionHasRaw(raw, docName, model, isNot)

    if (filter) {
      filters.push(filter)
    }
  })

  return filters
}

function parseOptionHasRaw (raw, docName, model, isNot) {
  raw = [].concat(raw)

  let filter
  let operator

  do {
    let comparison, comparator, left, right, nextOperator

    left = raw.shift()

    if (Array.isArray(left)) {
      comparison = parseOptionHasRaw(left, docName, model, isNot)
    } else {
      if (isAQBHasComparatorName(raw[0])) {
        comparator = raw.shift()
      }

      if (comparator || (raw.length && !isAQBOperatorName(raw[0]) && (typeof raw[0] !== 'string' || !isNaN(Number(raw[0]))))) {
        right = raw.shift()
      } else {
        right = true
      }
    }

    if (isAQBOperatorName(raw[0])) {
      nextOperator = raw.shift()
    }

    if (!comparison && !model.relationsPlans[left]) {
      throw new Error(`Relation "${left}" doesn't exists in model ${model.name}`)
    }

    const {unary} = model.relationsPlans[left]

    comparator = HAS_FILTER_COMPARATORS[comparator]
    operator = operator || DEFAULT.FILTER_OPERATOR
    nextOperator = FILTER_OPERATORS[nextOperator]

    if (docName && typeof left === 'string' && !left.startsWith(docName)) {
      left = [docName, left].join('_')
    }

    if (unary) {
      comparator = comparator || (!!Number(right) ? 'neq' : 'eq')
      right = null
    } else {
      if (typeof left === 'string') {
        left = AQB.expr(`LENGTH(${left})`)
      }

      comparator = comparator || (!!Number(right) ? 'gte' : 'eq')

      if (typeof right !== 'number') {
        right = Number(right)
      }
    }

    if (isNot) {
      comparator = HAS_FILTER_COMPARATORS_INVERSED[comparator]
      // operator = FILTER_OPERATORS_INVERSED[operator]
      // nextOperator = FILTER_OPERATORS_INVERSED[nextOperator]
    }

    if (!comparison) {
      comparison = AQB[comparator].call(AQB, left, right)
    }

   if (!filter) {
     filter = comparison
   } else {
     filter = filter[operator].call(filter, comparison)
   }

    operator = nextOperator
  } while (raw.length);

  return filter
}

function parseOptionKeep (keep, docName, computed) {
  keep = _.compact(_.flattenDeep(_.castArray(keep)))

  if (keep.length === 1 && isAQBObject(keep[0])) {
    keep = keep[0]
  } else {
    keep = keep.reduce((acc, attr) => {
      if (isAQBObject(attr)) {
        attr = attr.toAQL()
      }

      if (typeof attr === 'string') {
        if (attr.startsWith(docName)) {
          attr = attr.substring(attr.indexOf('.') + 1)
        }

        if (!computed || !computed[attr]) {
          return acc.concat(attr)
        }
      }

      return acc
    }, [])

    keep = _.uniq([].concat(
      '_id',
      '_key',
      '_rev',
      keep
    ))

    keep = keep.length ? AQB(keep) : undefined
  }

  return keep
}

function parseOptionPair (pair, docName, computed) {
  return pair.map((attr) => {
    if (isAQBObject(attr)) {
      attr = attr.toAQL()
    }

    if (typeof attr === 'string') {
      if (computed && computed[attr]) {
        return `${docName}_${attr}`
      } else if (!attr.startsWith(docName)) {
        return [docName, attr].join('.')
      }
    }

    return attr
  })
}

function parseOptionPluck (pluck, docName, computed) {
  if (isAQBObject(pluck)) {
    pluck = pluck.toAQL()
  }

  if (typeof pluck === 'string') {
    if (computed && computed[pluck]) {
      pluck = `${docName}_${pluck}`
    } else if (!pluck.startsWith(docName)) {
      pluck = [docName, pluck].join('.')
    }
  }

  return pluck
}

function parseOptionReturn (opts, docName, computed, merged = {}) {
  let returned = docName

  if (opts.pair) {
    const pair = parseOptionPair(opts.pair, docName, computed)

    returned = AQB.expr(`{[${pair[0]}]: ${pair[1]}}`)
  } else if (opts.pluck) {
    const pluck = parseOptionPluck(opts.pluck, docName, computed)

    returned = AQB.expr(pluck)
  } else if (opts.keep) {
    const keep = parseOptionKeep(opts.keep, docName, computed)

    if (keep) {
      returned = AQB.KEEP(docName, keep)
    }
  }

  if (opts.return && typeof opts.return !== 'boolean') {
    returned = opts.return
  }

  if (Object.keys(merged).length) {
    returned = AQB.MERGE(returned, merged)
  }

  if (typeof returned === 'string') {
    returned = AQB.expr(returned)
  }

  return returned
}

function parseOptionSort (args, docName, computed) {
  args = _.flattenDeep(_.castArray(args)).reduce((acc, value) => {
    if (typeof value === 'string') {
      return acc.concat(value.split(' '))
    }
    if (isAQBObject(value)) {
      return acc.concat(value)
    }
    if (_.isPlainObject(value)) {
      return acc.concat(_.flatten(_.toPairs(value)))
    }
    return acc
  }, [])

  args = _.compact(args)

  const argsLength = args.length
  let sort = {}

  for (let i = 0; i < argsLength; ++i) {
    let attr = args[i]
    let direction = args[i + 1]

    if (isAQBObject(attr)) {
      attr = attr.toAQL()
    }

    if (typeof direction === 'string') {
      direction = direction.toUpperCase()

      if (~SORT_DIRECTIONS.indexOf(direction)) {
        ++i
      } else {
        direction = undefined
      }
    }

    if (docName && typeof attr === 'string') {
      if (computed && computed[attr]) {
        attr = `${docName}_${attr}`
      } else if (!attr.startsWith(docName)) {
        attr = [docName, attr].join('.')
      }
    }

    sort[attr] = direction || DEFAULT.SORT_ORDER
  }

  return _.toPairs(sort)
}

function setApiValue (api, key, value) {
  if (value !== api.opts[key]) {
    return createApi(api, {[key]: value})
  }

  return api
}

function setBitValue (api, key, args) {
  const enable = !isFalsyBit(args)
  return setApiValue(api, key, enable)
}

function setCumulableNaryArgs (api, key, args) {
  args = [args]
  return setCumulableNaryValues(api, key, args)
}

function setCumulableNaryArgsList (api, key, args) {
  if (!isEmptyArgs(args) && isFalsyArgs(args)) {
    return setApiValue(api, key, false)
  }

  args = args.map((x) => [].concat(x))

  return args.reduce((acc, subArgs) => {
    return setCumulableNaryArgs(acc, key, subArgs)
  }, api)
}

function setCumulableNaryValues (api, key, args) {
  if (!isEmptyArgs(args)) {
    args = !isFalsyArgs(args) ? [].concat(api.opts[key] || [], args) : null
    return setApiValue(api, key, args)
  }

  return api
}

module.exports = Object.assign(MQB.bind(null), {
  API_FULLTEXT_METHODS,
  API_INDEXES_SETTERS,
  API_INDEXES_SETTERS_KEYS,
  API_MIXINS,
  API_OPTIONS,
  API_PROTO,
  API_SETTERS,
  API_SETTERS_KEYS,
  API_GEO_METHODS,
  DEFAULT,
  FILTER_COMPARATORS,
  FILTER_COMPARATORS_INVERSED,
  FILTER_OPERATORS,
  FILTER_OPERATORS_INVERSED,
  HAS_FILTER_COMPARATORS_KEYS,
  HAS_FILTER_COMPARATORS,
  HAS_FILTER_COMPARATORS_INVERSED,
  SORT_DIRECTIONS,
  SORT_DIRECTIONS_INVERSED,
  ForExpression2,
  ModelQueryCursor,
  computeProperty,
  createApi,
  getApiSetterKeys,
  inflateQuery,
  inflateQueryFilters,
  inflateQuerySorts,
  isAQBComparatorName,
  isAQBHasComparatorName,
  isAQBOperatorName,
  isAQBObject,
  isEmptyArgs,
  isFalsyArgs,
  isFalsyBit,
  parseOptionExample,
  parseOptionFilter,
  parseOptionFilterRaw,
  parseOptionHas,
  parseOptionHasRaw,
  parseOptionKeep,
  parseOptionPair,
  parseOptionPluck,
  parseOptionReturn,
  parseOptionSort,
  setApiValue,
  setBitValue,
  setCumulableNaryArgs,
  setCumulableNaryArgsList,
  setCumulableNaryValues,
})
