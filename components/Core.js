import { randomUUID } from 'node:crypto'
import Config from './Config.js'
import { buildPrompt } from '../utils/workflow.js'
import { sleep } from '../utils/utils.js'

async function request(url, { method = 'GET', headers = {}, body, timeout = 60000, raw = false } = {}) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeout)
  try {
    const res = await fetch(url, { method, headers, body, signal: ac.signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new Error(`HTTP ${res.status}${text ? ' ' + text.slice(0, 200) : ''}`)
      err.status = res.status
      throw err
    }
    if (raw) return Buffer.from(await res.arrayBuffer())
    const text = await res.text()
    if (!text) return {}
    try {
      return JSON.parse(text)
    } catch {
      return { _raw: text }
    }
  } finally {
    clearTimeout(timer)
  }
}

class Code {
  async getBase() {
    const config = await Config.getConfig()
    const api_list = (config?.api_list || []).filter((a) => a && String(a.baseurl || '').trim())
    if (!api_list.length) return null
    if (config.use_api == 0) {
      const index = Math.floor(Math.random() * api_list.length)
      return api_list[index]
    }
    return api_list[config.use_api - 1] || api_list[0]
  }

  _headers(api, json = true) {
    const h = {}
    if (json) h['Content-Type'] = 'application/json'
    if (api?.username) {
      h.Authorization = `Basic ${Buffer.from(`${api.username}:${api.password || ''}`).toString('base64')}`
    }
    return h
  }

  _base(api) {
    return String(api.baseurl || '').replace(/\/+$/, '')
  }

  _err(tag, error) {
    console.error(`[COMFYUI-PLUGIN] ${tag}失败:\n`, error?.message || error)
    if (error?.status === 401) return '接口返回 401：账号或密码不对'
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return '请求超时：ComfyUI 没响应'
    const code = error?.cause?.code || error?.code
    if (code === 'ECONNREFUSED') return '连不上 ComfyUI：检查地址、端口，以及 ComfyUI 是否在运行'
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return '地址解析不了：检查填的域名或 IP'
    if (code === 'ECONNRESET') return '连接被重置：ComfyUI 可能刚好重启了'
    return error?.message || '未知错误'
  }

  async uploadImage(buffer, filename) {
    const api = await this.getBase()
    if (!api) return { status: false, msg: '还没有配置 ComfyUI 接口（config.yaml 的 api_list）' }
    try {
      const form = new FormData()
      form.append('image', new Blob([buffer]), filename || `yunzai_${Date.now()}.png`)
      form.append('overwrite', 'true')
      form.append('type', 'input')
      const data = await request(`${this._base(api)}/upload/image`, {
        method: 'POST',
        headers: this._headers(api, false),
        body: form,
        timeout: 120000
      })
      return { status: true, data }
    } catch (error) {
      return { status: false, msg: this._err('上传图片', error) }
    }
  }

  async text2img(params = {}, onTick = null, onSubmit = null) {
    const api = await this.getBase()
    if (!api) return { status: false, msg: '还没有配置 ComfyUI 接口（config.yaml 的 api_list）' }

    const config = (await Config.getConfig()) || {}
    let wfName = params.workflow || config.workflow
    if (typeof wfName === 'number' || /^\d+$/.test(String(wfName || ''))) {
      const list = Config.listWorkflows()
      const idx = Number(wfName)
      wfName = list[idx - 1] || wfName
    }
    const template = Config.getWorkflow(wfName)
    if (!template) {
      return {
        status: false,
        msg: `找不到工作流模板「${wfName}」。\n把 ComfyUI 里导出的 API 格式 json 放到 config/workflows/ 下，\n文件名就是这里要写的名字。现有：${Config.listWorkflows().join('、') || '（空）'}`
      }
    }

    const nodeMap = {
      ...(config.node_map || {}),
      ...((config.workflow_node_map || {})[wfName] || {})
    }
    const { graph, applied } = buildPrompt(template, params, nodeMap)
    const base = this._base(api)
    const headers = this._headers(api)

    let promptId
    try {
      const res = await request(`${base}/prompt`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: graph, client_id: randomUUID() }),
        timeout: 60000
      })
      if (res.node_errors && Object.keys(res.node_errors).length) {
        const detail = Object.values(res.node_errors)
          .map((e) => `${e.class_type || ''} ${e.errors?.map((x) => x.message).join(';') || ''}`)
          .join(' | ')
        return { status: false, msg: `工作流校验不通过：${detail}` }
      }
      promptId = res.prompt_id
      if (!promptId) return { status: false, msg: '提交失败：ComfyUI 没返回 prompt_id' }

      let queue = null
      try {
        const q = await request(`${base}/queue`, { headers, timeout: 10000 })
        const running = (q?.queue_running || []).length
        const pending = (q?.queue_pending || []).length
        queue = { running, pending, ahead: Math.max(0, running + pending - 1) }
      } catch (err) {
        console.error('[COMFYUI-PLUGIN] 查询队列失败（不影响出图）', err?.message)
      }
      if (onSubmit) {
        try {
          await onSubmit({ promptId, number: res.number, queue })
        } catch (err) {
          console.error('[COMFYUI-PLUGIN] onSubmit 回调出错', err?.message)
        }
      }
    } catch (error) {
      return { status: false, msg: this._err('提交工作流', error) }
    }

    const interval = Math.max(1, Number(config.poll_interval) || 2) * 1000
    const timeout = (Number(config.timeout) || 900) * 1000
    const started = Date.now()
    let outputs = null
    try {
      while (Date.now() - started < timeout) {
        await sleep(interval)
        const h = await request(`${base}/history/${promptId}`, { headers, timeout: 30000 })
        const item = h[promptId]
        if (item) {
          if (item.status?.status_str === 'error') {
            const msg = (item.status?.messages || [])
              .map((m) => (Array.isArray(m) ? `${m[0]}:${JSON.stringify(m[1]).slice(0, 200)}` : String(m)))
              .join('\n')
            return { status: false, msg: `ComfyUI 执行出错：\n${msg}` }
          }
          outputs = item.outputs || {}
          break
        }
        if (onTick) {
          let remain = null
          try {
            const q = await request(`${base}/prompt`, { headers, timeout: 10000 })
            remain = q?.exec_info?.queue_remaining
          } catch (_) {
          }
          onTick(Math.round((Date.now() - started) / 1000), remain)
        }
      }
    } catch (error) {
      return { status: false, msg: this._err('查询进度', error) }
    }

    if (!outputs) {
      return { status: false, msg: `等待超过 ${timeout / 1000} 秒还没出结果，已放弃（任务可能还在跑，可用 #取消绘画 终止）` }
    }

    const images = []
    const files = []
    for (const nodeId of Object.keys(outputs)) {
      for (const it of outputs[nodeId].images || []) {
        try {
          const qs = new URLSearchParams({
            filename: it.filename,
            subfolder: it.subfolder || '',
            type: it.type || 'output'
          })
          const buf = await request(`${base}/view?${qs}`, { headers: this._headers(api, false), timeout: 180000, raw: true })
          const b64 = buf.toString('base64')
          images.push(b64)
          files.push({ base64: b64, filename: it.filename, isVideo: /\.(mp4|webm|mkv|mov)$/i.test(it.filename) })
        } catch (error) {
          console.error('[COMFYUI-PLUGIN] 取图失败', it, error?.message)
        }
      }
    }

    if (!images.length) return { status: false, msg: '工作流跑完了，但没有产出图片（检查工作流末尾有没有 SaveImage/SaveVideo 节点）' }

    return { status: true, data: { images, files, parameters: applied, prompt_id: promptId, workflow: wfName } }
  }

  async img2img(params = {}, imageBuffer, onTick = null, onSubmit = null) {
    const up = await this.uploadImage(imageBuffer, `yunzai_${Date.now()}.png`)
    if (!up.status) return up
    const name = up.data?.name
    if (!name) return { status: false, msg: '上传图片成功但没拿到文件名' }
    return this.text2img({ ...params, image: name }, onTick, onSubmit)
  }

  async interrupt() {
    const api = await this.getBase()
    if (!api) return { status: false, msg: '还没有配置 ComfyUI 接口' }
    try {
      await request(`${this._base(api)}/interrupt`, {
        method: 'POST',
        headers: this._headers(api),
        body: '{}',
        timeout: 20000
      })
      return { status: true }
    } catch (error) {
      return { status: false, msg: this._err('中断任务', error) }
    }
  }

  async queue() {
    const api = await this.getBase()
    if (!api) return { status: false, msg: '还没有配置 ComfyUI 接口' }
    try {
      const data = await request(`${this._base(api)}/queue`, { headers: this._headers(api), timeout: 20000 })
      return { status: true, data }
    } catch (error) {
      return { status: false, msg: this._err('查询队列', error) }
    }
  }

  async listModels() {
    const api = await this.getBase()
    if (!api) return { status: false, msg: '还没有配置 ComfyUI 接口' }
    try {
      const info = await request(`${this._base(api)}/object_info`, { headers: this._headers(api, false), timeout: 120000 })
      const out = []
      const unet = info?.UNETLoader?.input?.required?.unet_name?.[0]
      const ckpt = info?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0]
      if (Array.isArray(unet)) out.push(...unet.map((n) => `[diffusion_models] ${n}`))
      if (Array.isArray(ckpt)) out.push(...ckpt.map((n) => `[checkpoints] ${n}`))
      return { status: true, data: out }
    } catch (error) {
      return { status: false, msg: this._err('获取模型列表', error) }
    }
  }

  async listLoras() {
    const api = await this.getBase()
    if (!api) return { status: false, msg: '还没有配置 ComfyUI 接口' }
    try {
      const info = await request(`${this._base(api)}/object_info`, { headers: this._headers(api, false), timeout: 120000 })
      const loras = info?.LoraLoaderModelOnly?.input?.required?.lora_name?.[0]
      return { status: true, data: Array.isArray(loras) ? loras : [] }
    } catch (error) {
      return { status: false, msg: this._err('获取LoRA列表', error) }
    }
  }
}

export default new Code()
