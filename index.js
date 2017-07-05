const Controller = require('./controller')
const Model = require('./model')
const MQB = require('./mqb')

function bootstrap ({context, controllers, db, models}) {
  if (typeof controllers === 'object' && !Array.isArray(controllers)) {
    controllers = Object.keys(controllers).map((key) => controllers[key])
  }

  if (typeof models === 'object' && !Array.isArray(models)) {
    models = Object.keys(models).map((key) => models[key])
  }

  if (models) {
    models.forEach((model) => {
      model.bootstrap(db)
    })
  }

  if (controllers) {
    controllers.forEach((controller) => {
      controller.bootstrap(context)
    })
  }
}

function setup (db, models) {
  Object.keys(models).forEach((key) => {
    models[key].setup(db)
  })
}

function teardown (db, models) {
  Object.keys(models).forEach((key) => {
    models[key].teardown(db)
  })
}

module.exports = Object.assign(bootstrap.bind(null), {
  Controller,
  Model,
  MQB,
  bootstrap,
  setup,
  teardown
})