const genComponentTag = require('../utils/gen-component-tag')
const loaderUtils = require('loader-utils')
const addQuery = require('../utils/add-query')
const normalize = require('../utils/normalize')
const builtInLoaderPath = normalize.lib('built-in-loader')
const optionProcessorPath = normalize.lib('runtime/optionProcessor')
const createJSONHelper = require('../json-compiler/helper')
const async = require('async')
const hasOwn = require('../utils/has-own')

function shallowStringify (obj) {
  const arr = []
  for (const key in obj) {
    if (hasOwn(obj, key)) {
      let value = obj[key]
      if (Array.isArray(value)) {
        value = `[${value.join(',')}]`
      }
      arr.push(`'${key}':${value}`)
    }
  }
  return `{${arr.join(',')}}`
}

module.exports = function (script, options, callback) {
  const ctorType = options.ctorType
  const builtInComponentsMap = options.builtInComponentsMap
  const localComponentsMap = options.localComponentsMap
  const localPagesMap = options.localPagesMap
  const srcMode = options.srcMode
  const loaderContext = options.loaderContext
  const isProduction = options.isProduction
  const componentId = options.componentId
  // const i18n = options.i18n
  const jsonConfig = options.jsonConfig
  // const tabBar = jsonConfig.tabBar
  const tabBarMap = options.tabBarMap
  // const tabBarStr = options.tabBarStr
  const genericsInfo = options.genericsInfo
  const componentGenerics = options.componentGenerics
  const forceDisableBuiltInLoader = options.forceDisableBuiltInLoader

  // add entry
  // const checkEntryDeps = (callback) => {
  //   callback = callback || cacheCallback
  //   if (callback && entryDeps.size === 0) {
  //     callback()
  //   } else {
  //     cacheCallback = callback
  //   }
  // }

  // const addEntryDep = (context, resource, name) => {
  //   // 如果loader已经回调，就不再添加entry
  //   if (callbacked) return
  //   const dep = SingleEntryPlugin.createDependency(resource, name)
  //   entryDeps.add(dep)
  //   const virtualModule = new AddEntryDependency({
  //     context: context._compiler.context,
  //     dep,
  //     name
  //   })
  //   /* eslint-disable camelcase */
  //   context._module.__has_tenon_entry = true
  //   context._module.addDependency(virtualModule)
  //   entryDeps.delete(dep)
  //   checkEntryDeps()
  // }

  const emitWarning = (msg) => {
    loaderContext.emitWarning(
      new Error('[tenon script processor][' + loaderContext.resource + ']: ' + msg)
    )
  }

  const emitError = (msg) => {
    loaderContext.emitError(
      new Error('[tenon script processor][' + loaderContext.resource + ']: ' + msg)
    )
  }

  const {
    processPage,
    processDynamicEntry
  } = createJSONHelper({
    loaderContext,
    emitWarning,
    emitError
  })

  const stringifyRequest = r => loaderUtils.stringifyRequest(loaderContext, r)
  // let tabBarPagesMap = {}
  // if (tabBar && tabBarMap) {
  //   // 挂载tabBar组件
  //   const tabBarRequest = stringifyRequest(addQuery(tabBar.custom ? './custom-tab-bar/index' : tabBarPath, { component: true }))
  //   tabBarPagesMap['mpx-tab-bar'] = `getComponent(require(${tabBarRequest}))`
  //   // 挂载tabBar页面
  //   Object.keys(tabBarMap).forEach((pagePath) => {
  //     const pageCfg = localPagesMap[pagePath]
  //     if (pageCfg) {
  //       const pageRequest = stringifyRequest(pageCfg.resource)
  //       if (pageCfg.async) {
  //         tabBarPagesMap[pagePath] = `()=>import(${pageRequest}).then(res => getComponent(res, { __mpxPageRoute: ${JSON.stringify(pagePath)} }))`
  //       } else {
  //         tabBarPagesMap[pagePath] = `getComponent(require(${pageRequest}), { __mpxPageRoute: ${JSON.stringify(pagePath)} })`
  //       }
  //     } else {
  //       emitWarning(`TabBar page path ${pagePath} is not exist in local page map, please check!`)
  //     }
  //   })
  // }

  let output = '/* script */\n'

  let scriptSrcMode = srcMode
  if (script) {
    scriptSrcMode = script.mode || scriptSrcMode
  } else {
    script = {
      tag: 'script',
      content: ''
    }
    switch (ctorType) {
      case 'app':
        script.content = 'import {createApp} from "@mpxjs/core"\n' +
          'createApp({})\n'
        break
      case 'page':
        script.content = 'import {createPage} from "@mpxjs/core"\n' +
          'createPage({})\n'
        break
      case 'component':
        script.content = 'import {createComponent} from "@mpxjs/core"\n' +
          'createComponent({})\n'
    }
  }
  output += genComponentTag(script, {
    attrs (script) {
      const attrs = Object.assign({}, script.attrs)
      // src改为内联require，删除
      delete attrs.src
      return attrs
    },
    content (script) {
      let content = `\n  import processOption, { getComponent, getWxsMixin } from ${stringifyRequest(optionProcessorPath)}\n`
      // add import
      if (ctorType === 'app') {
        content += `  import '@mpxjs/webpack-plugin/lib/runtime/base.styl'
  import Vue from 'vue'
  const VueRouter = {}
  global.getApp = function(){}
  global.__networkTimeout = ${JSON.stringify(jsonConfig.networkTimeout)}
  global.__style = ${JSON.stringify(jsonConfig.style || 'v1')}
  global.__mpxPageConfig = ${JSON.stringify(jsonConfig.window)}\n
  global.currentPagePath = ""\n`
      }
      // 注入wxs模块
      // content += '  const wxsModules = {}\n'
      // if (options.wxsModuleMap) {
      //   Object.keys(options.wxsModuleMap).forEach((module) => {
      //     const src = loaderUtils.urlToRequest(options.wxsModuleMap[module], options.projectRoot)
      //     const expression = `require(${stringifyRequest(src)})`
      //     content += `  wxsModules.${module} = ${expression}\n`
      //   })
      // }
      const firstPage = ''
      const pagesMap = {}
      const componentsMap = {}

      Object.keys(localComponentsMap).forEach((componentName) => {
        const componentCfg = localComponentsMap[componentName]
        const componentRequest = stringifyRequest(componentCfg.resource)
        if (componentCfg.async) {
          componentsMap[componentName] = `()=>import(${componentRequest}).then(res => getComponent(res))`
        } else {
          componentsMap[componentName] = `getComponent(require(${componentRequest}))`
        }
      })

      Object.keys(builtInComponentsMap).forEach((componentName) => {
        const componentCfg = builtInComponentsMap[componentName]
        const componentRequest = forceDisableBuiltInLoader ? stringifyRequest(componentCfg.resource) : stringifyRequest('builtInComponent.vue!=!' + builtInLoaderPath + '!' + componentCfg.resource)
        componentsMap[componentName] = `getComponent(require(${componentRequest}), { __mpxBuiltIn: true })`
      })

      content += `  global.currentSrcMode = ${JSON.stringify(scriptSrcMode)}\n`
      if (!isProduction) {
        content += `  global.currentResource = ${JSON.stringify(loaderContext.resourcePath)}\n`
      }
      // 为了正确获取currentSrcMode便于运行时进行转换，对于src引入的组件script采用require方式引入(由于webpack会将import的执行顺序上升至最顶)，这意味着对于src引入脚本中的named export将不会生效，不过鉴于mpx和小程序中本身也没有在组件script中声明export的用法，所以应该没有影响
      content += script.src
        ? `require(${stringifyRequest(script.src)})\n`
        : (script.content + '\n') + '\n'
      // createApp/Page/Component执行完成后立刻获取当前的option并暂存
      content += '  const currentOption = global.currentOption\n'
      // 获取pageConfig
      const pageConfig = {}
      if (ctorType === 'page') {
        // 存储当前page路径
        content += `  global.currentPagePath = ${JSON.stringify(loaderContext._compilation.__mpx__.pagesMap[loaderContext.resourcePath])}\n`
        const uselessOptions = new Set([
          'usingComponents',
          'style',
          'singlePage'
        ])
        Object.keys(jsonConfig)
          .filter(key => !uselessOptions.has(key))
          .forEach(key => {
            pageConfig[key] = jsonConfig[key]
          })
      }

      // 配置平台转换通过createFactory在core中convertor中定义和进行
      // 通过processOption进行组件注册和路由注入
      content += `  export default processOption(
    currentOption,
    ${JSON.stringify(ctorType)},
    ${JSON.stringify(firstPage)},
    ${JSON.stringify(componentId)},
    ${JSON.stringify(pageConfig)},
    // @ts-ignore
    ${shallowStringify(pagesMap)},
    // @ts-ignore
    ${shallowStringify(componentsMap)},
    ${JSON.stringify(tabBarMap)},
    ${JSON.stringify(componentGenerics)},
    ${JSON.stringify(genericsInfo)},
    undefined`

      //   if (ctorType === 'app') {
      //     content += `,
      // Vue,
      // VueRouter`
      //     if (i18n) {
      //       content += `,
      // i18n`
      //     }
      //   }
      content += '\n  )\n__dynamic_page_slot__\n'
      return content
    }
  })
  output += '\n'
  // 处理pages
  const pageSet = new Set()
  let dynamicPageStr = ''
  async.each(localPagesMap, (pageCfg, callback) => {
    if (typeof pageCfg !== 'string') pageCfg.src = addQuery(pageCfg.src, { tenon: true })
    processPage(pageCfg, loaderContext.context, '', (err, entry, { key }) => {
      if (err) return callback()
      if (pageSet.has(key)) return callback()
      pageSet.add(key)
      dynamicPageStr += `\n"${entry}"`
      callback()
    })
  }, () => {
    output = output.replace('__dynamic_page_slot__', processDynamicEntry(dynamicPageStr) || '')
    callback(null, {
      output
    })
  })
}
