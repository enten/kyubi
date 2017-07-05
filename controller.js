const _ = require('lodash')
const createRouter = require('@arangodb/foxx/router')
const inflect = require('i')()
const {EE} = require('./utils')

const DEFAULT_PAGE_SIZE = 20

class Controller extends EE {
  /** @final */
  static get Model () {
    return ModelController
  }

  /** @final */
  static get ModelController () {
    return ModelController
  }

  /** @overridable */
  static get baseUri () {
    let uri = this.name
    
    if (uri.endsWith('Controller')) {
      uri = uri.substring(0, uri.length - 10)
    }

    uri = '/'.concat(inflect.underscore(uri))

    return uri
  }

  /** @overridable */
  static get except () {
    return null
  }

  /** @overridable */
  static get middlewares () {
    return null
  }

  /** @overridable */
  static get only () {
    return null
  }

  /** @overridable required */
  static get routes () {
    throw new Error(`Controller "${this.name}" must override static get routes`)
  }

  /** @final */
  static bootstrap (context, opts) {
    const controller = new this(opts)

    context.use(controller.router)

    return controller
  }

  /** @final */
  static router (router, opts) {
    const controller = new this(router, opts)

    return controller.router
  }

  constructor (router, opts) {
    if (_.isPlainObject(router)) {
      opts = router
      router = undefined
    }

    if (!opts) {
      opts = {}
    }

    super()

    this.baseUri = opts.baseUri || this.constructor.baseUri
    this.except = [].concat( this.constructor.except || [], opts.except || [])
    this.only = [].concat( this.constructor.only || [], opts.only || [])
    this.router = router || createRouter()
    this.routes = getControllerRoutes(this)

    if (this.constructor.model) {
      const {
        partitionsModels,
        relationsKeys
      } = this.constructor.model

      if (this.moveInto) {
        Object.keys(partitionsModels).forEach((key) => {
          const {partition, partitionMoveMethod} = partitionsModels[key]

          if (this.routes[partitionMoveMethod]) {
            this[partitionMoveMethod] = (req, res) => {
              req.pathParams.partitionName = partition

              this.moveInto(req, res)
            }
          }
        })
      }

      if (relationsKeys.length) {
        relationsKeys.forEach((relName) => {
          const upperFirstRelName = _.upperFirst(relName)

          ;[
            'showRelation',
            'saveRelation',
          ].forEach((endpoint) => {
            const endpointName = endpoint + upperFirstRelName

            if (this.routes[endpointName]) {
              this[endpointName] = (req, res) => {
                req.pathParams.relName = relName

                this[endpoint].call(this, req, res)
              }
            }
          })
        })
      }
    }

    inflateRoutes(this, this.routes)
  }

  /** @overridable */
  register (endpoint, route) {

  }
}

class ModelController extends Controller {
  /** @overridable required */
  static get model () {
    throw new Error(`ModelController "${this.name}" must override static get model`)
  }

/** @overridable */
  static get routes () {
    return null
  }

  create (req, res) {
    res.send({method: 'create'})
  }

  delete (req, res) {
    const _key = req.param('_key')
    const opts = req.queryParams
    const result = req.model.remove(_key, opts)

    res.send(result)
  }

  edit (req, res) {
    res.send({method: 'edit'})
  }

  index (req, res) {
    const opts = req.queryParams
    let {page, pageSize} = opts

    delete opts.page
    delete opts.pageSize

    page = page || 1
    pageSize = pageSize || req.model.pageSize || DEFAULT_PAGE_SIZE

    const result = req.model.paginate(page, pageSize, opts)

    res.send({
      data: result.toArray(),
      count: result.count(),
      page,
      pageSize
    })
  }

  moveInto (req, res) {
    const _key = req.param('_key')
    const partition = req.param('partitionName')
    const opts = req.queryParams
    const result = req.model.moveInto(partition, _key, opts)
    
    res.send(result)
  }

  query (req, res) {
    const opts = Object.assign({}, req.queryParams, req.json())
    const result = req.model.mqb(opts).fetch()

    res.send(result)
  }

  replace (req, res) {
    const _key = req.param('_key')
    const data = req.json()
    const opts = Object.assign({}, req.queryParams, {replace: true})
    const result = req.model.findOrFail(_key, null, opts)

    result._fill(data)
    result._save(opts)

    res.send(result)
  }

  saveRelation (req, res) {
    const _key = req.param('_key')
    const relName = req.param('relName')
    const data = req.json()
    const opts = req.queryParams
    const doc = req.model.findOrFail(_key)
    const result = doc._rel[relName].save(data, opts)

    res.send(result)
  }

  show (req, res) {
    const _key = req.param('_key')
    const opts = req.queryParams
    const result = req.model.findOrFail(_key, null, opts)

    res.send(result)
  }

  showRelation (req, res) {
    const _key = req.param('_key')
    const relName = req.param('relName')
    const doc = req.model.findOrFail(_key)
    const opts = req.queryParams
    const result = doc._rel[relName].get(opts)

    res.send(result || JSON.stringify(null))
  }

  store (req, res) {
    const data = req.json()
    const opts = req.queryParams
    const result = req.model.create(data, opts)

    res.send(result)
  }

  update (req, res) {
    const _key = req.param('_key')
    const data = req.json()
    const opts = Object.assign({}, req.queryParams, {replace: false})
    const result = req.model.findOrFail(_key, null, opts)

    result._fill(data)
    result._save(opts)

    res.send(result)
  }
}

function getControllerRoutes (controller) {
  let {baseUri, except, only} = controller
  let routes = Object.assign({}, controller.constructor.routes)

  Object.keys(routes).forEach((endpointName) => {
    routes[endpointName] = parseEndpointRoute(routes[endpointName], baseUri)
  })

  if (controller instanceof ModelController) {
    const {
      partitionsModels,
      relationsPlans,
      relationsKeys
    } = controller.constructor.model

    let modelRoutes = {
      index: [['GET', '/']],
      create: [['GET', '/create']],
      store: [['POST', '/']],
      show: [['GET', '/:_key']],
      edit: [['GET', '/:_key/edit']],
      replace: [['PUT', '/:_key']],
      update: [['PATCH', '/:_key']],
      delete: [['DELETE', '/:_key']],
      moveInto: [['GET', '/:_key/move/:partitionName']],
      query: [[['GET', 'POST'], '/query']]
    }

    if (modelRoutes.moveInto) {
      Object.keys(partitionsModels).forEach((key) => {
        const {partitionMoveMethod} = partitionsModels[key]

        modelRoutes[partitionMoveMethod] = [['GET', `/:_key/${partitionMoveMethod}`]]
      })
    }

    if (relationsKeys.length) {
      relationsKeys.forEach((relName) => {
        const upperFirstRelName = _.upperFirst(relName)

        ;[
          ['GET', 'showRelation'],
          ['POST', 'saveRelation']
        ].forEach(([method, endpoint]) => {
          const endpointName = endpoint + upperFirstRelName

          modelRoutes[endpointName] = [[method, `/:_key/${relName}`]]
        })
      })
    }

    Object.keys(modelRoutes).forEach((endpointName) => {
      if ((!routes[endpointName] || !routes[endpointName].path)) {
        const modelRoute = parseEndpointRoute(modelRoutes[endpointName], baseUri)

        if (!routes[endpointName]) {
          routes[endpointName] = modelRoute
        } else {
          routes[endpointName].path = modelRoute.path
        }
      }
    })
  }

  return !except && !only ? routes : Object.keys(routes)
    .filter((endpointName) => (
      (!except.length || except.indexOf(endpointName) === -1) &&
      (!only.length || only.indexOf(endpointName) !== -1)
    ))
    .reduce((acc, endpointName) => {
      acc[endpointName] = routes[endpointName]
      return acc
    }, {})
}

function inflateRoutes (controller, routes) {
  const isModelController = controller instanceof ModelController
  const {router} = controller

  Object.keys(routes).forEach((endpointName) => {
    const route = routes[endpointName]
    const {register, path, middlewares, name} = route

    if (typeof controller[endpointName] !== 'function') {
      throw new Error(`Endpoint method "${endpointName}" doesn't exists (controller: ${controller.constructor.name})`)
    }

    path.forEach(([httpMethods, endpointUri]) => {
      httpMethods.forEach((httpMethod, index) => {
        const endpointFullName = controller.constructor.name.concat('_', index ? httpMethod.toLowerCase().concat(_.upperFirst(name || endpointName)) : name || endpointName)
        const endpointRoute = {name: endpointName, fullName: endpointFullName, method: httpMethod, path: endpointUri}
        let endpoint
        let mws

        endpoint = router[httpMethod.toLowerCase()].call(
          router,
          endpointUri,
          (req, res, next) => {
            req.controller = controller

            if (isModelController) {
              req.model = controller.constructor.model

              if (req.queryParams.partition) {
                req.model = req.model[req.queryParams.partition]
              }
            }

            mws.reverse().reduce((acc, mw) => {
              return (err) => {
                if (err) {
                  controller.emit('req.error', req, res, endpointRoute)

                  return next(err)
                }

                mw(req, res, acc)
              }
            }, next)()
          },
          (req, res) => {
            controller.emit('req.received', req, res, endpointRoute)
            controller.emit(`req.received.${endpointName}`, req, res, endpointRoute)

            controller[endpointName].call(controller, req, res)

            controller.emit('res.sent', req, res, endpointRoute)
            controller.emit(`res.sent.${endpointName}`, req, res, endpointRoute)
          },
          endpointFullName
        )

        Object.keys(route).forEach((key) => {
          if (['middlewares', 'name', 'path', 'register'].indexOf(key) === -1) {
            endpoint[key].apply(endpoint, _.castArray(route[key]))
          }
        })

        controller.register(endpoint, endpointRoute)
        register && register(endpoint, endpointRoute)

        mws = [].concat(
          controller.constructor.middlewares || [],
          middlewares || []
        ).reduce((acc, fn) => {
          if (typeof fn === 'string') {
            fn = controller[fn].bind(controller)
          }

          if (typeof fn == 'object' && typeof fn.register === 'function') {
            fn = fn.register(endpoint, endpointRoute)
          }

          if (typeof fn === 'function') {
            acc = acc.concat(fn)
          }

          return acc
        }, [])
      })
    })
  })
}

function parseEndpointRoute (route, baseUri) {
  if (typeof route === 'string' || Array.isArray(route)) {
    route = {path: route}
  } else {
    route = Object.assign({}, route)
  }

  if (route.path) {
    route.path = _.castArray(route.path)
      .reduce((acc, path) => {
        if (typeof path === 'string') {
          acc = acc.concat(path.split(',').map((x) => x.trim()))
        } else {
          acc.push(path)
        }

        return acc
      }, [])
      .map((path) => {
        if (typeof path === 'string') {
          if (~path.indexOf(' ')) {
            path = path.split(' ').map((x) => x.trim())
          } else {
            path = [['GET'], path]
          }

        }

        if (typeof path[0] === 'string') {
          path[0] = path[0].split('|')
        }

        path[0] = path[0].map((method) => method.trim().toUpperCase())

        if (baseUri && baseUri !== '/') {
          path[1] = [baseUri, path[1][0] === '/' ? path[1].substring(1) : path[1]].join('/')
        }

        return path
      })
  }

  return route
}

module.exports = Controller
