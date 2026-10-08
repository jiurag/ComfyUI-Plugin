/**
 * 使用白名单管理（只有机器人主人能用）
 *
 *   #绘图白名单                  看当前设置
 *   #开启绘图白名单 / #关闭绘图白名单
 *   #添加绘图白名单 群 123456     也可以用「本群」；私聊可以用 @某人 或「我」
 *   #删除绘图白名单 群 123456
 *
 * 白名单开着的时候，不在名单里的群/人发任何绘图指令都会被拦掉（回一句提示）。
 * 机器人主人始终放行，所以不会出现"把自己关在外面"的情况。
 */

import { ComfyPlugin as plugin } from '../utils/base.js'
import { getWhitelist, setWhitelist, normalizeList } from '../utils/whitelist.js'
import { replyCard } from '../utils/render.js'

export class Whitelist extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-白名单',
      dsc: '管理谁能使用绘图插件',
      event: 'message',
      priority: 1009,
      rule: [
        { reg: '^#?绘图白名单\\s*(静默|不回复|不响应)$', fnc: 'silent', dsc: '被拦下时完全不回复' },
        { reg: '^#?绘图白名单\\s*(提示|回复)$', fnc: 'hint', dsc: '被拦下时回一句提示' },
        { reg: '^#?绘图白名单$', fnc: 'show', dsc: '查看使用白名单' },
        { reg: '^#?开启绘图白名单$', fnc: 'enable', dsc: '开启使用白名单' },
        { reg: '^#?关闭绘图白名单$', fnc: 'disable', dsc: '关闭使用白名单' },
        { reg: '^#?添加绘图白名单[\\s\\S]*$', fnc: 'add', dsc: '加白名单（仅主人）' },
        { reg: '^#?删除绘图白名单[\\s\\S]*$', fnc: 'remove', dsc: '删白名单（仅主人）' }
      ]
    })
  }

  /** 只有主人能改 */
  async _masterOnly(e) {
    if (e.isMaster) return false
    await e.reply('只有主人才能改白名单哦')
    return true
  }

  /**
   * 解析「群 123456 / 本群 / @某人 / 我」这类写法
   * 只说一个数字时不带范围，默认按当前会话类型算
   */
  _parse(e, arg) {
    const parts = String(arg || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)

    let scope = null
    let id = ''

    if (e.at) {
      scope = 'user'
      id = String(e.at)
    }

    for (const p of parts) {
      if (/^(群|群聊|group)$/i.test(p)) scope = 'group'
      else if (/^(私聊|人|用户|user)$/i.test(p)) scope = 'user'
      else if (/^(本群|这个群|当前群)$/.test(p)) {
        scope = 'group'
        id = String(e.group_id || '')
      } else if (/^(我|本人|自己|me)$/i.test(p)) {
        scope = 'user'
        id = String(e.user_id || '')
      } else if (/^\[CQ:at,qq=(\d+)\]$/.test(p)) {
        scope = 'user'
        id = p.replace(/\D/g, '')
      } else if (/^\d{5,12}$/.test(p)) {
        id = p
      }
    }

    if (!scope) scope = e.group_id ? 'group' : 'user'
    if (!id) id = String((scope === 'group' ? e.group_id : e.user_id) || '')
    return { scope, id }
  }

  async show(e) {
    const wl = getWhitelist()
    await replyCard(e, {
      title: '绘图使用白名单',
      subtitle: wl.enable
        ? `已开启：只有名单里的人能用（${wl.reply ? '被拦会提示一句' : '被拦完全不理'}）`
        : '未开启：所有人都能用',
      sections: [
        {
          title: `允许使用的群（${wl.groups.length} 个）`,
          items: wl.groups.length
            ? wl.groups.map((g) => ({ c: g, d: '' }))
            : [{ c: '（空）', d: '还没加群' }]
        },
        {
          title: `允许私聊的 QQ（${wl.users.length} 个）`,
          items: wl.users.length
            ? wl.users.map((u) => ({ c: u, d: '' }))
            : [{ c: '（空）', d: '还没加人' }]
        }
      ],
      config: [
        { k: '开关', v: wl.enable ? '已开启' : '已关闭' },
        { k: '被拦时', v: wl.reply ? '回一句提示' : '完全不回复' },
        { k: '加群', v: '#添加绘图白名单 群 123456  或  #添加绘图白名单 本群' },
        { k: '加人', v: '#添加绘图白名单 私聊 123456  或  #添加绘图白名单 @某人' },
        { k: '删掉', v: '#删除绘图白名单 群 123456' },
        { k: '开关命令', v: '#开启绘图白名单 / #关闭绘图白名单' },
        { k: '拦不拦提示', v: '#绘图白名单 静默  /  #绘图白名单 提示' },
        { k: '注意', v: '机器人主人始终放行，不会被锁在外面' }
      ],
      configTitle: '怎么改'
    }, '绘图使用白名单')
    return true
  }

  /** 被拦下时一声不吭（默认就是这个） */
  async silent(e) {
    if (await this._masterOnly(e)) return true
    setWhitelist({ reply: false })
    await e.reply('好，名单外的群/人发绘图指令将完全不回复（其它插件照常工作，不受影响）', true)
    return true
  }

  /** 被拦下时回一句提示（想看群号的时候用） */
  async hint(e) {
    if (await this._masterOnly(e)) return true
    setWhitelist({ reply: true })
    await e.reply('好，名单外的群/人发指令会收到一句「还没开通绘图功能」的提示', true)
    return true
  }

  async enable(e) {
    if (await this._masterOnly(e)) return true
    setWhitelist({ enable: true })
    const wl = getWhitelist()
    await e.reply(
      `已开启使用白名单：现在只有名单里的群/人能用（群里 ${wl.groups.length} 个、私聊 ${wl.users.length} 个）。\n` +
        '机器人主人始终放行。加名单：#添加绘图白名单 本群',
      true
    )
    return true
  }

  async disable(e) {
    if (await this._masterOnly(e)) return true
    setWhitelist({ enable: false })
    await e.reply('已关闭使用白名单：所有人都能用绘图功能了', true)
    return true
  }

  async add(e) {
    if (await this._masterOnly(e)) return true
    const arg = e.msg.replace(/^#?添加绘图白名单/, '')
    const { scope, id } = this._parse(e, arg)
    if (!id) {
      await e.reply('没认出要加谁。写法：\n#添加绘图白名单 本群\n#添加绘图白名单 群 123456\n#添加绘图白名单 @某人')
      return true
    }

    const wl = getWhitelist()
    const list = scope === 'group' ? wl.groups : wl.users
    if (list.includes(id)) {
      await e.reply(`${scope === 'group' ? '这个群' : '这个人'}（${id}）已经在白名单里了`)
      return true
    }
    const next = [...list, id]
    setWhitelist(scope === 'group' ? { groups: next } : { users: next })
    await e.reply(
      `已加入${scope === 'group' ? '群白名单' : '私聊白名单'}：${id}\n` +
        `现在共 ${next.length} 个。${getWhitelist().enable ? '' : '（注意：白名单总开关还没开，发 #开启绘图白名单 才生效）'}`,
      true
    )
    return true
  }

  async remove(e) {
    if (await this._masterOnly(e)) return true
    const arg = e.msg.replace(/^#?删除绘图白名单/, '')
    const { scope, id } = this._parse(e, arg)
    const wl = getWhitelist()
    const list = scope === 'group' ? wl.groups : wl.users
    const next = normalizeList(list).filter((x) => x !== id)
    if (next.length === list.length) {
      await e.reply(`${id} 本来就不在${scope === 'group' ? '群' : '私聊'}白名单里`)
      return true
    }
    setWhitelist(scope === 'group' ? { groups: next } : { users: next })
    await e.reply(`已从${scope === 'group' ? '群白名单' : '私聊白名单'}移除：${id}`, true)
    return true
  }
}
