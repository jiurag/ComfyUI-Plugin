/**
 * 往 ComfyUI 的「API 格式工作流」里注入绘图参数
 *
 * 为什么不直接传参：ComfyUI 没有 SD WebUI 那种"一次请求带全部参数"的接口，
 * 它只接受一整张工作流图。所以思路是：
 *   1) 用户先在 ComfyUI 里调好一张工作流，用「导出(API)」存成 json
 *   2) 插件把这张图当模板，按节点把提示词/尺寸/步数/模型等替换进去
 *   3) 再 POST /prompt 提交
 *
 * 定位节点的策略（从稳到糙）：
 *   1) config.yaml 的 node_map 里手工指定节点 id —— 最稳，推荐
 *   2) 按 KSampler 的 positive / negative 连线反向追踪 —— 不用配置也对
 *   3) 按 _meta.title 里的关键词猜（"正向/负向/positive/negative"）
 */

const TEXT_KEYS = ['text', 'prompt', 'text_g', 'positive', 'negative']

/**
 * ComfyUI「ResolutionSelector」节点支持的画面比例（取自节点自己的 object_info）
 * 用户写 --ratio 16:9 这种简写，这里负责补成节点认识的那个完整名字。
 */
const ASPECT_PRESETS = [
  '1:1 (Square)',
  '2:3 (Portrait Photo)',
  '3:2 (Photo)',
  '3:4 (Portrait Standard)',
  '4:3 (Standard)',
  '9:16 (Portrait Widescreen)',
  '16:9 (Widescreen)',
  '21:9 (Ultrawide)'
]

/** "16:9" / "16：9" / "16比9" / "16x9" / 完整名字 → 节点认识的完整名字；认不出返回 null */
export function resolveAspectRatio(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (ASPECT_PRESETS.includes(raw)) return raw
  const m = raw.match(/^(\d+)\s*[:：比xX*×\/]\s*(\d+)$/)
  const key = m ? `${m[1]}:${m[2]}` : raw
  return ASPECT_PRESETS.find((p) => p.startsWith(key + ' ')) || ASPECT_PRESETS.find((p) => p.startsWith(key)) || null
}

/**
 * 按比例 + 总像素数算宽高，并对齐到 multiple 的整数倍（默认 64，SD 系列友好）
 * 注意：传进来的可能是 "16:9 (Widescreen)" 这种带后缀的完整名字，
 * 所以只取开头那段数字比例，不能直接 split(':')（那样后面会变成 NaN）。
 */
function dimsFromRatio(ratioName, pixels, multiple = 64) {
  const m = String(ratioName || '').match(/^\s*(\d+)\s*:\s*(\d+)/)
  if (!m) return null
  const a = Number(m[1])
  const b = Number(m[2])
  if (!a || !b) return null
  const w = Math.sqrt((pixels * a) / b)
  const h = (w * b) / a
  const round = (v) => Math.max(multiple, Math.round(v / multiple) * multiple)
  return { width: round(w), height: round(h) }
}

const clone = (o) => JSON.parse(JSON.stringify(o))

/** KSampler 的输入可能被包在别的节点后面，这里只跟一层 */
function resolveTextNode(graph, ref) {
  if (!Array.isArray(ref)) return null
  const id = String(ref[0])
  return graph[id] ? { id, node: graph[id] } : null
}

export function buildPrompt(template, params = {}, nodeMap = {}) {
  const graph = clone(template || {})
  const ids = Object.keys(graph)
  const applied = {}

  const findFirst = (prefix) => ids.find((id) => String(graph[id]?.class_type || '').startsWith(prefix))
  // 精确匹配（避免 findFirst('KSampler') 误中 KSamplerSelect 这种节点）
  const findExact = (...names) => ids.find((id) => names.includes(String(graph[id]?.class_type)))
  const findTitle = (re) =>
    ids.find((id) => re.test(String(graph[id]?._meta?.title || '')) && /CLIPTextEncode|TextEncode|CLIP/.test(String(graph[id]?.class_type || '')))

  // ---------- 采样器 ----------
  const samplerId =
    (nodeMap.sampler && graph[nodeMap.sampler] && nodeMap.sampler) ||
    findExact('KSampler', 'KSamplerAdvanced') ||
    findExact('BasicScheduler')
  let sampler = null
  if (samplerId && graph[samplerId]) {
    sampler = graph[samplerId]
    const put = (k, v) => {
      if (v === undefined || v === null || v === '' || Number.isNaN(v)) return
      if (!(k in sampler.inputs)) return      // 只改这个节点本来就有的输入，别塞多余的键
      sampler.inputs[k] = v
      applied[k] = v
    }
    // seed：不填或填 -1 就随机
    const seed = Number(params.seed)
    put('seed', seed >= 0 ? seed : Math.floor(Math.random() * 1e15))
    put('steps', params.steps !== undefined ? Number(params.steps) : undefined)
    put('cfg', params.cfg !== undefined ? Number(params.cfg) : undefined)
    put('sampler_name', params.sampler_name)
    put('scheduler', params.scheduler)
    put('denoise', params.denoise !== undefined ? Number(params.denoise) : undefined)

    // ---------- 正负提示词 ----------
    const putText = (branch, text) => {
      if (!text) return
      let target = null
      if (nodeMap[branch] && graph[nodeMap[branch]]) target = { id: nodeMap[branch], node: graph[nodeMap[branch]] }
      if (!target) target = resolveTextNode(graph, sampler.inputs?.[branch])
      if (!target && branch === 'positive') {
        const guess = findTitle(/正向|positive|prompt/i)
        if (guess) target = { id: guess, node: graph[guess] }
      }
      if (!target && branch === 'negative') {
        const guess = findTitle(/负向|负面|negative/i)
        if (guess) target = { id: guess, node: graph[guess] }
      }
      if (!target) return
      for (const key of TEXT_KEYS) {
        if (key in target.node.inputs) {
          target.node.inputs[key] = text
          applied[branch] = text
          return
        }
      }
    }
    putText('positive', params.prompt)
    putText('negative', params.negative_prompt)
  }

  // ---------- 画面比例 / 尺寸 / 张数 ----------
  // --ratio / --ar / --比例 / --aspect_ratio 都认
  const ratioName = resolveAspectRatio(params.ratio ?? params.ar ?? params['比例'] ?? params.aspect_ratio)
  const mpGiven = params.megapixels !== undefined || params.mp !== undefined
  const megapixels = Number(params.megapixels ?? params.mp)
  const sizeGiven = params.width !== undefined || params.height !== undefined

  // 工作流里带 ResolutionSelector 的（krea2、MiniMax 视频）：比例直接交给它算，
  // 它自己会按 megapixels + multiple 输出对齐好的宽高，比我们自己算准。
  const ratioId = ids.find((id) => String(graph[id]?.class_type || '') === 'ResolutionSelector')
  if (ratioId && graph[ratioId] && !sizeGiven) {
    const n = graph[ratioId]
    const put = (k, v) => {
      if (v === undefined || v === null || v === '' || Number.isNaN(v)) return
      if (!(k in n.inputs)) return
      n.inputs[k] = v
      applied[k] = v
    }
    put('aspect_ratio', ratioName)
    put('megapixels', mpGiven ? megapixels : undefined)
  }

  const latentId =
    (nodeMap.latent && graph[nodeMap.latent] && nodeMap.latent) ||
    findFirst('Empty') ||
    findFirst('Wan22ImageToVideoLatent') ||
    findFirst('MiniMaxH3ImageToVideo') ||
    findFirst('MiniMaxH3ReferenceToVideo')
  if (latentId && graph[latentId]) {
    const n = graph[latentId]
    // 没给具体尺寸、但给了比例，而这个工作流又没有 ResolutionSelector：
    // 那就按比例 + 总像素自己把宽高算出来（缺省按画布原本的像素总量）
    let width = params.width !== undefined ? Number(params.width) : undefined
    let height = params.height !== undefined ? Number(params.height) : undefined
    if (!sizeGiven && ratioName && !ratioId) {
      const w0 = Number(n.inputs.width)
      const h0 = Number(n.inputs.height)
      const basePixels = mpGiven ? megapixels * 1e6 : w0 && h0 ? w0 * h0 : 1024 * 1024
      const d = dimsFromRatio(ratioName, basePixels)
      if (d) {
        width = d.width
        height = d.height
        if (mpGiven) applied.megapixels = megapixels
      }
    }
    const put = (k, v) => {
      if (v === undefined || v === null || v === '' || Number.isNaN(v)) return
      if (k in n.inputs) {
        n.inputs[k] = v
        applied[k] = v
      }
    }
    put('width', width)
    put('height', height)
    put('batch_size', params.batch_size !== undefined ? Number(params.batch_size) : undefined)
    put('length', params.length !== undefined ? Number(params.length) : undefined)
  }

  // ---------- 底模 ----------
  if (params.model) {
    const id = (nodeMap.model && graph[nodeMap.model] && nodeMap.model) || findFirst('UNETLoader') || findFirst('CheckpointLoaderSimple')
    if (id && graph[id]) {
      const n = graph[id]
      if ('unet_name' in n.inputs) n.inputs.unet_name = params.model
      else if ('ckpt_name' in n.inputs) n.inputs.ckpt_name = params.model
      applied.model = params.model
    }
  }

  // ---------- LoRA ----------
  if (params.lora) {
    const id = nodeMap.lora && graph[nodeMap.lora] ? nodeMap.lora : ids.find((i) => /^LoraLoader/.test(String(graph[i]?.class_type || '')))
    if (id && graph[id]) {
      const n = graph[id]
      n.inputs.lora_name = params.lora
      if (params.lora_strength !== undefined && 'strength_model' in n.inputs) {
        n.inputs.strength_model = Number(params.lora_strength)
      }
      applied.lora = params.lora
    }
  }

  // ---------- 输入图片（图生图/改图）----------
  if (params.image) {
    const id = (nodeMap.image && graph[nodeMap.image] && nodeMap.image) || ids.find((i) => /^LoadImage/.test(String(graph[i]?.class_type || '')))
    if (id && graph[id]) {
      graph[id].inputs.image = params.image
      applied.image = params.image
    }
  }

  return { graph, applied, samplerId, latentId }
}
