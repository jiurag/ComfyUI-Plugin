import Config from '../components/Config.js'

const VIDEO_RE = /SaveVideo|CreateVideo|SaveWEBM|VideoCombine/i
const NEED_IMAGE_RE = /^LoadImage$|LoadImage$|GetImageSize|ImageScaleToTotalPixels/i
const AUDIO_RE = /Audio/i

const FAMILIES = [
  [/minimax/i, 'MiniMax H3'],
  [/wan2\.2|wan22/i, 'Wan 2.2 5B'],
  [/qwen_image_edit/i, 'Qwen-Image-Edit'],
  [/qwen_image|qwen_image_fp8/i, 'Qwen-Image'],
  [/z_image/i, 'Z-Image'],
  [/krea/i, 'Krea2']
]

function shortName(value, max = 22) {
  const base = String(value || '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/\.(safetensors|ckpt|pt|pth|gguf)$/i, '')
    .replace(/^\([^)]*\)/, '')
    .replace(/_\d{5,}$/, '')
    .trim()
  const clean = base.replace(/_(fp8|fp16|bf16|int8|convrot|scaled)[\w.]*$/i, '')
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function collectNumbers(graph, value, depth = 0, out = []) {
  if (depth > 5 || out.length >= 6) return out
  if (typeof value === 'number') {
    out.push(value)
    return out
  }
  if (!Array.isArray(value)) return out
  const node = graph[String(value[0])]
  if (!node?.inputs) return out
  for (const key of ['value', 'int', 'steps', 'float', 'number']) {
    if (typeof node.inputs[key] === 'number') {
      out.push(node.inputs[key])
      return out
    }
  }
  for (const key of ['on_true', 'on_false', 'input', 'value', 'a', 'b']) {
    if (node.inputs[key] !== undefined) collectNumbers(graph, node.inputs[key], depth + 1, out)
  }
  return out
}

function numbersOf(graph, raw) {
  const list = [...new Set(collectNumbers(graph, raw))].filter((n) => Number.isFinite(n))
  return list.sort((a, b) => a - b)
}

function familyOf(modelName) {
  const text = String(modelName || '')
  for (const [re, pretty] of FAMILIES) if (re.test(text)) return pretty
  return null
}

function shortRatio(value) {
  const m = String(value || '').match(/(\d+\s*[:：]\s*\d+)/)
  return m ? m[1].replace(/\s/g, '') : null
}

export function describeWorkflow(name) {
  const graph = Config.getWorkflow(name)
  if (!graph) return { category: '其他', note: '（json 读取失败）' }

  const nodes = Object.values(graph)
  const classes = nodes.map((n) => String(n?.class_type || ''))
  const has = (re) => classes.some((c) => re.test(c))
  const pick = (re, key) => {
    for (const n of nodes) {
      if (re.test(String(n?.class_type || '')) && n?.inputs && n.inputs[key] !== undefined) {
        return n.inputs[key]
      }
    }
    return null
  }

  const isVideo = has(VIDEO_RE)
  const needImage = has(NEED_IMAGE_RE)
  const hasAudio = has(AUDIO_RE)

  let category = '文生图'
  if (isVideo) category = needImage ? '图生视频' : '文生视频'
  else if (needImage) category = '图生图 / 改图'

  const model = pick(/UNETLoader|CheckpointLoaderSimple/, 'unet_name') ||
    pick(/UNETLoader|CheckpointLoaderSimple/, 'ckpt_name')
  const lora = pick(/^LoraLoader/, 'lora_name')
  const steps = numbersOf(graph, pick(/BasicScheduler|KSampler/, 'steps'))
  const ratio = shortRatio(pick(/ResolutionSelector/, 'aspect_ratio'))
  const width = numbersOf(graph, pick(/Empty/, 'width'))[0]
  const height = numbersOf(graph, pick(/Empty/, 'height'))[0]

  const bits = []
  const family = familyOf(model)
  if (family) bits.push(family)
  else if (model) bits.push(shortName(model))
  if (steps.length) bits.push(`${steps.slice(0, 2).join('/')} 步`)
  if (ratio) bits.push(ratio)
  else if (width && height) bits.push(`${width}x${height}`)
  if (hasAudio) bits.push('带音频')
  if (lora) bits.push(`LoRA:${shortName(lora, 18)}`)

  return { category, note: bits.join(' · ') || '（没认出来，可在 config.yaml 里手写说明）', model, family }
}

export const CATEGORY_ORDER = ['文生图', '图生图 / 改图', '文生视频', '图生视频', '其他']

export function groupWorkflows(list, current) {
  const groups = new Map()
  list.forEach((name, i) => {
    const info = describeWorkflow(name)
    if (!groups.has(info.category)) groups.set(info.category, [])
    const extra = (Config.getConfig()?.workflow_notes || {})[name]
    groups.get(info.category).push({
      c: `${i + 1}. ${name}`,
      d: (name === current ? '← 当前使用 · ' : '') + info.note + (extra ? ` · ${extra}` : '')
    })
  })
  return CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
    title: c,
    items: groups.get(c)
  }))
}
