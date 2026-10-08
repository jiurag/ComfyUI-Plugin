const TEXT_KEYS = ['text', 'prompt', 'text_g', 'positive', 'negative']

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

export function resolveAspectRatio(input) {
  const raw = String(input ?? '').trim()
  if (!raw) return null
  if (ASPECT_PRESETS.includes(raw)) return raw
  const m = raw.match(/^(\d+)\s*[:：比xX*×\/]\s*(\d+)$/)
  const key = m ? `${m[1]}:${m[2]}` : raw
  return ASPECT_PRESETS.find((p) => p.startsWith(key + ' ')) || ASPECT_PRESETS.find((p) => p.startsWith(key)) || null
}

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
  const findExact = (...names) => ids.find((id) => names.includes(String(graph[id]?.class_type)))
  const findTitle = (re) =>
    ids.find((id) => re.test(String(graph[id]?._meta?.title || '')) && /CLIPTextEncode|TextEncode|CLIP/.test(String(graph[id]?.class_type || '')))

  const samplerId =
    (nodeMap.sampler && graph[nodeMap.sampler] && nodeMap.sampler) ||
    findExact('KSampler', 'KSamplerAdvanced') ||
    findExact('BasicScheduler')
  let sampler = null
  if (samplerId && graph[samplerId]) {
    sampler = graph[samplerId]
    const put = (k, v) => {
      if (v === undefined || v === null || v === '' || Number.isNaN(v)) return
      if (!(k in sampler.inputs)) return
      sampler.inputs[k] = v
      applied[k] = v
    }
    const seed = Number(params.seed)
    put('seed', seed >= 0 ? seed : Math.floor(Math.random() * 1e15))
    put('steps', params.steps !== undefined ? Number(params.steps) : undefined)
    put('cfg', params.cfg !== undefined ? Number(params.cfg) : undefined)
    put('sampler_name', params.sampler_name)
    put('scheduler', params.scheduler)
    put('denoise', params.denoise !== undefined ? Number(params.denoise) : undefined)

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

  const ratioName = resolveAspectRatio(params.ratio ?? params.ar ?? params['比例'] ?? params.aspect_ratio)
  const mpGiven = params.megapixels !== undefined || params.mp !== undefined
  const megapixels = Number(params.megapixels ?? params.mp)
  const sizeGiven = params.width !== undefined || params.height !== undefined

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

  if (params.model) {
    const id = (nodeMap.model && graph[nodeMap.model] && nodeMap.model) || findFirst('UNETLoader') || findFirst('CheckpointLoaderSimple')
    if (id && graph[id]) {
      const n = graph[id]
      if ('unet_name' in n.inputs) n.inputs.unet_name = params.model
      else if ('ckpt_name' in n.inputs) n.inputs.ckpt_name = params.model
      applied.model = params.model
    }
  }

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

  if (params.image) {
    const id = (nodeMap.image && graph[nodeMap.image] && nodeMap.image) || ids.find((i) => /^LoadImage/.test(String(graph[i]?.class_type || '')))
    if (id && graph[id]) {
      graph[id].inputs.image = params.image
      applied.image = params.image
    }
  }

  return { graph, applied, samplerId, latentId }
}
