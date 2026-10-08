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

export async function parseCommandString(commandString) {
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

export const PARAM_PATTERN = '--([\\w\\u4e00-\\u9fff]+)\\s+((?:"[^"]*")|(\\S+))'

export function extractPrompt(commandString, extraHeads = []) {
  const heads = ['绘图', '咏唱', 'draw', '画画', 'comfy', ...extraHeads].filter(Boolean)
  const headRe = new RegExp('^#?(' + heads.slice().sort((a, b) => b.length - a.length).join('|') + ')\\s*', 'i')
  return String(commandString || '')
    .replace(headRe, '')
    .replace(new RegExp(PARAM_PATTERN, 'g'), '')
    .trim()
}

export function parseSize(text) {
  if (!text) return null
  const m = String(text).match(/^(\d{2,5})\s*[xX×*,，\s]\s*(\d{2,5})$/)
  if (!m) return null
  return { width: Number(m[1]), height: Number(m[2]) }
}

export const RATIO_KEYS = ['ratio', 'ar', '比例', 'aspect_ratio']

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
