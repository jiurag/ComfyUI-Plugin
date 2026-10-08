/**
 * 重绘：复用「上次画的那张」的提示词和参数，再跑一遍
 *
 *   #重绘                  原样再来一张（种子重新随机，所以是张新图）
 *   #重绘 --steps 12       复用上次的，但这次只改步数
 *   #重绘 换成雪天          复用上次的参数，只换提示词
 *   #上次提示词            看看上次用的到底是什么提示词
 *   #忘记上次绘图          清掉记录
 *
 * 记录按群（群聊）/按人（私聊）存，成功出图时才记，最多留 12 小时。
 */

import { ComfyPlugin as plugin } from '../utils/base.js'
import Config from '../components/Config.js'
import { parseCommandString, parseSize, extractPrompt, preferRatioOverDefaultSize } from '../utils/utils.js'
import { translate } from '../utils/translate.js'
import { runDraw } from '../utils/draw.js'
import { replyCard } from '../utils/render.js'
import { lastDrawKey, getLast, saveLast, clearLast, lastDrawRows } from '../utils/lastDraw.js'

/** 命令头，取提示词时要剥掉 */
const HEADS = ['重绘', '再画一张', '再来一张', 'redraw']

export class Redraw extends plugin {
  constructor() {
    super({
      name: 'ComfyUI-重绘',
      dsc: '复用上次的提示词再画一张',
      event: 'message',
      priority: 1009,
      rule: [
        {
          reg: '^#?(重绘|再画一张|再来一张|redraw)(\\s+[\\s\\S]*)?$',
          fnc: 'redraw',
          dsc: '用上次的提示词/参数再画一张，可另外追加 --参数 临时覆盖'
        },
        {
          reg: '^#?(上次提示词|查看上次绘图|上次画了什么)$',
          fnc: 'showLast',
          dsc: '看看上次这张用的是什么提示词'
        },
        {
          reg: '^#?忘记上次绘图$',
          fnc: 'forgetLast',
          dsc: '清掉本群/本人的上次绘图记录'
        }
      ]
    })
  }

  async redraw(e) {
    const key = lastDrawKey(e)
    const last = getLast(key)
    if (!last) {
      await e.reply('这里还没有画过图哦～\n先用 #绘图 提示词 画一张，之后就能用 #重绘 再来了')
      return true
    }

    const config = (await Config.getConfig()) || {}
    const parsed = await parseCommandString(e.msg)

    // 以「上次的参数」为底，命令里临时写的 --参数 覆盖上去
    const params = { ...last.params }
    for (const [k, v] of Object.entries(parsed)) {
      if (k === 'size') continue
      params[k] = v
    }
    const size = parseSize(parsed.size)
    if (size) {
      params.width = size.width
      params.height = size.height
    }
    delete params.size
    // 这次写了 --ratio 却没写尺寸：把上次记下来的宽高摘掉，按比例重新算
    preferRatioOverDefaultSize(params, parsed)

    // #重绘 后面直接写字 = 只换提示词，其它照旧
    const inline = extractPrompt(e.msg, HEADS)
    if (inline) params.prompt = await translate(inline)

    // 没明确指定种子就重新随机（重绘的意义就是要不一样的图）
    if (parsed.seed === undefined) delete params.seed

    if (!params.prompt) {
      await e.reply('上次那条没留下提示词，重新用 #绘图 画一张吧')
      return true
    }

    await e.reply(
      `重绘中：复用${last.who ? ` ${last.who} ` : ''}上次的提示词` +
        `${Object.keys(parsed).filter((k) => k !== 'size').length ? `（另外改了 ${Object.keys(parsed).filter((k) => k !== 'size').map((k) => '--' + k).join(' ')}）` : ''}` +
        '，正在生成…',
      true
    )

    const r = await runDraw(e, params, config)
    if (r.ok) {
      // 更新记录：这样连续 #重绘 会一直在最新的这套参数上再来
      saveLast(key, {
        who: last.who,
        userId: last.userId,
        raw: inline || last.raw,
        applied: r.parameters,
        params: { ...params, ...(r.workflow ? { workflow: r.workflow } : {}) }
      })
    }
    return true
  }

  async showLast(e) {
    const last = getLast(lastDrawKey(e))
    if (!last) {
      await e.reply('这里还没有画过图哦～先用 #绘图 画一张吧')
      return true
    }
    await replyCard(e, {
      title: '上次画的这张',
      subtitle: '发 #重绘 就能照这个再来一张',
      sections: [],
      config: lastDrawRows(last, [
        { k: '再来一张', v: '#重绘' },
        { k: '改点参数', v: '#重绘 --steps 12 --size 832x1216' },
        { k: '只换提示词', v: '#重绘 换成雪天' }
      ]),
      configTitle: '上次的提示词与参数'
    }, '上次的提示词')
    return true
  }

  async forgetLast(e) {
    const key = lastDrawKey(e)
    const had = clearLast(key)
    await e.reply(had ? '好的，已经忘掉上次的绘图记录了' : '本来就没有记录哦')
    return true
  }
}
