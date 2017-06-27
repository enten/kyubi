const _ = require('lodash')
const createRouter = require('@arangodb/foxx/router')
const inflect = require('i')()

class Controller {
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
    const router = this.router()

    context.use(router)

    return router
  }

  /** @final */
  static router () {
    const {baseUri, routes} = this
    const router = createRouter()
    const controller = new this(router)

    Object.keys(routes).forEach((endpointName) => {
      const route = inflateEndpointRoute(routes[endpointName], baseUri)
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
            this.middlewares || [],
            middlewares || []
          ).reduce((acc, fn) => {
            if (typeof fn === 'string') {
              fn = this.prototype[fn].bind(controller)
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

    return router
  }

  constructor (router) {
    this.router = router
  }

  /** @overridable */
  register (endpoint, route) {

  }
}

function inflateEndpointRoute (route, baseUri) {
  if (typeof route === 'string' || Array.isArray(route)) {
    route = {path: route}
  } else {
    route = Object.assign({}, route)
  }

  route.path = _.castArray(route.path)
    .reduce((acc, path) => {
      if (typeof path === 'string') {
        acc = acc.concat(path.split(',').map((x) => x.trim()))
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

  return route
}

module.exports = Controller
