import { ComfyPlugin as plugin } from '../utils/base.js'
import Code from '../components/Core.js'
import Config from '../components/Config.js'
import { replyCard } from '../utils/render.js'

export class Queue extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-队列与模型',
      dsc: '查看队列、取消任务、查询模型',
      event: 'message',
      priority: 1009,
      rule: [
        { reg: '^#?绘画队列$', fnc: 'queue', dsc: '查看 ComfyUI 队列（运行中/排队中）' },
        { reg: '^#?取消绘画$', fnc: 'cancel', dsc: '中断当前绘画任务（仅主人）' },
        { reg: '^#?模型列表$', fnc: 'models', dsc: '列出可用的底模' },
        { reg: '^#?lora列表$', fnc: 'loras', dsc: '列出可用的 LoRA' }
      ]
    })
  }

  async queue(e) {
    const res = await Code.queue()
    if (!res.status) {
      await e.reply(res.msg)
      return true
    }
    const running = res.data?.queue_running?.length || 0
    const pending = res.data?.queue_pending?.length || 0
    const itemOf = (q) => {
      if (!q) return '—'
      const p = q[1] || {}
      const id = String(q[2] ?? q[0] ?? '').slice(0, 8)
      const status = p.status_str || p.status || ''
      return `${status || '排队中'} ${id ? '#' + id : ''}`.trim()
    }
    await replyCard(e, {
      title: 'ComfyUI 队列',
      subtitle: `运行中 ${running} 个 · 排队中 ${pending} 个`,
      sections: [
        { title: '正在运行', items: (res.data?.queue_running || []).map((q) => ({ c: itemOf(q), d: '' })) },
        { title: '排队等待', items: (res.data?.queue_pending || []).map((q) => ({ c: itemOf(q), d: '' })) }
      ],
      config: [{ k: '取消当前任务', v: '#取消绘画（仅主人）' }]
    })
    return true
  }

  async cancel(e) {
    if (!e.isMaster) {
      await e.reply('只有主人才能取消任务哦')
      return true
    }
    const res = await Code.interrupt()
    await e.reply(res.status ? '已请求 ComfyUI 中断当前任务' : res.msg)
    return true
  }

  async models(e) {
    const res = await Code.listModels()
    if (!res.status) {
      await e.reply(res.msg)
      return true
    }
    const list = res.data
    if (!list.length) {
      await replyCard(e, { title: '可用底模', subtitle: '没查到模型，检查 ComfyUI 的 models 目录', sections: [] })
      return true
    }
    const cfg = Config.getConfig() || {}
    const cur = cfg.workflow || ''
    await replyCard(e, {
      title: '可用底模',
      subtitle: `共 ${list.length} 个（来自 ComfyUI 节点信息）`,
      sections: [{ title: '模型列表', items: list.map((n) => ({ c: n, d: '' })) }],
      config: [{ k: '用法', v: '#绘图 提示词 --model 文件名' }, { k: '当前工作流', v: cur }]
    })
    return true
  }

  async loras(e) {
    const res = await Code.listLoras()
    if (!res.status) {
      await e.reply(res.msg)
      return true
    }
    const list = res.data
    if (!list.length) {
      await replyCard(e, { title: '可用 LoRA', subtitle: '没查到 LoRA', sections: [] })
      return true
    }
    await replyCard(e, {
      title: '可用 LoRA',
      subtitle: `共 ${list.length} 个`,
      sections: [{ title: 'LoRA 列表', items: list.map((n) => ({ c: n, d: '' })) }],
      config: [{ k: '用法', v: '#绘图 提示词 --lora "文件名" --lora_strength 0.8' }]
    })
    return true
  }
}
