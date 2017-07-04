class EE {
  get listeners () {
    return lazyProperty(this, '_listeners', () => ({}))
  }

  emit (...args) {
    const eventName = args.shift()
    const listeners = this.listeners || this._listeners

    if (listeners[eventName]) {
      listeners[eventName].forEach((listener) => {
        listener.apply(null, args)
      })
    }

    return this
  }

  on (eventName, fn) {
    const listeners = this.listeners || this._listeners

    listeners[eventName] = [].concat(listeners[eventName] || [], fn)

    return this
  }

  off (eventName, fn) {
    const listeners = this.listeners || this._listeners

    if (listeners[eventName]) {
      const fnPos = listeners[eventName].lastIndexOf(fn)

      if (~fnPos) {
        listeners[eventName] = [].concat(
          listeners[eventName].slice(0, fnPos),
          listeners[eventName].slice(fnPos + 1)
        )
      }
    }

    return this
  }
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

exports.EE = EE
exports.lazyProperty = lazyProperty