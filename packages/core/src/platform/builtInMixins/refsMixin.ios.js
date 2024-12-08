import { BEFORECREATE } from '../../core/innerLifecycle'
import { createSelectorQuery } from '@mpxjs/api-proxy'

export default function getRefsMixin () {
  return {
    [BEFORECREATE] () {
      this.__refs = {}
      this.$refs = {}
      this.__getRefs()
    },
    methods: {
      __getRefs () {
        const refs = this.__getRefsData() || []
        const target = this
        refs.forEach(({ key, type, all }) => {
          Object.defineProperty(this.$refs, key, {
            enumerable: true,
            configurable: true,
            get () {
              if (type === 'component') {
                return all ? target.selectAllComponents(key) : target.selectComponent(key)
              } else {
                return createSelectorQuery().in(target).select(key, all)
              }
            }
          })
        })
      },
      __getRefVal (type, selectorsConf) {
        return (instance) => {
          if (instance) {
            selectorsConf.forEach((item = []) => {
              const [prefix, selectors = ''] = item
              if (selectors) {
                selectors.trim().split(/\s+/).forEach(selector => {
                  const refKey = prefix + selector
                  this.__refs[refKey] = this.__refs[refKey] || []
                  this.__refs[refKey].push({ type, instance })
                })
              }
            })
          }
        }
      },
      __selectRef (selector, refType, all = false) {
        const splitedSelector = selector.match(/(#|\.)?[^.#]+/g) || []
        const refsArr = splitedSelector.map(selector => {
          const refs = this.__refs[selector] || []
          const res = []
          refs.forEach(({ type, instance }) => {
            if (type === refType) {
              res.push(instance)
            }
          })
          return res
        })

        const refs = refsArr.reduce((preRefs, curRefs, curIndex) => {
          if (curIndex === 0) return curRefs
          curRefs = new Set(curRefs)
          return preRefs.filter(p => curRefs.has(p))
        }, [])

        return all ? refs : refs[0]
      }
    }
  }
}
