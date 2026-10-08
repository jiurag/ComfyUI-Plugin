import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import { parseCommandString } from '../utils/utils.js'
import { replyCard } from '../utils/render.js'
import { replyParamsMode } from '../utils/draw.js'
import { groupWorkflows, describeWorkflow } from '../utils/workflowInfo.js'

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
        { reg: '^#?用工作流(\\s+.*)?$', fnc: 'setWorkflow', dsc: '切换默认工作流（仅主人）' },
        { reg: '^#?出图参数(\\s+(关闭|完整|只报耗时|耗时|开|关))?$', fnc: 'setParamsMode', dsc: '出图参数回执的三种模式（仅主人）' },
        { reg: '^#?(开启|关闭)(出图参数回执?|参数回执)$', fnc: 'setParamsReply', dsc: '出图参数回执开关（仅主人）' }
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

  async setParamsReply(e) {
    if (!e.isMaster) {
      await e.reply('只有主人才能改这个开关哦')
      return true
    }
    const on = /开启/.test(e.msg)
    const config = Config.getConfig() || {}
    config.reply_params = on ? 'full' : 'none'
    if (!Config.setConfig(config)) {
      await e.reply('写入失败，检查插件目录权限')
      return true
    }
    await e.reply(
      on
        ? '好，出图后会附上一张「本次出图参数」卡片（提示词、种子、步数、耗时）'
        : '好，出图后不再发参数卡片了。想恢复随时发 #开启出图参数，或 #出图参数 耗时',
      true
    )
    return true
  }

  async setParamsMode(e) {
    const config = Config.getConfig() || {}
    const arg = String(e.msg).replace(/^#?出图参数\s*/, '').trim()

    const MODES = {
      关闭: 'none',
      关: 'none',
      完整: 'full',
      开: 'full',
      只报耗时: 'time',
      耗时: 'time'
    }
    const TEXT = {
      none: '关闭（出图后什么都不发）',
      full: '完整参数卡片（提示词、种子、步数…，含耗时）',
      time: '只报耗时（出图完成，耗时 X 秒）'
    }

    if (!arg) {
      const now = replyParamsMode(config)
      await replyCard(e, {
        title: '出图参数回执',
        subtitle: `现在是：${TEXT[now]}`,
        sections: [
          {
            title: '三种模式',
            items: [
              { c: '#出图参数 完整', d: '完整参数卡片（含耗时）' },
              { c: '#出图参数 耗时', d: '只回一句「出图完成，耗时 X 秒」' },
              { c: '#出图参数 关闭', d: '什么都不发' }
            ]
          }
        ],
        config: [{ k: '当前模式', v: TEXT[now] }],
        configTitle: '当前设置'
      }, '出图参数回执')
      return true
    }

    if (!(arg in MODES)) {
      await e.reply(`不认识「${arg}」。可以写：#出图参数 完整 / 耗时 / 关闭`)
      return true
    }
    if (!e.isMaster) {
      await e.reply('只有主人才能改这个哦')
      return true
    }

    const mode = MODES[arg]
    config.reply_params = mode
    if (!Config.setConfig(config)) {
      await e.reply('写入失败，检查插件目录权限')
      return true
    }
    await e.reply(`好，出图参数回执已切成：${TEXT[mode]}`, true)
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
      sections: groupWorkflows(list, config.workflow),
      config: [
        { k: '切换方式', v: '#用工作流 3  或  #用工作流 工作流名' },
        { k: '单次指定', v: '#绘图 提示词 --workflow 3' },
        { k: '说明怎么来的', v: '插件按工作流里的节点自动认的（视频/图片、模型、步数、尺寸、音频）' },
        { k: '想自己加一句', v: 'config.yaml 里 workflow_notes 段：工作流名: 你的说明' }
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
    const info = describeWorkflow(name)
    await replyCard(e, {
      title: '工作流已切换',
      subtitle: `第 ${cur} 个 · ${name}`,
      sections: [
        {
          title: '工作流列表',
          items: list.map((n, i) => ({
            c: `${i + 1}. ${n}`,
            d: (i + 1 === cur ? '← 当前使用 · ' : '') + describeWorkflow(n).note
          }))
        }
      ],
      config: [
        { k: '工作流', v: name },
        { k: '类型', v: info.category },
        { k: '说明', v: info.note }
      ]
    })
    return true
  }
}
