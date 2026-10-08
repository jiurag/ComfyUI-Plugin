/**
 * 图片URL转Base64
 * @param {string} url 图片url
 */
export async function url2Base64(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer()).toString('base64')
  } catch (err) {
    console.error('[COMFYUI-PLUGIN] 下载图片失败:', err?.message || err)
    return null
  }
}

/**
 * 解析命令里的 --key value 参数（与 sd-plugin 保持一致的写法）
 * 例：--steps 8 --size 1024x1024 --negative "bad hands"
 */
export async function parseCommandString(commandString) {
  // \w 不含中文，所以额外放行汉字：--比例 16:9 这种也能认
  const regex = new RegExp(PARAM_PATTERN, 'g')

  let match
  const result = {}

  while ((match = regex.exec(commandString)) !== null) {
    const key = match[1]
    const value = match[2].replace(/"/g, '')
    result[key] = value === 'true' || value === 'false' ? value === 'true' : isNaN(value) ? value : Number(value)
  }

  return result
}

/** 参数片段的写法：--key value（key 允许中文）。用 source 存，用时再 new，避免 g 标志的 lastIndex 串味 */
export const PARAM_PATTERN = '--([\\w\\u4e00-\\u9fff]+)\\s+((?:"[^"]*")|(\\S+))'

/**
 * 从命令里取出提示词：去掉命令头和所有 --k v 参数
 * @param {string} commandString 整条命令
 * @param {string[]} extraHeads 额外的命令头（比如 #重绘 用的「重绘」）
 */
export function extractPrompt(commandString, extraHeads = []) {
  const heads = ['绘图', '咏唱', 'draw', '画画', 'comfy', ...extraHeads].filter(Boolean)
  // 命令头按长度倒序，避免「绘图」把「图生图」这种更长的头截断
  const headRe = new RegExp('^#?(' + heads.slice().sort((a, b) => b.length - a.length).join('|') + ')\\s*', 'i')
  return String(commandString || '')
    .replace(headRe, '')
    .replace(new RegExp(PARAM_PATTERN, 'g'), '')
    .trim()
}

/** "1024x768" / "1024*768" / "1024 768" → {width, height} */
export function parseSize(text) {
  if (!text) return null
  const m = String(text).match(/^(\d{2,5})\s*[xX×*,，\s]\s*(\d{2,5})$/)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

/** 各式各样的「比例」参数名 */
export const RATIO_KEYS = ['ratio', 'ar', '比例', 'aspect_ratio']

/**
 * 有比例、而命令里又没写具体尺寸时，把「默认参数里继承来的」width/height 摘掉。
 *
 * 为什么需要这一步：默认绘图参数里通常存着 width/height（比如 1024x1024），
 * 那是给「什么都没写」的时候用的。可工作流注入那边看到一个 width 就认为
 * 用户明确指定了尺寸，于是比例就被顶掉了。这里按「命令里到底写没写」来判断，
 * 而不是看合并之后的结果。
 *
 * 比例来源两处都算：命令里写的（--ratio / --比例），
 * 或者锅巴里设的「默认画面比例」。两种都应该是比例赢。
 *
 * @param {object} params 合并后的参数（会被就地修改）
 * @param {object} explicit 用户这次在命令里真正写了的参数
 */
export function preferRatioOverDefaultSize(params, explicit = {}) {
  const hasRatio = RATIO_KEYS.some((k) => explicit[k] !== undefined || params[k] !== undefined)
  const wantsSize = explicit.width !== undefined || explicit.height !== undefined || explicit.size !== undefined
  if (hasRatio && !wantsSize) {
    delete params.width
    delete params.height
  }
  return params
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
