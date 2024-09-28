/**
 * ✔ hover-class
 * ✘ hover-stop-propagation
 * ✔ hover-start-time
 * ✔ hover-stay-time
 */
import { View, Text, StyleProp, TextStyle, NativeSyntheticEvent, ViewProps, ImageStyle, ImageResizeMode, StyleSheet, Image, LayoutChangeEvent } from 'react-native'
import { useRef, useState, useEffect, forwardRef, ReactNode, JSX, useContext } from 'react'
import useInnerProps from './getInnerListeners'
import { ExtendedViewStyle } from './types/common'
import useNodesRef, { HandlerRef } from './useNodesRef'
import { VarContext } from './context'
import { parseUrl, PERCENT_REGEX, VAR_USE_REGEX, isText, every, splitVarStyle, splitStyle, splitProps, throwReactWarning, transformTextStyle, formatValue } from './utils'
import LinearGradient from 'react-native-linear-gradient'
import { hasOwn, diffAndCloneA } from '@mpxjs/utils'
export interface _ViewProps extends ViewProps {
  style?: ExtendedViewStyle
  children?: ReactNode | ReactNode[]
  hoverStyle?: ExtendedViewStyle
  ['hover-start-time']?: number
  ['hover-stay-time']?: number
  'enable-offset'?: boolean
  'enable-background-image'?: boolean
  'enable-css-var'?: boolean
  bindtouchstart?: (event: NativeSyntheticEvent<TouchEvent> | unknown) => void
  bindtouchmove?: (event: NativeSyntheticEvent<TouchEvent> | unknown) => void
  bindtouchend?: (event: NativeSyntheticEvent<TouchEvent> | unknown) => void
}

type Handler = (...args: any[]) => void

type Size = {
  width: number
  height: number
}

type DimensionValue = number | 'auto' | `${number}%`

type Position = {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

type PositionKey = keyof Position

type NumberVal = number | `${number}%`

type PositionVal = PositionKey | NumberVal

type backgroundPositionList = ['left' | 'right', NumberVal, 'top' | 'bottom', NumberVal] | []

type linearProps = {
  colors: Array<string>,
  locations: Array<number>,
  angle: number
}

type PreImageInfo = {
  src?: string,
  sizeList: DimensionValue[]
  lGProps?: linearProps
  containPercentSymbol?: boolean
  backgroundPosition: backgroundPositionList
}

type ImageProps = {
  style: ImageStyle,
  src?: string
}


const linearMap = new Map([
  ['top', 0], 
  ['bottom', 180], 
  ['left', 270], 
  ['right', 90],
  ['top right', 45],
  ['right top', 45],
  ['top left', 315],
  ['left top', 315],
  ['bottom right', 135],
  ['right bottom', 135],
  ['bottom left', 225],
  ['left bottom', 225]
])

const applyHandlers = (handlers: Handler[], args: any[]) => {
  for (let handler of handlers) {
    handler(...args)
  }
}

const checkNeedLayout = (style: PreImageInfo) => {
  const [width, height] = style.sizeList
  const bp = style.backgroundPosition
  // 含有百分号，center 需计算布局
  const containPercentSymbol = typeof bp[1] === 'string' && PERCENT_REGEX.test(bp[1]) || typeof bp[3] === 'string' && PERCENT_REGEX.test(bp[3])

  return {
    // 是否开启layout的计算
    needLayout: typeof width === 'string' && /^cover|contain$/.test(width) || (typeof height === 'string' && PERCENT_REGEX.test(height) && width === 'auto') || (typeof width === 'string' && PERCENT_REGEX.test(width) && height === 'auto') || containPercentSymbol,
    // 是否开启原始宽度的计算
    needImageSize: typeof width === 'string' && /^cover|contain$/.test(width) || style.sizeList.includes('auto')
  }
}

/**
* h - 用户设置的高度
* lh - 容器的高度
* ratio - 原始图片的宽高比
* **/
function calculateSize (h: number, ratio: number, lh?: number | boolean, reverse: boolean = false): Size | null {
  let height = 0, width = 0

  if (typeof lh === 'boolean') {
    reverse = lh
  }

  if (typeof h === 'string' && PERCENT_REGEX.test(h)) { // auto  px/rpx
    if (!lh) return null
    height = (parseFloat(h) / 100) * (lh as number)
    width = height * ratio
  } else { // 2. auto px/rpx - 根据比例计算
    height = h
    width = height * ratio
  }
  return {
    width: reverse ? height : width,
    height: reverse ? width : height
  }
}

/**
 * 用户设置百分比后，转换为偏移量
 * h - 用户设置图片的高度
 * ch - 容器的高度
 * val - 用户设置的百分比
 * **/
function calculateSizePosition (h: number, ch: number, val: string): number {
  if (!h || !ch) return 0

  // 百分比需要单独的计算
  if (typeof h === 'string' && PERCENT_REGEX.test(h)) {
    h = ch * parseFloat(h) / 100
  }

  // (container width - image width) * (position x%) = (x offset value)
  return (ch - h) * parseFloat(val) / 100
}

function backgroundPosition (imageProps: ImageProps, preImageInfo: PreImageInfo, imageSize: Size, layoutInfo: Size) {
  const bps = preImageInfo.backgroundPosition
  if (bps.length === 0) return
  let style: Position = {}
  let imageStyle: ImageStyle = imageProps.style || {}

  for (let i = 0; i < bps.length; i += 2) {
    let key = bps[i] as PositionKey, val = bps[i + 1]
    // 需要获取 图片宽度 和 容器的宽度 进行计算
    if (typeof val === 'string' && PERCENT_REGEX.test(val)) {
      if (i === 0) {
        style[key] = calculateSizePosition(imageStyle.width as number, layoutInfo?.width, val)
      } else {
        style[key] = calculateSizePosition(imageStyle.height as number, layoutInfo?.height, val)
      }
    } else {
      style[key] = val as number
    }
  }

  imageProps.style = {
    ...imageProps.style as ImageStyle,
    ...style
  }

}

// background-size 转换
function backgroundSize (imageProps: ImageProps, preImageInfo: PreImageInfo, imageSize: Size, layoutInfo: Size) {
  let sizeList = preImageInfo.sizeList
  if (!sizeList) return
  const { width: layoutWidth, height: layoutHeight } = layoutInfo || {}
  const { width: imageSizeWidth, height: imageSizeHeight } = imageSize || {}
  const [width, height] = sizeList
  let dimensions: {
    width: NumberVal,
    height: NumberVal
  } | null = { width: 0, height: 0 }

  // 枚举值
  if (typeof width === 'string' && ['cover', 'contain'].includes(width)) {
    if (layoutInfo && imageSize) {
      let layoutRatio = layoutWidth / imageSizeWidth
      let eleRatio = imageSizeWidth / imageSizeHeight
      // 容器宽高比 大于 图片的宽高比，依据宽度作为基准，否则以高度为基准
      if (layoutRatio <= eleRatio && (width as string) === 'contain' || layoutRatio >= eleRatio && (width as string) === 'cover') {
        dimensions = calculateSize(layoutWidth as number, imageSizeHeight / imageSizeWidth, true) as Size
      } else if (layoutRatio > eleRatio && (width as string) === 'contain' || layoutRatio < eleRatio && (width as string) === 'cover') {
        dimensions = calculateSize(layoutHeight as number, imageSizeWidth / imageSizeHeight) as Size
      }
    }
  } else {
    if (width === 'auto' && height === 'auto') { // 均为auto
      if (!imageSize) return
      dimensions = {
        width: imageSizeWidth,
        height: imageSizeHeight
      }
    } else if (width === 'auto') { // auto px/rpx/%
      if (!imageSize) return
      dimensions = calculateSize(height as number, imageSizeWidth / imageSizeHeight, layoutInfo?.height)
      if (!dimensions) return
    } else if (height === 'auto') { // auto px/rpx/%
      if (!imageSize) return
      dimensions = calculateSize(width as number, imageSizeHeight / imageSizeWidth, layoutInfo?.width, true)
      if (!dimensions) return
    } else { // 数值类型      ImageStyle
      // 数值类型设置为 stretch
      (imageProps.style as ImageStyle).resizeMode = 'stretch'
      dimensions = {
        width: typeof width === 'string' && PERCENT_REGEX.test(width) ? width : +width! as number,
        height: typeof height === 'string' && PERCENT_REGEX.test(height) ? height : +height! as number
      }
    }
  }
  // 样式合并
  imageProps.style = {
    ...imageProps.style as ImageStyle,
    ...dimensions
  }
}

// background-image转换为source
function backgroundImage (imageProps: ImageProps, preImageInfo: PreImageInfo) {
  imageProps.src = preImageInfo.src
}

const imageStyleToProps = (preImageInfo: PreImageInfo, imageSize: Size, layoutInfo: Size) => {
  // 初始化
  const imageProps: ImageProps = {
    style: {
      resizeMode: 'cover' as ImageResizeMode,
      position: 'absolute'
      // ...StyleSheet.absoluteFillObject
    }
  }
  applyHandlers([backgroundSize, backgroundImage, backgroundPosition], [imageProps, preImageInfo, imageSize, layoutInfo])
  if (!imageProps?.src) return null
  return imageProps
}

function isHorizontal (val: PositionVal): val is 'left' | 'right' {
  return typeof val === 'string' && /^(left|right)$/.test(val)
}

function isVertical (val: PositionVal): val is 'top' | 'bottom' {
  return typeof val === 'string' && /^(top|bottom)$/.test(val)
}

function normalizeBackgroundPosition (parts: PositionVal[]): backgroundPositionList {

  if (parts.length === 0) return []

  // 定义默认值
  let hStart: 'left' | 'right' = 'left'
  let hOffset: PositionVal = 0
  let vStart: 'top' | 'bottom' = 'top'
  let vOffset: PositionVal = 0

  if (parts.length === 4) return parts as backgroundPositionList

  // 归一化
  if (parts.length === 1) {
    // 1. center
    // 2. 2px - hOffset, vOffset(center) - center为50%
    // 3. 10% - hOffset, vOffset(center) - center为50%
    // 4. left - hStart, vOffset(center) - center为50%
    // 5. top - hOffset(center), vStart - center为50%

    if (isHorizontal(parts[0])) {
      hStart = parts[0]
      vOffset = '50%'
    } else if (isVertical(parts[0])) {
      vStart = parts[0]
      hOffset = '50%'
    } else {
      hOffset = parts[0]
      vOffset = '50%'
    }
  } else if (parts.length === 2) {
    // 1. center center - hOffset, vOffset
    // 2. 10px center - hOffset, vStart
    // 3. left center - hStart, vOffset
    // 4. right center - hStart, vOffset
    // 5. 第一位是 left right 覆盖的是 hStart
    //             center, 100% 正常的px 覆盖的是 hOffset
    //     第二位是 top bottom 覆盖的是 vStart
    //             center, 100% 覆盖的是 vOffset
    //
    // 水平方向 
    if (isHorizontal(parts[0])) {
      hStart = parts[0]
    } else { // center, 100% 正常的px 覆盖的是 hOffset
      hOffset = parts[0]
    }
    // 垂直方向
    if (isVertical(parts[1])) {
      vStart = parts[1]
    } else { // center, 100% 正常的px 覆盖的是 hOffset
      vOffset = parts[1]
    }
  } else if (parts.length === 3) {
    // 1. center top 10px / top 10px center 等价 - center为50%
    // 2. right 10px center / center right 10px 等价 - center为50%
    // 2. bottom 50px right
    if (typeof parts[0] === 'string' && typeof parts[1] === 'string' && /^left|bottom|right|top$/.test(parts[0]) && /^left|bottom|right|top$/.test(parts[1])) {
      [hStart, vStart, vOffset] = parts as ['left' | 'right', 'top' | 'bottom', number]
    } else {
      [hStart, hOffset, vStart] = parts as ['left' | 'right', number, 'top' | 'bottom']
    }
  }

  return [hStart, hOffset, vStart, vOffset] as backgroundPositionList
}

function normalLinearGradient(text: string) {
  
  let linearText = text.trim().match(/linear-gradient\((.*)\)/)?.[1]
  
  if (!linearText) return

  // 添加默认的角度
  if (!/^to|^-?\d+deg/.test(linearText)) {
    linearText = '180deg ,' + linearText
  } else {
    linearText = linearText.replace('to', '')
  }
  // 把 30deg,red 10%, blue 20% 解析为 ['0deg', 'red, 10%', 'blue, 20%']
  let [direction, ...colorList] = linearText.split(/,(?![^(#]*\))/);

  // 获取角度
  let angle = +(linearMap.get(direction.trim()) || direction.match(/(-?\d+(\.\d+)?)deg/)?.[1] || 180) % 360
  // 把 ['red, 10%', 'blue, 20%']解析为 [[red, 10%], [blue, 20%]]
  return colorList.map(item => item.trim().split(/(?<!,)\s+/)).reduce<linearProps>((prev, cur, idx, self) => {

    const { colors, locations } = prev
    const [ color, val ] = cur
    let numberVal: number = parseFloat(val)/100
    
    // 添加color的数组
    colors.push(color.trim())

    // 处理渐变位置
    if (idx === 0) {
      numberVal = numberVal || 0
    } else if (self.length - 1 === idx){
      numberVal = numberVal || 1
    }
    locations.push(numberVal)
    return prev
  }, {'colors': [], 'locations': [], angle })
}

function normalBackgroundImage (text?: string) {
  
  if (!text) return {}

  const src = parseUrl(text)

  if (src) return { src }

  const lGProps = normalLinearGradient(text)

  return {
    lGProps
  }
}

function preParseImage (imageStyle?: ExtendedViewStyle) {

  const { backgroundImage, backgroundSize = ['auto'], backgroundPosition = [0, 0] } = imageStyle || {}
  const { src, lGProps } = normalBackgroundImage(backgroundImage)

  let sizeList = backgroundSize.slice() as DimensionValue[]

  sizeList.length === 1 && sizeList.push('auto')
  
  return {
    src,
    lGProps,
    sizeList,
    backgroundPosition: normalizeBackgroundPosition(backgroundPosition)
  }
}

function wrapImage (imageStyle?: ExtendedViewStyle) {
  const [show, setShow] = useState<boolean>(false)
  const [, setImageSizeWidth] = useState<number | null>(null)
  const [, setImageSizeHeight] = useState<number | null>(null)
  const [, setLayoutInfoWidth] = useState<number | null>(null)
  const [, setLayoutInfoHeight] = useState<number | null>(null)
  const sizeInfo = useRef<Size | null>(null)
  const layoutInfo = useRef<Size | null>(null)

  // 预解析
  const preImageInfo: PreImageInfo = preParseImage(imageStyle)
  
  // 判断是否可挂载onLayout
  const { needLayout, needImageSize } = checkNeedLayout(preImageInfo)
  const { src, lGProps } = preImageInfo

  useEffect(() => {
    if (!src) {
      setShow(false)
      sizeInfo.current = null
      layoutInfo.current = null
      return
    }

    if (!needImageSize) {
      setShow(true)
      return
    }
    Image.getSize(src, (width, height) => {
      sizeInfo.current = {
        width,
        height
      }
      //1. 当需要绑定onLayout 2. 获取到布局信息
      if (!needLayout || layoutInfo.current) {
        setImageSizeWidth(width)
        setImageSizeHeight(height)
        if (layoutInfo.current) {
          setLayoutInfoWidth(layoutInfo.current.width)
          setLayoutInfoHeight(layoutInfo.current.height)
        }
        setShow(true)
      }
    })
  }, [preImageInfo?.src])

  if (!preImageInfo?.src && !lGProps) return null

  const onLayout = (res: LayoutChangeEvent) => {
    const { width, height } = res?.nativeEvent?.layout || {}
    layoutInfo.current = {
      width,
      height
    }
    if (!needImageSize) {
      setLayoutInfoWidth(width)
      setLayoutInfoHeight(height)
    } else if (sizeInfo.current) {
      setLayoutInfoWidth(width)
      setLayoutInfoHeight(height)
      setImageSizeWidth(sizeInfo.current.width)
      setImageSizeHeight(sizeInfo.current.height)
      setShow(true)
    }
  }

  return <View key='viewBgImg' {...needLayout ? { onLayout } : null} style={{ ...StyleSheet.absoluteFillObject, width: '100%', height: '100%', overflow: 'hidden' }}>
    {lGProps && <LinearGradient useAngle={true} style={{ width: '100%', height: '100%'}} {...lGProps} /> }
    {show && <Image {...imageStyleToProps(preImageInfo, sizeInfo.current as Size, layoutInfo.current as Size)} />}
  </View>
}

function wrapChildren (children: ReactNode | ReactNode[], props: _ViewProps, textStyle?: StyleProp<TextStyle>, imageStyle?: ExtendedViewStyle, varStyle?: Object, varContext?: Object) {
  const { textProps } = splitProps(props)
  const { 'enable-background-image': enableBackgroundImage } = props

  if (every(children as ReactNode[], (child) => isText(child))) {
    if (textStyle || textProps) {
      transformTextStyle(textStyle as TextStyle)
      children = <Text key='childrenWrap' style={textStyle} {...(textProps || {})}>{children}</Text>
    }
  } else {
    if (textStyle) throwReactWarning('[Mpx runtime warn]: Text style will be ignored unless every child of the view is Text node!')
  }

  if (varStyle && varContext) {
    children = <VarContext.Provider key='childrenWrap' value={varContext}>{children}</VarContext.Provider>
  }

  return [
    enableBackgroundImage ? wrapImage(imageStyle) : null,
    children
  ]
}

const percentStyleRules = [{
  key: 'transform',
  rules: {
    width: 'translateX',
    height: 'translateY'
  }
}, {
  key: 'borderTopLeftRadius',
  rules: {
    width: 'borderTopLeftRadius'
  }
}, {
  key: 'borderBottomLeftRadius',
  rules: {
    width: 'borderBottomLeftRadius'
  }
}, {
  key: 'borderBottomRightRadius',
  rules: {
    height: 'borderBottomRightRadius'
  }
}, {
  key: 'borderTopRightRadius',
  rules: {
    height: 'borderTopRightRadius'
  }
}]

function transformPercent (styleObj: ExtendedViewStyle, { width, height }: { width?: number, height?: number }) {
  const percentStyle: Record<string, any> = {}
  const hasPercentStyle = percentStyleRules.some(({ key, rules }) => {
    return Object.entries(rules).some(([dimension, transformKey]) => {
      const transformItemValue = styleObj[key]
      if (transformItemValue) {
        if (Array.isArray(transformItemValue)) {
          const transformValue = transformItemValue.find((item: Record<string, any>) => hasOwn(item, transformKey))
          return transformValue && PERCENT_REGEX.test(transformValue[transformKey])
        } else if (typeof transformItemValue === 'string') {
          return PERCENT_REGEX.test(transformItemValue)
        }
      }
    })
  })
  if (hasPercentStyle) {
    percentStyleRules.forEach((styleItem: Record<string, any>) => {
      const transformItemValue = styleObj[styleItem.key]
      if (Array.isArray(transformItemValue)) {
        const transformStyle: Record<string, any>[] = []
        transformItemValue.forEach((transformItem: Record<string, any>) => {
          const rules = styleItem.rules
          for (const type in rules) {
            const value = transformItem[rules[type]]
            if (value !== undefined) {
              if (PERCENT_REGEX.test(value)) {
                const percentage = parseFloat(value) / 100
                if (type === 'height' && height) {
                  transformStyle.push({ [rules[type]]: percentage * height })
                } else if (type === 'width' && width) {
                  transformStyle.push({ [rules[type]]: percentage * width })
                } else {
                  transformStyle.push({ [rules[type]]: 0 })
                }
              } else {
                transformStyle.push(transformItem)
              }
            }
          }
        })
        percentStyle[styleItem.key] = transformStyle
      } else if (typeof transformItemValue === 'string') {
        const rules = styleItem.rules
        for (const type in rules) {
          if (transformItemValue) {
            if (PERCENT_REGEX.test(transformItemValue)) {
              const percentage = parseFloat(transformItemValue) / 100
              if (type === 'height' && height) {
                percentStyle[styleItem.key] = percentage * height
              } else if (type === 'width' && width) {
                percentStyle[styleItem.key] = percentage * width
              } else {
                percentStyle[styleItem.key] = 0
              }
            } else {
              percentStyle[styleItem.key] = transformItemValue
            }
          }
        }
      }
    })
  }
  return {
    hasPercentStyle,
    percentStyle
  }
}

function transformVar (styleObj: ExtendedViewStyle, varContext: Record<string, string | number>) {
  Object.entries(styleObj).forEach(([name, value]) => {
    const matched = VAR_USE_REGEX.exec(value)
    if (matched) {
      const varName = matched[1].trim()
      const fallback = (matched[2] || '').trim()
      if (hasOwn(varContext, varName)) {
        styleObj[name] = varContext[varName]
      } else if (fallback) {
        styleObj[name] = formatValue(fallback)
      } else {
        delete styleObj[name]
      }
    }
  })
}

const _View = forwardRef<HandlerRef<View, _ViewProps>, _ViewProps>((props, ref): JSX.Element => {
  const {
    style = {},
    children,
    hoverStyle,
    'hover-start-time': hoverStartTime = 50,
    'hover-stay-time': hoverStayTime = 400,
    'enable-offset': enableOffset,
    'enable-css-var': enableCssVar
  } = props

  const [isHover, setIsHover] = useState(false)

  const [containerWidth, setContainerWidth] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)

  const layoutRef = useRef({})

  const varContext = useContext(VarContext)
  // 缓存比较newVarContext是否发生变化
  const newVarContextRef = useRef({})

  // 默认样式
  const defaultStyle: ExtendedViewStyle = {
    // flex 布局相关的默认样式
    ...style.display === 'flex' && {
      flexDirection: 'row',
      flexBasis: 'auto',
      flexShrink: 1,
      flexWrap: 'nowrap'
    }
  }

  const rawStyleObj: ExtendedViewStyle = {
    ...defaultStyle,
    ...style,
    ...(isHover ? hoverStyle : null)
  }

  const { normalStyle: styleObj = {}, varStyle } = splitVarStyle(rawStyleObj)

  const newVarContext = Object.assign({}, varContext, varStyle)

  if (diffAndCloneA(newVarContextRef.current, newVarContext).diff) {
    newVarContextRef.current = newVarContext
  }

  transformVar(styleObj, newVarContextRef.current)

  const { textStyle, imageStyle, innerStyle } = splitStyle(styleObj)

  const { hasPercentStyle, percentStyle } = transformPercent(styleObj, { width: containerWidth, height: containerHeight })

  const { nodeRef } = useNodesRef<View, _ViewProps>(props, ref, {
    defaultStyle
  })

  const dataRef = useRef<{
    startTimer?: ReturnType<typeof setTimeout>
    stayTimer?: ReturnType<typeof setTimeout>
  }>({})

  useEffect(() => {
    return () => {
      dataRef.current.startTimer && clearTimeout(dataRef.current.startTimer)
      dataRef.current.stayTimer && clearTimeout(dataRef.current.stayTimer)
    }
  }, [])

  const setStartTimer = () => {
    dataRef.current.startTimer && clearTimeout(dataRef.current.startTimer)
    dataRef.current.startTimer = setTimeout(() => {
      setIsHover(true)
    }, +hoverStartTime)
  }

  const setStayTimer = () => {
    dataRef.current.stayTimer && clearTimeout(dataRef.current.stayTimer)
    dataRef.current.startTimer && clearTimeout(dataRef.current.startTimer)
    dataRef.current.stayTimer = setTimeout(() => {
      setIsHover(false)
    }, +hoverStayTime)
  }

  function onTouchStart (e: NativeSyntheticEvent<TouchEvent>) {
    const { bindtouchstart } = props
    bindtouchstart && bindtouchstart(e)
    setStartTimer()
  }

  function onTouchEnd (e: NativeSyntheticEvent<TouchEvent>) {
    const { bindtouchend } = props
    bindtouchend && bindtouchend(e)
    setStayTimer()
  }

  const onLayout = (res: LayoutChangeEvent) => {
    if (hasPercentStyle) {
      const { width, height } = res?.nativeEvent?.layout || {}
      setContainerWidth(width || 0)
      setContainerHeight(height || 0)
    }
    if (enableOffset) {
      nodeRef.current?.measure((x: number, y: number, width: number, height: number, offsetLeft: number, offsetTop: number) => {
        layoutRef.current = { x, y, width, height, offsetLeft, offsetTop }
      })
    }
  }


  const needLayout = enableOffset || hasPercentStyle

  const innerProps = useInnerProps(props, {
    ref: nodeRef,
    ...needLayout ? { onLayout } : {},
    ...(hoverStyle && {
      bindtouchstart: onTouchStart,
      bindtouchend: onTouchEnd
    })
  }, [
    'style',
    'children',
    'hover-start-time',
    'hover-stay-time',
    'hoverStyle',
    'hover-class',
    'enable-offset',
    'enable-background-image'
  ], {
    layoutRef
  })

  return (
    <View
      {...innerProps}
      style={{ ...innerStyle, ...percentStyle }}
    >
      {wrapChildren(children, props, textStyle, imageStyle, varStyle, newVarContextRef.current)}
    </View>
  )
})

_View.displayName = 'mpx-view'

export default _View

 