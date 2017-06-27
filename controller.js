const _ = require('lodash')
const createRouter = require('@arangodb/foxx/router')
const inflect = require('i')()

class Controller {
  /** @final */
  static get Model () {
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
  static get middlewares () {
    return null
  }

  /** @overridable required */
  static get routes () {
    throw new Error(`Controller "${this.name}" must override static get routes`)
  }

  /** @final */
  static bootstrap (context) {
    const controller = new this()

    context.use(controller.router)

    return controller
  }

  /** @final */
  static router () {
    const controller = new this()

    return controller.router
  }

  constructor (router) {
    this.router = router || createRouter()

    inflateRoutes(this, getControllerRoutes(this))
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
  static get except () {
    return null
  }

  /** @overridable */
  static get only () {
    return null
  }

  create (req, res) {
    res.send({method: 'create'})
  }

  delete (req, res) {
    res.send({method: 'delete'})
  }

  edit (req, res) {
    res.send({method: 'edit'})
  }

  index (req, res) {
    res.send(this.constructor.model.all())
  }

  replace (req, res) {
    res.send({method: 'replace'})
  }

  show (req, res) {
    res.send({method: 'show'})
  }

  store (req, res) {
    res.send({method: 'store'})
  }

  update (req, res) {
    res.send({method: 'update'})
  }
}

function getControllerRoutes (controller) {
  const {baseUri, except, only} = controller.constructor
  let routes = Object.assign({}, controller.constructor.routes)

  Object.keys(routes).forEach((endpointName) => {
    routes[endpointName] = parseEndpointRoute(routes[endpointName], baseUri)
  })

  if (controller instanceof ModelController) {
    let modelRoutes = {
      index: [['GET', '/']],
      create: [['GET', '/create']],
      store: [['POST', '/']],
      show: [['GET', '/:_key']],
      edit: [['GET', '/:_key/edit']],
      replace: [['PUT', '/:_key']],
      update: [['PATCH', '/:_key']],
      delete: [['DELETE', '/:_key']]
    }

    if (except) {
      modelRoutes = _.omit(modelRoutes, except)
    }

    if (only) {
      modelRoutes = _.pick(modelRoutes, only)
    }

    Object.keys(modelRoutes).forEach((endpointName) => {
      if (!routes[endpointName] || !routes[endpointName].path) {
        const modelRoute = parseEndpointRoute(modelRoutes[endpointName], baseUri)

         if (!routes[endpointName]) {
           routes[endpointName] = modelRoute
         } else {
            routes[endpointName].path = modelRoute.path
         }
      }
    })
  }

  return routes
}

function inflateRoutes (controller, routes) {
  const {router} = controller

  Object.keys(routes).forEach((endpointName) => {
    const route = routes[endpointName]
    const {register, path, middlewares} = route

    path.forEach(([httpMethods, endpointUri]) => {
      httpMethods.forEach((httpMethod) => {
        const endpointRoute = {name: endpointName, method: httpMethod, path: endpointUri}
        let endpoint
        let mws

        endpoint = router[httpMethod.toLowerCase()].call(
          router,
          endpointUri,
          (req, res, next) => {
            mws.reverse().reduce((acc, mw) => {
              const fn = acc
              return (err) => {
                if (err) {
                  return next(err)
                }
                mw(req, res, fn)
              }
            }, next)()
          },
          controller[endpointName].bind(controller)
        )

        Object.keys(route).forEach((key) => {
          if (['middlewares', 'path', 'register'].indexOf(key) === -1) {
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
