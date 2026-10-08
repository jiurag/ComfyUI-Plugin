import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import { parseCommandString } from '../utils/utils.js'
import { replyCard } from '../utils/render.js'

export class SetDefParam extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-默认绘图参数',
      dsc: '参数与工作流管理',
      event: 'message',
      priority: 1009,
      rule: [
        { reg: '^#?添加默认参数([\\s\\S]*)$', fnc: 'addDefParam', dsc: '追加默认绘图参数' },
        { reg: '^#?删除默认参数([\\s\\S]*)$', fnc: 'delDefParam', dsc: '删除某项默认参数' },
        { reg: '^#?查看默认参数$', fnc: 'examDefParam', dsc: '查看当前默认参数' },
        { reg: '^#?工作流列表$', fnc: 'listWorkflow', dsc: '列出所有工作流模板' },
        { reg: '^#?用工作流(\\s+.*)?$', fnc: 'setWorkflow', dsc: '切换默认工作流（仅主人）' }
      ]
    })
  }

  async addDefParam(e) {
    const defDrawParams = Config.getDefDrawParams() || {}
    const addParams = await parseCommandString(e.msg)
    const newDrawParams = { ...defDrawParams, ...addParams }
    const ok = Config.setDefDrawParams(newDrawParams)
    if (!ok) {
      await e.reply('写入失败，检查插件目录权限')
      return true
    }
    const rows = Object.keys(newDrawParams).map((k) => ({ k, v: String(newDrawParams[k]) }))
    await replyCard(e, {
      title: '默认参数已更新',
      subtitle: `本次改动 ${Object.keys(addParams).length} 项`,
      sections: [
        { title: '本次改动', items: Object.keys(addParams).map((k) => ({ c: '--' + k, d: String(addParams[k]) })) }
      ],
      config: rows
    })
    return true
  }

  async delDefParam(e) {
    const defDrawParams = Config.getDefDrawParams() || {}
    const delParams = e.msg.replace(/^#?删除默认参数/, '').split(/\s+/)
    const removed = []
    delParams.forEach((param) => {
      if (param.startsWith('--')) {
        const key = param.replace('--', '')
        if (key in defDrawParams) {
          delete defDrawParams[key]
          removed.push(key)
        }
      }
    })
    Config.setDefDrawParams(defDrawParams)
    const rows = Object.keys(defDrawParams).map((k) => ({ k, v: String(defDrawParams[k]) }))
    await replyCard(e, {
      title: removed.length ? '默认参数已删除' : '没有匹配到要删除的参数',
      subtitle: removed.join('、') || '（命令里没写对参数名）',
      sections: [],
      config: rows
    })
    return true
  }

  async examDefParam(e) {
    const defDrawParams = Config.getDefDrawParams() || {}
    const keys = Object.keys(defDrawParams)
    await replyCard(e, {
      title: '默认绘图参数',
      subtitle: keys.length ? `共 ${keys.length} 项（群里不写参数时生效）` : '当前为空，出图时会用工作流里的默认值',
      sections: [],
      config: keys.map((k) => ({ k, v: String(defDrawParams[k]) }))
    })
    return true
  }

  async listWorkflow(e) {
    const config = Config.getConfig() || {}
    const list = Config.listWorkflows()
    if (!list.length) {
      await e.reply('还没有工作流模板。\n把 ComfyUI 里「导出(API)」的 json 放进 config/workflows/ 目录即可。')
      return true
    }
    const cur = list.indexOf(config.workflow) + 1
    await replyCard(e, {
      title: 'ComfyUI 工作流列表',
      subtitle: `共 ${list.length} 个 · 当前是第 ${cur || '?'} 个（${config.workflow || '未设置'}）`,
      sections: [
        {
          title: '可用工作流（输入序号即可切换）',
          items: list.map((n, i) => ({
            c: `${i + 1}. ${n}`,
            d: i + 1 === cur ? '← 当前使用' : ''
          }))
        }
      ],
      config: [
        { k: '切换方式', v: '#用工作流 3  或  #用工作流 工作流名' },
        { k: '单次指定', v: '#绘图 提示词 --workflow 3' }
      ]
    })
    return true
  }

  async setWorkflow(e) {
    if (!e.isMaster) {
      await e.reply('只有主人才能切换工作流哦')
      return true
    }
    const list = Config.listWorkflows()
    const arg = e.msg.replace(/^#?用工作流\s*/, '').trim()
    if (!arg) {
      await e.reply(`用法：#用工作流 序号 或 #用工作流 名字\n现有：\n${list.map((n, i) => `  ${i + 1}. ${n}`).join('\n') || '（空）'}`)
      return true
    }
    // 支持直接用序号切换
    let name = arg
    if (/^\d+$/.test(arg)) {
      const idx = Number(arg)
      if (idx < 1 || idx > list.length) {
        await e.reply(`序号超出范围：一共只有 ${list.length} 个工作流（1 ~ ${list.length}）`)
        return true
      }
      name = list[idx - 1]
    }
    if (!list.includes(name)) {
      await e.reply(`没有这个工作流：${name}\n现有：${list.join('、') || '（空）'}`)
      return true
    }
    const config = Config.getConfig()
    config.workflow = name
    Config.setConfig(config)
    const cur = list.indexOf(name) + 1
    await replyCard(e, {
      title: '工作流已切换',
      subtitle: `第 ${cur} 个 · ${name}`,
      sections: [
        {
          title: '工作流列表',
          items: list.map((n, i) => ({ c: `${i + 1}. ${n}`, d: i + 1 === cur ? '← 当前使用' : '' }))
        }
      ],
      config: [{ k: '工作流', v: name }]
    })
    return true
  }
}
